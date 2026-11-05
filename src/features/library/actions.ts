'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { deleteFile } from '@/lib/gdrive/drive';
import { withFlash } from '@/lib/flash';
import { dbMessage, FORBIDDEN, type FormState } from '@/lib/form-state';
import { LIBRARY_MAX_TITLE, LIBRARY_VISIBILITIES } from '@/lib/library/shared';
import { fail, type ActionResult } from '@/lib/result';
import { copyObject } from '@/lib/storage/copy';
import { removeObject } from '@/lib/storage/upload';
import { idOf } from '@/lib/zod-fields';

const idsSchema = z.array(z.string().uuid()).min(1).max(100);
const visibilitySchema = z.object({
  ids: idsSchema,
  visibility: z.enum(LIBRARY_VISIBILITIES),
  memberIds: z.array(z.string().uuid()).max(200),
});
const renameSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(LIBRARY_MAX_TITLE),
});

const notify = () => {
  revalidatePath('/library');
  revalidatePath('/settings/profile');
  revalidatePath('/settings/portfolio');
};

export async function setLibraryVisibility(input: unknown): Promise<ActionResult> {
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return fail('validation', 'Pilihan visibilitas tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', FORBIDDEN);
  if (parsed.data.visibility !== 'specific' && parsed.data.memberIds.length > 0) {
    return fail('validation', 'Anggota hanya bisa dipilih untuk visibilitas "Anggota tertentu".');
  }

  const { error } = await ctx.supabase.rpc('set_library_visibility', {
    p_ids: parsed.data.ids,
    p_visibility: parsed.data.visibility,
    p_member_ids: parsed.data.memberIds,
  });
  if (error) {
    console.error('setLibraryVisibility', error.code);
    if (error.code === 'EC090') return fail('validation', 'Pilih minimal satu anggota.');
    if (error.code === '42501') return fail('forbidden', 'Hanya pemilik gambar yang bisa mengubah visibilitas.');
    return fail('unknown', dbMessage(error));
  }
  notify();
  return { ok: true, data: undefined };
}

export async function renameLibraryItem(input: unknown): Promise<ActionResult> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Judul tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', FORBIDDEN);

  const { data, error } = await ctx.supabase.from('library_items')
    .update({ title: parsed.data.title, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id).eq('owner_id', ctx.user.id).select('id');
  if (error) {
    console.error('renameLibraryItem', error.code);
    return fail('unknown', dbMessage(error));
  }
  if (!data?.length) return fail('not_found', 'Gambar tidak ditemukan.');
  notify();
  return { ok: true, data: undefined };
}

// Hapus baris dulu (otorisasi + referensi), baru objek Storage dan file Drive.
// Salinan yang sudah dipakai di form lain punya path sendiri dan tidak terpengaruh.
export async function deleteLibraryItems(input: string[]): Promise<ActionResult<{ removed: number }>> {
  const parsed = idsSchema.safeParse(input);
  if (!parsed.success) return fail('validation', 'Pilih gambar yang ingin dihapus.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', FORBIDDEN);

  const { data: rows, error: readError } = await ctx.supabase.from('library_items')
    .select('storage_path,drive_file_id')
    .in('id', parsed.data).eq('owner_id', ctx.user.id);
  if (readError) {
    console.error('deleteLibraryItems: baca', readError.code);
    return fail('unknown', 'Gambar tidak dapat diperiksa. Coba lagi.');
  }

  const { data: deleted, error } = await ctx.supabase.from('library_items')
    .delete().in('id', parsed.data).eq('owner_id', ctx.user.id).select('id');
  if (error) {
    console.error('deleteLibraryItems', error.code);
    return fail('unknown', dbMessage(error));
  }

  for (const row of (rows ?? []) as { storage_path: string; drive_file_id: string | null }[]) {
    await removeObject(ctx.supabase, 'member-media', row.storage_path);
    if (row.drive_file_id) {
      await deleteFile(row.drive_file_id).catch(() => console.error('deleteLibraryItems: file Drive gagal dihapus'));
    }
  }
  notify();
  return { ok: true, data: { removed: deleted?.length ?? 0 } };
}

// ---- Pakai ulang media Library di form gambar lain ---------------------------
// Salinan dibuat di folder form tujuan, lalu path baris form diganti. Item Library
// tetap utuh sehingga bisa dipakai lagi di form lain.

async function ownedLibraryPath(ctx: NonNullable<Awaited<ReturnType<typeof requireActionContext>>>, id: string) {
  const { data } = await ctx.supabase.from('library_items')
    .select('storage_path').eq('id', id).eq('owner_id', ctx.user.id).maybeSingle();
  return (data as { storage_path: string } | null)?.storage_path ?? null;
}

export async function applyLibraryToAvatar(_p: FormState, fd: FormData): Promise<FormState> {
  const libId = z.string().uuid().safeParse(fd.get('library_id'));
  if (!libId.success) return { error: 'Pilih gambar dari Library.' };
  const ctx = await requireActionContext();
  if (!ctx) return { error: FORBIDDEN };

  const source = await ownedLibraryPath(ctx, libId.data);
  if (!source) return { error: 'Gambar itu tidak ada di Library-mu.' };

  const { data: profile } = await ctx.supabase.from('member_profiles')
    .select('avatar_path').eq('class_id', ctx.classId).eq('user_id', ctx.user.id).maybeSingle();
  const old = (profile as { avatar_path: string | null } | null)?.avatar_path ?? null;

  const copied = await copyObject({
    supabase: ctx.supabase, bucket: 'member-media', from: source,
    dir: `${ctx.classId}/${ctx.user.id}/avatar`,
  });
  if (!copied.ok) return { error: copied.message };

  const { data, error } = await ctx.supabase.from('member_profiles')
    .update({ avatar_path: copied.path })
    .eq('class_id', ctx.classId).eq('user_id', ctx.user.id).select('user_id');
  if (error || !data?.length) {
    await removeObject(ctx.supabase, 'member-media', copied.path);
    if (error) console.error('applyLibraryToAvatar', error.code);
    return { error: error ? dbMessage(error) : 'Profil tidak ditemukan.' };
  }

  await removeObject(ctx.supabase, 'member-media', old);
  revalidatePath('/settings/profile');
  revalidatePath('/members');
  notify();
  redirect(withFlash('/settings/profile', 'uploaded'));
}

export async function applyLibraryToPortfolio(_p: FormState, fd: FormData): Promise<FormState> {
  const itemId = idOf(fd);
  const libId = z.string().uuid().safeParse(fd.get('library_id'));
  if (!itemId || !libId.success) return { error: 'Pilih gambar dari Library.' };
  const ctx = await requireActionContext();
  if (!ctx) return { error: FORBIDDEN };

  const { data: item } = await ctx.supabase.from('portfolio_items')
    .select('media_path').eq('id', itemId).eq('user_id', ctx.user.id).maybeSingle();
  if (!item) return { error: 'Item portofolio tidak ditemukan.' };
  const old = (item as { media_path: string | null }).media_path;

  const source = await ownedLibraryPath(ctx, libId.data);
  if (!source) return { error: 'Gambar itu tidak ada di Library-mu.' };

  const copied = await copyObject({
    supabase: ctx.supabase, bucket: 'member-media', from: source,
    dir: `${ctx.classId}/${ctx.user.id}/portfolio`,
  });
  if (!copied.ok) return { error: copied.message };

  const { data, error } = await ctx.supabase.from('portfolio_items')
    .update({ media_path: copied.path }).eq('id', itemId).eq('user_id', ctx.user.id).select('id');
  if (error || !data?.length) {
    await removeObject(ctx.supabase, 'member-media', copied.path);
    if (error) console.error('applyLibraryToPortfolio', error.code);
    return { error: error ? dbMessage(error) : 'Item portofolio tidak ditemukan.' };
  }

  await removeObject(ctx.supabase, 'member-media', old);
  revalidatePath('/settings/portfolio');
  revalidatePath('/settings/profile');
  revalidatePath('/members');
  notify();
  redirect(withFlash(`/settings/portfolio/${itemId}/edit`, 'uploaded'));
}
