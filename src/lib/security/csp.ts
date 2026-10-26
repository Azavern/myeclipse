// Content-Security-Policy berbasis nonce (blueprint §23). Fungsi murni agar bisa dites tanpa runtime Next.
// Tidak ada klien Supabase di browser, jadi connect-src cukup 'self'. Asal luar untuk <img> adalah
// host Storage Supabase, ditambah https: pada rute Knowledge agar gambar di entri Markdown tampil.

export type CspInput = {
  nonce: string;
  supabaseUrl?: string; // asal Supabase untuk img-src (URL bertanda tangan Storage)
  dev?: boolean;
  /** Hanya untuk halaman Knowledge: pemuat gambar dari host https mana pun di entri Markdown. */
  allowHttpsImages?: boolean;
};

// Asal (origin) dari URL; null bila tidak valid atau bukan http(s), sehingga CSP tetap ketat (fail closed).
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, supabaseUrl, dev = false, allowHttpsImages = false }: CspInput): string {
  const media = originOf(supabaseUrl);
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    // React di mode dev memakai eval untuk menyusun call stack; produksi tidak membutuhkannya.
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", `'nonce-${nonce}'`]],
    ['img-src', ["'self'", 'data:', 'blob:', ...(media ? [media] : []), ...(allowHttpsImages ? ['https:'] : [])]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...(dev ? ['ws:', 'wss:'] : [])]], // ws: hanya untuk HMR di dev
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

// Nonce acak per request (Web Crypto tersedia di runtime Node maupun Edge).
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
