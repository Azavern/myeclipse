import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

// Callback OAuth (PKCE). Google hanya membuktikan identitas: setelah sesi
// ditukar, email harus terverifikasi dan keanggotaan harus aktif. Tidak ada
// role, profil, atau membership yang dibuat di sini.
export const dynamic = 'force-dynamic';

type ViewerRow = { status: string | null };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = new URL(env.APP_URL).origin;
  const fail = (reason: string) => {
    const response = NextResponse.redirect(`${origin}/login?error=${reason}`);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };

  const code = url.searchParams.get('code');
  if (!code) return fail('oauth'); // termasuk saat pengguna membatalkan di Google
  const next = safeRedirect(url.searchParams.get('next'));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error('exchangeCodeForSession', error?.code ?? error?.status);
    return fail('oauth');
  }

  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    return fail('unverified');
  }

  const { data: ctx } = await supabase.rpc('get_viewer_context');
  const status = ((ctx ?? []) as ViewerRow[])[0]?.status ?? null;
  if (status !== 'active') {
    await supabase.auth.signOut();
    return fail(status ? 'inactive' : 'member');
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
