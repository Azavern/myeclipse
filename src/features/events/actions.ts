'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActionContext } from '@/lib/action-context';
import { runDelete, runSave } from '@/lib/crud';
import { withFlash } from '@/lib/flash';
import { clearImage, replaceImage, writeResult } from '@/lib/storage/swap';
import { FORBIDDEN, failState, type FormState } from '@/lib/form-state';
import { localToUtc } from '@/lib/time';
import { idOf, localDateTime, optText, optUrl, reqText } from '@/lib/zod-fields';

const schema = z.object({
  title: reqText(120, 'Judul'), description: optText(2000),
  start_at: localDateTime, end_at: localDateTime,
  location: optText(120), organizer: optText(80), url: optUrl,
}).refine((v) => v.end_at >= v.start_at, { message: 'Waktu selesai tidak boleh sebelum waktu mulai.', path: ['end_at'] });
type D = z.infer<typeof schema>;
const base = {
  perm: 'events.manage', table: 'events', schema, paths: ['/events', '/schedule', '/'], to: '/events',
  build: (d: D, tz: string) => ({ ...d, start_at: localToUtc(d.start_at, tz), end_at: localToUtc(d.end_at, tz) }),
};

export async function createEvent(_p: FormState, fd: FormData) { return runSave({ ...base, fd }); }
export async function updateEvent(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  return id ? runSave({ ...base, fd, id }) : failState('Data tidak ditemukan.', fd);
}
export async function deleteEvent(_p: FormState, fd: FormData) {
  return runDelete({ fd, id: idOf(fd), perm: base.perm, table: base.table, paths: base.paths, to: base.to });
}

// ---- Sampul event (bucket class-media; path {class_id}/events/{uuid}.ext; policy: events.manage) ----
async function coverCtx(fd: FormData) {
  const id = idOf(fd);
  const ctx = await requireActionContext();
  if (!id || !ctx?.can('events.manage')) return null;
  const { data } = await ctx.supabase.from('events').select('cover_path').eq('id', id).maybeSingle();
  if (!data) return null;
  const write = async (path: string | null) =>
    writeResult(await ctx.supabase.from('events').update({ cover_path: path }).eq('id', id).select('id'));
  return { ctx, id, old: (data as { cover_path: string | null }).cover_path, write, back: `/events/${id}/edit` };
}
const coverPaths = (id: string) => ['/events', `/events/${id}`, '/'].forEach((p) => revalidatePath(p));

export async function uploadEventCover(_p: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get('file');
  if (!(file instanceof File)) return { error: 'Pilih gambar terlebih dahulu.' };
  const c = await coverCtx(fd);
  if (!c) return { error: FORBIDDEN };
  const err = await replaceImage({ supabase: c.ctx.supabase, bucket: 'class-media', dir: `${c.ctx.classId}/events`, file, old: c.old, write: c.write });
  if (err) return err;
  coverPaths(c.id);
  redirect(withFlash(c.back, 'uploaded'));
}

export async function removeEventCover(_p: FormState, fd: FormData): Promise<FormState> {
  const c = await coverCtx(fd);
  if (!c) return { error: FORBIDDEN };
  const err = await clearImage({ supabase: c.ctx.supabase, bucket: 'class-media', old: c.old, write: c.write });
  if (err) return err;
  coverPaths(c.id);
  redirect(withFlash(c.back, 'removed'));
}
