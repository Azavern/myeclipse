'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { deleteFile } from '@/lib/gdrive/drive';
import { dbMessage, FORBIDDEN } from '@/lib/form-state';
import { LIBRARY_MAX_TITLE, LIBRARY_VISIBILITIES } from '@/lib/library/shared';
import { fail, type ActionResult } from '@/lib/result';
import type { createClient } from '@/lib/supabase/server';
import { removeObject } from '@/lib/storage/upload';

type Supabase = Awaited<ReturnType<typeof createClient>>;

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

// Objek `class-media` bisa dipakai logo/sampul kelas, sampul event, atau foto
// event. Menghapus baris katalog tidak boleh memutus halaman itu, jadi objeknya
// hanya dibuang bila tidak ada rujukan yang tersisa. Saat pemeriksaan gagal,
// anggap masih dipakai (lebih aman menyisakan objek daripada merusak halaman).
async function usedClassMedia(supabase: Supabase, paths: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  if (paths.length === 0) return used;
  const results = await Promise.all([
    supabase.from('classes').select('logo_path').in('logo_path', paths),
    supabase.from('classes').select('cover_path').in('cover_path', paths),
    supabase.from('events').select('cover_path').in('cover_path', paths),
    supabase.from('event_photos').select('path').in('path', paths),
  ]);
  if (results.some((result) => result.error)) {
    console.error('deleteLibraryItems: rujukan class-media gagal diperiksa');
    for (const path of paths) used.add(path);
    return used;
  }
  for (const result of results) {
    for (const row of (result.data ?? []) as Record<string, string | null>[]) {
      for (const value of Object.values(row)) if (value) used.add(value);
    }
  }
  return used;
}

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
    .select('storage_path,bucket,drive_file_id')
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

  const owned = (rows ?? []) as { storage_path: string; bucket: string; drive_file_id: string | null }[];
  const classPaths = owned.filter((row) => row.bucket === 'class-media').map((row) => row.storage_path);
  const used = await usedClassMedia(ctx.supabase, classPaths);

  for (const row of owned) {
    if (row.bucket !== 'class-media' || !used.has(row.storage_path)) {
      await removeObject(ctx.supabase, row.bucket, row.storage_path);
    }
    if (row.drive_file_id) {
      await deleteFile(row.drive_file_id).catch(() => console.error('deleteLibraryItems: file Drive gagal dihapus'));
    }
  }
  notify();
  return { ok: true, data: { removed: deleted?.length ?? 0 } };
}
