import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { dbMessage } from '@/lib/form-state';
import { removeObject, uploadImage } from './upload';

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type WriteResult = { ok: true } | { ok: false; message: string };

// Mengubah hasil update `.select()` menjadi WriteResult: galat DB atau 0 baris = gagal (AGENTS.md §8).
export const writeResult = (r: { data: unknown[] | null; error: { code?: string } | null }): WriteResult => {
  if (r.error) { console.error('writeImage', r.error.code); return { ok: false, message: dbMessage(r.error) }; }
  return r.data?.length ? { ok: true } : { ok: false, message: 'Data tidak ditemukan.' };
};

// Urutan aman: unggah objek baru -> simpan path di baris -> baru hapus objek lama.
// Bila penyimpanan baris gagal, objek baru dibersihkan; referensi tidak pernah menunjuk ke objek yang belum ada.
export async function replaceImage(o: {
  supabase: Supabase; bucket: string; dir: string; file: File; old: string | null; write: (path: string) => Promise<WriteResult>;
}): Promise<{ error: string } | null> {
  const up = await uploadImage({ supabase: o.supabase, bucket: o.bucket, dir: o.dir, file: o.file });
  if (!up.ok) return { error: up.message };
  const w = await o.write(up.path);
  if (!w.ok) { await removeObject(o.supabase, o.bucket, up.path); return { error: w.message }; }
  await removeObject(o.supabase, o.bucket, o.old);
  return null;
}

// Hapus referensi lebih dulu, objek sesudahnya; objek yang gagal dihapus menjadi yatim, bukan referensi rusak.
export async function clearImage(o: {
  supabase: Supabase; bucket: string; old: string | null; write: (path: null) => Promise<WriteResult>;
}): Promise<{ error: string } | null> {
  const w = await o.write(null);
  if (!w.ok) return { error: w.message };
  await removeObject(o.supabase, o.bucket, o.old);
  return null;
}
