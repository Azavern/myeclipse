import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { detectImage } from './magic-bytes';

type Supabase = Awaited<ReturnType<typeof createClient>>;
const MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_ERROR = 'Gambar harus JPEG, PNG, atau WebP dan maksimal 2 MB.';

// Path dibuat di server dari id terverifikasi + UUID acak; policy Storage (JWT user) menjadi otorisasi (blueprint §13.4).
export async function uploadImage(o: { supabase: Supabase; bucket: string; dir: string; file: File }):
  Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  if (o.file.size === 0 || o.file.size > MAX_BYTES) return { ok: false, message: IMAGE_ERROR };
  const buf = new Uint8Array(await o.file.arrayBuffer());
  const type = detectImage(buf);
  if (!type) return { ok: false, message: IMAGE_ERROR };
  const path = `${o.dir}/${crypto.randomUUID()}.${type.ext}`;
  const { error } = await o.supabase.storage.from(o.bucket).upload(path, buf, { upsert: false, contentType: type.mime });
  if (error) { console.error('uploadImage gagal'); return { ok: false, message: 'Gambar belum bisa diunggah. Coba lagi.' }; }
  return { ok: true, path };
}

export async function removeObject(supabase: Supabase, bucket: string, path: string | null | undefined) {
  if (!path) return;
  const { data, error } = await supabase.storage.from(bucket).remove([path]);
  // remove() tidak melempar galat saat policy RLS menyaring objeknya: hasil kosong berarti tidak ada yang terhapus.
  if (error || !data?.length) console.error('removeObject: objek tidak terhapus'); // objek yatim tidak disapu otomatis (D-13)
}
