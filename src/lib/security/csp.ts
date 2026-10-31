// Content-Security-Policy berbasis nonce (blueprint §23). Fungsi murni agar bisa dites tanpa runtime Next.
// Tidak ada klien Supabase di browser, jadi connect-src cukup 'self'. Asal luar untuk <img> adalah host
// Storage Supabase, ditambah https: pada rute yang menampilkan gambar pihak ketiga (allowsHttpsImages).

// Rute yang menampilkan gambar dari host https mana pun: entri Knowledge (gambar di Markdown) dan pratinjau
// tautan portofolio (gambar Open Graph dari situs sumber, lihat src/lib/preview/server.ts).
export function allowsHttpsImages(pathname: string): boolean {
  return pathname === '/knowledge' || pathname.startsWith('/knowledge/')
    || pathname.startsWith('/members/') || pathname === '/settings/portfolio';
}

// Halaman masuk memuat skrip Google Identity Services (tombol "Masuk dengan Google") beserta iframe/pop-up-nya.
// Rute lain tidak boleh memuat skrip pihak ketiga ini.
export function allowsGoogleSignIn(pathname: string): boolean {
  return pathname === '/login';
}

const GOOGLE_GSI = 'https://accounts.google.com';
const GOOGLE_DRIVE_UPLOAD = 'https://www.googleapis.com';

// Peramban mengunggah potongan file langsung ke sesi resumable Google Drive hanya dari /cloud.
export function allowsGoogleUpload(pathname: string): boolean {
  return pathname === '/cloud';
}

export type CspInput = {
  nonce: string;
  supabaseUrl?: string; // asal Supabase untuk img-src (URL bertanda tangan Storage)
  dev?: boolean;
  /** Hanya untuk halaman Knowledge: pemuat gambar dari host https mana pun di entri Markdown. */
  allowHttpsImages?: boolean;
  /** Hanya untuk /login: skrip dan iframe Google Identity Services. */
  googleSignIn?: boolean;
  /** Hanya untuk /cloud: koneksi PUT ke sesi resumable Google Drive. */
  googleUpload?: boolean;
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

export function buildCsp({ nonce, supabaseUrl, dev = false, allowHttpsImages = false, googleSignIn = false, googleUpload = false }: CspInput): string {
  const media = originOf(supabaseUrl);
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    // React di mode dev memakai eval untuk menyusun call stack; produksi tidak membutuhkannya.
    ['script-src', ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(googleSignIn ? [GOOGLE_GSI] : []), ...(dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", `'nonce-${nonce}'`]],
    ['img-src', ["'self'", 'data:', 'blob:', ...(media ? [media] : []), ...(allowHttpsImages ? ['https:'] : [])]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...(googleSignIn ? [GOOGLE_GSI] : []), ...(googleUpload ? [GOOGLE_DRIVE_UPLOAD] : []), ...(dev ? ['ws:', 'wss:'] : [])]], // ws: hanya untuk HMR di dev
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  // One Tap/akun Google dirender dalam iframe accounts.google.com; hanya rute masuk yang membukanya.
  if (googleSignIn) directives.push(['frame-src', [GOOGLE_GSI]]);
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
