import 'server-only';
import type { createClient } from '@/lib/supabase/server';

// URL bertanda tangan 1 jam, batch, lewat client JWT user (policy Storage ikut dievaluasi). Gagal -> UI memakai fallback.
export async function signMany(supabase: Awaited<ReturnType<typeof createClient>>, bucket: string, paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  const out = new Map<string, string>();
  if (list.length === 0) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(list, 3600);
  data?.forEach((d: { path: string | null; signedUrl: string | null }) => { if (d.path && d.signedUrl) out.set(d.path, d.signedUrl); }); // signedUrl bisa null: hanya simpan yang valid
  return out;
}

// Katalog Library menyimpan path tanpa bucket, sedangkan tanda tangan Storage
// selalu per bucket. Kunci hasilnya `${bucket}:${path}` supaya path yang sama di
// bucket berbeda tidak saling menimpa.
export const signedKey = (bucket: string, path: string) => `${bucket}:${path}`;

export async function signByBucket(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: { bucket: string; storage_path: string }[],
) {
  const perBucket = new Map<string, string[]>();
  for (const row of rows) {
    const list = perBucket.get(row.bucket) ?? [];
    list.push(row.storage_path);
    perBucket.set(row.bucket, list);
  }
  const out = new Map<string, string>();
  await Promise.all([...perBucket].map(async ([bucket, paths]) => {
    const urls = await signMany(supabase, bucket, paths);
    for (const [path, url] of urls) out.set(signedKey(bucket, path), url);
  }));
  return out;
}
