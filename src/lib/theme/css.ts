import { luminance, mixHex, onColor } from './contrast';
import type { Theme } from './schema';

// Variabel CSS tema untuk satu palet. Hanya hex tervalidasi (ThemeSchema) yang boleh masuk (blueprint §23).
// Turunan lain (tint, bayangan semantik) dihitung di styles/tokens.css dari variabel --theme-* ini; yang dihitung di
// sini adalah nilai yang harus menjamin kontras: teks di atas warna utama/kedua/galat dan ujung gradien.
export function themeVars(p: Theme['palette']): Record<string, string> {
  const dark = luminance(p.background) < 0.35;
  const onPrimary = onColor(p.primary, p.text_primary, p.background);
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) vars[`--theme-${k.replace('_', '-')}`] = v;
  vars['--theme-on-primary'] = onPrimary;
  vars['--theme-on-secondary'] = onColor(p.secondary, p.text_primary, p.background);
  vars['--theme-on-error'] = onColor(p.error, p.text_primary, p.background);
  // Ujung gradien bergerak menjauhi warna teks di atasnya, sehingga kontras teks tidak turun.
  vars['--theme-primary-deep'] = mixHex(p.primary, luminance(onPrimary) > 0.5 ? '#000000' : '#FFFFFF', 0.3);
  vars['--shadow-rgb'] = dark ? '0 0 0' : '15 23 42';
  vars['color-scheme'] = dark ? 'dark' : 'light';
  return vars;
}

export function buildThemeCss(t: Theme): string {
  const body = Object.entries(themeVars(t.palette)).map(([k, v]) => `${k}:${v};`).join('');
  return `:root{${body}}`;
}
