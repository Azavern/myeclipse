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
