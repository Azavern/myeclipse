import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { LIBRARY_MAX_PREVIEW_BYTES } from '@/lib/library/shared';
import { detectImage } from './magic-bytes';

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Menyalin objek Storage milik Library ke folder form lain. Salinan dibuat
// terpisah supaya menghapus item Library tidak merusak gambar di profil atau
// portofolio yang sudah memakainya.
export async function copyObject(o: {
  supabase: Supabase; bucket: string; from: string; dir: string;
}): Promise<{ ok: true; path: string; mime: string } | { ok: false; message: string }> {
  const { data, error } = await o.supabase.storage.from(o.bucket).download(o.from);
  if (error || !data) {
    console.error('copyObject: gambar sumber tidak terbaca');
    return { ok: false, message: 'Gambar sumber tidak dapat dibaca. Coba lagi.' };
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const type = detectImage(bytes);
  if (!type) return { ok: false, message: 'Isi gambar sumber tidak dikenali.' };
  if (bytes.byteLength > LIBRARY_MAX_PREVIEW_BYTES) {
    return { ok: false, message: 'Gambar sumber melebihi batas 2 MB.' };
  }

  const path = `${o.dir}/${crypto.randomUUID()}.${type.ext}`;
  const up = await o.supabase.storage.from(o.bucket).upload(path, bytes, {
    upsert: false, contentType: type.mime,
  });
  if (up.error) {
    console.error('copyObject: unggah salinan gagal');
    return { ok: false, message: 'Gambar belum bisa dipakai di form ini. Coba lagi.' };
  }
  return { ok: true, path, mime: type.mime };
}
