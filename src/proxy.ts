import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { allowsGoogleSignIn, allowsHttpsImages, buildCsp, makeNonce } from '@/lib/security/csp';
import type { CookieToSet } from '@/lib/supabase/cookie-types';

// Dua tugas saja: (1) memasang CSP bernonce, (2) me-refresh cookie sesi. Tanpa logika otorisasi (blueprint §3.4).
// Nonce dikirim ke Server Component lewat header permintaan `x-nonce`; Next membaca nonce yang sama dari
// header permintaan `content-security-policy` untuk skripnya sendiri.
export async function proxy(request: NextRequest) {
  const nonce = makeNonce();
  // Gambar Knowledge dan pratinjau tautan portofolio boleh dari host https mana pun; halaman lain tetap ketat.
  const allowHttpsImages = allowsHttpsImages(request.nextUrl.pathname);
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.SUPABASE_URL,
    dev: process.env.NODE_ENV !== 'production',
    allowHttpsImages,
    googleSignIn: allowsGoogleSignIn(request.nextUrl.pathname),
  });

  // Dibangun ulang setiap kali dipanggil supaya header `cookie` hasil refresh ikut terkirim ke render berikutnya.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set('content-security-policy', csp);
    return res;
  };

  let response = next();
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieToSet[]) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        // Bendera cookie sama dengan lib/supabase/server.ts: httpOnly aman karena tidak ada klien Supabase di browser.
        list.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' }));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
