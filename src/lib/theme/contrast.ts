// Rumus WCAG 2.x: luminansi relatif sRGB dan rasio kontras. Murni, aman dipakai di klien dan server.
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// Warna teks di atas `bg`: yang kontrasnya tertinggi di antara putih dan kandidat lain (text_primary, background).
// Kandidat `background` membuat tema gelap dengan primary terang bisa memakai teks gelap di atas tombol.
export function onColor(bg: string, ...alts: string[]): string {
  return ['#FFFFFF', ...alts].reduce((best, c) => (contrastRatio(c, bg) > contrastRatio(best, bg) ? c : best));
}
// Campuran linear sRGB a→b (t=0 → a, t=1 → b); dipakai untuk ujung gradien dan turunan token tema.
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [parseInt(a.slice(1), 16), parseInt(b.slice(1), 16)];
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export const PALETTE_LABEL: Record<string, string> = {
  primary: 'Warna utama', secondary: 'Warna kedua', background: 'Latar halaman', surface: 'Permukaan',
  border: 'Garis pemisah', text_primary: 'Teks utama', text_secondary: 'Teks pendukung',
  success: 'Sukses', warning: 'Peringatan', error: 'Galat', on_primary: 'Teks di atas warna utama', on_secondary: 'Teks di atas warna kedua',
};
export type ContrastRow = { fg: string; bg: string; ratio: number; min: number; ok: boolean };

// Teks/tautan/status harus ≥4,5:1 terhadap background dan surface; `border` dekoratif (batas input memakai text_secondary).
export function contrastReport(p: Record<string, string>): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const bg of ['background', 'surface'])
    for (const fg of ['text_primary', 'text_secondary', 'primary', 'secondary', 'success', 'warning', 'error']) {
      const ratio = contrastRatio(p[fg] ?? '#000000', p[bg] ?? '#FFFFFF');
      rows.push({ fg, bg, ratio, min: 4.5, ok: ratio >= 4.5 });
    }
  for (const k of ['primary', 'secondary']) { // tombol: teks putih, text_primary, atau background; ambil yang tertinggi
    const bg = p[k] ?? '#000000';
    const ratio = Math.max(contrastRatio('#FFFFFF', bg), contrastRatio(p.text_primary ?? '#000000', bg), contrastRatio(p.background ?? '#FFFFFF', bg));
    rows.push({ fg: `on_${k}`, bg: k, ratio, min: 4.5, ok: ratio >= 4.5 });
  }
  return rows;
}
