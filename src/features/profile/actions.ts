'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, dbMessage, failState, invalid, type FormState } from '@/lib/form-state';
import { clearImage, replaceImage, writeResult } from '@/lib/storage/swap';
import { AUDIENCES, MEMBER_KEYS } from '@/lib/visibility/audiences';
import { optText, reqText } from '@/lib/zod-fields';

const profile = z.object({ full_name: reqText(80, 'Nama'), nickname: optText(40), bio: optText(500) });

export async function updateProfile(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = profile.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  // Identitas pemilik dari sesi, bukan dari form.
  const { data, error } = await ctx.supabase.from('member_profiles').update(parsed.data)
    .eq('class_id', ctx.classId).eq('user_id', ctx.user.id).select('user_id');
  if (error) { console.error('updateProfile', error.code); return failState(dbMessage(error), fd); }
  if (!data?.length) return failState('Data tidak ditemukan.', fd);
  revalidatePath('/settings/profile'); revalidatePath('/members');
  redirect(withFlash('/settings/profile', 'saved'));
}

export async function saveMyVisibility(_p: FormState, fd: FormData): Promise<FormState> {
  const audience = z.enum(AUDIENCES).or(z.literal('')).transform((v) => v || null);
  const rules: { key: string; audience: string | null }[] = [];
  for (const [key] of MEMBER_KEYS) { // hanya kunci dari allowlist; kunci lain dari klien diabaikan
    const r = audience.safeParse(fd.get(`v:${key}`) ?? '');
    if (!r.success) return failState('Pengaturan visibilitas tidak valid.', fd);
    rules.push({ key, audience: r.data });
  }
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('save_my_visibility', { p_rules: rules });
  if (error) { console.error('saveMyVisibility', error.code); return failState(dbMessage(error), fd); }
  revalidatePath('/settings/profile'); revalidatePath('/members');
  redirect(withFlash('/settings/profile', 'saved'));
}

// ---- Foto profil (bucket member-media; path {class_id}/{user_id}/avatar/{uuid}.ext) ----
// Pemilik berasal dari sesi; kolom avatar_path hanya bisa diubah pemiliknya (trigger EC031).
async function avatarCtx() {
  const ctx = await requireActionContext();
  if (!ctx) return null;
  const { data } = await ctx.supabase.from('member_profiles').select('avatar_path').eq('class_id', ctx.classId).eq('user_id', ctx.user.id).maybeSingle();
  const write = async (path: string | null) =>
    writeResult(await ctx.supabase.from('member_profiles').update({ avatar_path: path }).eq('class_id', ctx.classId).eq('user_id', ctx.user.id).select('user_id'));
  return { ctx, old: (data as { avatar_path: string | null } | null)?.avatar_path ?? null, write };
}
const avatarPaths = () => ['/settings/profile', '/members'].forEach((p) => revalidatePath(p));

export async function uploadAvatar(_p: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get('file');
  if (!(file instanceof File)) return { error: 'Pilih gambar terlebih dahulu.' };
  const a = await avatarCtx();
  if (!a) return { error: FORBIDDEN };
  const err = await replaceImage({ supabase: a.ctx.supabase, bucket: 'member-media', dir: `${a.ctx.classId}/${a.ctx.user.id}/avatar`, file, old: a.old, write: a.write });
  if (err) return err;
  avatarPaths();
  redirect(withFlash('/settings/profile', 'uploaded'));
}

export async function removeAvatar(_p: FormState, _fd: FormData): Promise<FormState> {
  const a = await avatarCtx();
  if (!a) return { error: FORBIDDEN };
  const err = await clearImage({ supabase: a.ctx.supabase, bucket: 'member-media', old: a.old, write: a.write });
  if (err) return err;
  avatarPaths();
  redirect(withFlash('/settings/profile', 'removed'));
}
