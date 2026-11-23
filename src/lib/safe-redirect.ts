// Hanya path relatif internal. URL parser membuang tab/newline, sehingga
// "/\t/evil.com" menjadi "//evil.com" (lintas origin); backslash juga
// diperlakukan seperti garis miring. Keduanya harus ditolak di sini karena
// redirect() meneruskan string apa adanya ke header Location.
const UNSAFE = /[\u0000-\u001f\u007f\\]/;

export function safeRedirect(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || UNSAFE.test(next)) return '/';
  return next;
}
