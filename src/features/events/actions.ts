'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActionContext } from '@/lib/action-context';
import { runSave } from '@/lib/crud';
import { EVENT_PHOTO_LIMIT } from '@/lib/events';
import { withFlash } from '@/lib/flash';
import { dbMessage, FORBIDDEN, failState, type FormState } from '@/lib/form-state';
import { signMany } from '@/lib/storage/sign';
import { removeObject, uploadImage } from '@/lib/storage/upload';
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

// Hapus event beserta objek Storage foto dan thumbnail-nya. Baris event_photos
// ikut terhapus lewat ON DELETE CASCADE; objek bucket tidak, jadi path harus
// dikumpulkan sebelum barisnya hilang.
export async function deleteEvent(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  const ctx = await requireActionContext();
  if (!id || !ctx?.can('events.manage')) return failState(FORBIDDEN, fd);

  const [photos, event] = await Promise.all([
    ctx.supabase.from('event_photos').select('path').eq('event_id', id),
    ctx.supabase.from('events').select('cover_path').eq('id', id).maybeSingle(),
  ]);
  const { data, error } = await ctx.supabase.from('events').delete().eq('id', id).select('id');
  if (error) { console.error('events delete', error.code); return failState(dbMessage(error), fd); }
  if (!data?.length) return failState('Data tidak ditemukan.', fd); // 0 baris = gagal

  const paths = new Set<string>();
  for (const row of (photos.data ?? []) as { path: string }[]) paths.add(row.path);
  const cover = (event.data as { cover_path: string | null } | null)?.cover_path;
  if (cover) paths.add(cover);
  await Promise.all([...paths].map((path) => removeObject(ctx.supabase, 'class-media', path)));

  base.paths.forEach((p) => revalidatePath(p));
  redirect(withFlash('/events', 'deleted'));
}

// ---- Foto event (bucket class-media; folder {class_id}/events) ---------------
const photoPaths = (id: string) => ['/events', `/events/${id}`, `/events/${id}/edit`].forEach((p) => revalidatePath(p));

async function photoCtx(fd: FormData) {
  const eventId = z.string().uuid().safeParse(fd.get('event_id'));
  const ctx = await requireActionContext();
  if (!ctx?.can('events.manage') || !eventId.success) return null;
  return { ctx, eventId: eventId.data };
}

export async function addEventPhoto(_p: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get('file');
  if (!(file instanceof File)) return { error: 'Pilih foto terlebih dahulu.' };
  const c = await photoCtx(fd);
  if (!c) return { error: FORBIDDEN };

  const { count } = await c.ctx.supabase.from('event_photos')
    .select('id', { count: 'exact', head: true }).eq('event_id', c.eventId);
  if ((count ?? 0) >= EVENT_PHOTO_LIMIT) return { error: `Maksimal ${EVENT_PHOTO_LIMIT} foto per event.` };

  const up = await uploadImage({ supabase: c.ctx.supabase, bucket: 'class-media', dir: `${c.ctx.classId}/events`, file });
  if (!up.ok) return { error: up.message };

  const { error } = await c.ctx.supabase.from('event_photos').insert({
    class_id: c.ctx.classId, event_id: c.eventId, path: up.path, position: count ?? 0,
  });
  if (error) {
    console.error('addEventPhoto', error.code);
    await removeObject(c.ctx.supabase, 'class-media', up.path); // referensi tidak pernah menunjuk objek yatim
    return { error: dbMessage(error) };
  }
  photoPaths(c.eventId);
  redirect(withFlash(`/events/${c.eventId}/edit`, 'uploaded'));
}

export async function removeEventPhoto(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  const c = await photoCtx(fd);
  if (!id || !c) return { error: FORBIDDEN };

  const { data, error } = await c.ctx.supabase.from('event_photos')
    .delete().eq('id', id).eq('event_id', c.eventId).select('path');
  if (error) { console.error('removeEventPhoto', error.code); return { error: dbMessage(error) }; }
  const path = (data?.[0] as { path: string } | undefined)?.path;
  if (!path) return { error: 'Foto tidak ditemukan.' };

  await removeObject(c.ctx.supabase, 'class-media', path);
  photoPaths(c.eventId);
  redirect(withFlash(`/events/${c.eventId}/edit`, 'removed'));
}

// photo_id kosong = event sengaja tanpa thumbnail.
export async function setEventThumbnail(_p: FormState, fd: FormData): Promise<FormState> {
  const c = await photoCtx(fd);
  if (!c) return { error: FORBIDDEN };

  const raw = fd.get('photo_id');
  let path: string | null = null;
  if (typeof raw === 'string' && raw.length > 0) {
    const photoId = z.string().uuid().safeParse(raw);
    if (!photoId.success) return { error: 'Foto tidak valid.' };
    const { data } = await c.ctx.supabase.from('event_photos')
      .select('path').eq('id', photoId.data).eq('event_id', c.eventId).maybeSingle();
    path = (data as { path: string } | null)?.path ?? null;
    if (!path) return { error: 'Foto tidak ditemukan.' };
  }

  const { data, error } = await c.ctx.supabase.from('events')
    .update({ cover_path: path }).eq('id', c.eventId).select('id');
  if (error) { console.error('setEventThumbnail', error.code); return { error: dbMessage(error) }; }
  if (!data?.length) return { error: 'Event tidak ditemukan.' };

  photoPaths(c.eventId);
  redirect(withFlash(`/events/${c.eventId}/edit`, 'saved'));
}

export type PhotoViewerState =
  | { ok: true; photos: { id: string; url: string }[] }
  | { ok: false; error: string }
  | null;

// Dipanggil dari tombol "Lihat foto" di kartu event; RLS event_photos menentukan
// siapa yang boleh melihat, jadi tidak perlu pemeriksaan izin tambahan.
export async function listEventPhotos(_p: PhotoViewerState, fd: FormData): Promise<PhotoViewerState> {
  const eventId = z.string().uuid().safeParse(fd.get('event_id'));
  const ctx = await requireActionContext();
  if (!eventId.success) return { ok: false, error: 'Event tidak valid.' };
  if (!ctx) return { ok: false, error: FORBIDDEN };

  const { data, error } = await ctx.supabase.from('event_photos')
    .select('id,path').eq('event_id', eventId.data)
    .order('position').order('created_at');
  if (error) {
    console.error('listEventPhotos', error.code);
    return { ok: false, error: 'Foto belum bisa dimuat. Coba lagi.' };
  }
  const rows = (data ?? []) as { id: string; path: string }[];
  const urls = await signMany(ctx.supabase, 'class-media', rows.map((row) => row.path));
  const photos = rows
    .map((row) => ({ id: row.id, url: urls.get(row.path) ?? '' }))
    .filter((photo) => photo.url.length > 0);
  if (photos.length === 0) return { ok: false, error: 'Belum ada foto yang bisa ditampilkan.' };
  return { ok: true, photos };
}
