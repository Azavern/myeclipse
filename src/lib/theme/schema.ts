import { z } from 'zod';
import { PALETTE_LABEL, contrastReport } from './contrast';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berformat #RRGGBB.');
export const PALETTE_KEYS = ['primary', 'secondary', 'background', 'surface', 'border', 'text_primary', 'text_secondary', 'success', 'warning', 'error'] as const;
export const THEME_TEMPLATES = ['default', 'neobrutalism', 'archive'] as const;
export const ThemeTemplateSchema = z.enum(THEME_TEMPLATES);
export type ThemeTemplate = z.infer<typeof ThemeTemplateSchema>;

export const HOME_MODES = ['classic', 'intro'] as const;
export const HomeModeSchema = z.enum(HOME_MODES);
export type HomeMode = z.infer<typeof HomeModeSchema>;

export const ThemeSchema = z.object({
  // Opsional agar tema lama tanpa kunci ini tetap valid dan tidak perlu ditulis ulang.
  template: ThemeTemplateSchema.optional(),
  // Opsional agar tema lama tetap valid. Default klasik (lihat lib/theme/home-mode.ts).
  home_mode: HomeModeSchema.optional(),
  layout: z.enum(['standard', 'profile_focused']),
  font_preset: z.enum(['editorial', 'grotesk', 'rounded']),
  palette: z.object({
    primary: hex, secondary: hex, background: hex, surface: hex, border: hex,
    text_primary: hex, text_secondary: hex, success: hex, warning: hex, error: hex,
  }),
}).superRefine((t, ctx) => {
  // Termasuk baris on_primary/on_secondary: yang diperiksa adalah warna teks yang benar-benar
  // diturunkan (putih atau text_primary, lalu background bila keduanya gagal 4,5:1).
  for (const r of contrastReport(t.palette))
    if (!r.ok) ctx.addIssue({ code: 'custom', path: ['palette', r.fg],
      message: `Kontras ${PALETTE_LABEL[r.fg]} terhadap ${PALETTE_LABEL[r.bg]} hanya ${r.ratio.toFixed(1)}:1 (minimal ${r.min}:1).` });
});
export type Theme = z.infer<typeof ThemeSchema>;

// Tema lama tidak memiliki kunci template; untuk render keduanya sama-sama default.
export const themeTemplate = (t: Pick<Theme, 'template'> | null | undefined): ThemeTemplate => t?.template ?? 'default';
// Tema lama tidak memiliki kunci home_mode; default klasik.
export const homeMode = (t: Pick<Theme, 'home_mode'> | null | undefined): HomeMode => t?.home_mode ?? 'classic';
