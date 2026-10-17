import { z } from 'zod';
import { PALETTE_LABEL, contrastReport } from './contrast';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berformat #RRGGBB.');
export const PALETTE_KEYS = ['primary', 'secondary', 'background', 'surface', 'border', 'text_primary', 'text_secondary', 'success', 'warning', 'error'] as const;

export const ThemeSchema = z.object({
  layout: z.enum(['standard', 'profile_focused']),
  font_preset: z.enum(['editorial', 'grotesk', 'rounded']),
  palette: z.object({
    primary: hex, secondary: hex, background: hex, surface: hex, border: hex,
    text_primary: hex, text_secondary: hex, success: hex, warning: hex, error: hex,
  }),
}).superRefine((t, ctx) => {
  for (const r of contrastReport(t.palette))
    if (!r.ok) ctx.addIssue({ code: 'custom', path: ['palette', r.fg],
      message: `Kontras ${PALETTE_LABEL[r.fg]} terhadap ${PALETTE_LABEL[r.bg]} hanya ${r.ratio.toFixed(1)}:1 (minimal ${r.min}:1).` });
});
export type Theme = z.infer<typeof ThemeSchema>;
