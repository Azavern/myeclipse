import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { mfaPending } from '@/lib/auth/mfa';
import { createClient } from '@/lib/supabase/server';

type VisRow = { key: string; allowed: boolean };
type ViewerRow = { status: string | null; permissions: string[] | null };

// Evaluasi visibility tetap di SQL (get_visibility_map); di sini hanya dibaca (blueprint §3.2-5).
export const getVisibilityMap = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_visibility_map');
  return new Map(((data ?? []) as VisRow[]).map((r) => [r.key, r.allowed]));
});

export const getViewer = cache(async () => {
  const supabase = await createClient();
  const [auth, ctx] = await Promise.all([supabase.auth.getUser(), supabase.rpc('get_viewer_context')]);
  const row = ((ctx.data ?? []) as ViewerRow[])[0];
  const permissions = row?.permissions ?? [];
  const pending = auth.data.user ? await mfaPending(supabase) : false;
  return { user: auth.data.user, status: row?.status ?? null, mfaPending: pending, can: (p: string) => permissions.includes(p) };
});

export async function canShow(key: string) {
  return (await getVisibilityMap()).get(key) === true;
}

// true = boleh. Anonim yang tidak berhak diarahkan ke login; yang sudah login mendapat NoAccess.
export async function requireView(key: string, next: string) {
  if (await canShow(key)) return true;
  if (!(await getViewer()).user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return false;
}
