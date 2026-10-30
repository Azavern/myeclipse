import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

// Titik mulai "Masuk dengan Google". Server Action tidak dipakai supaya alur
// ini berupa navigasi GET biasa: tidak ada POST ke origin sendiri yang lalu
// dialihkan ke accounts.google.com. Client secret tetap hanya di Supabase.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = new URL(env.APP_URL).origin;
  const next = safeRedirect(new URL(request.url).searchParams.get('next'));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Kembali ke callback aplikasi, bukan halaman bawaan Supabase.
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data.url) {
    console.error('googleOAuth', error?.status ?? 'no-url');
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  const response = NextResponse.redirect(data.url);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
