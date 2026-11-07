import { DEFAULT_THEME } from './defaults';
import { ThemeSchema, themeTemplate, type Theme, type ThemeTemplate } from './schema';

export type ThemeResolution = {
  theme: Theme;
  template: ThemeTemplate;
  // Raw theme tidak lolos schema sama sekali.
  invalid: boolean;
  // Hanya kunci template yang rusak; palet dan preferensi lain tetap dipakai.
  invalidTemplate: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Tema lama tanpa `template` valid dan tetap tampil sebagai default. Bila kunci template
// berisi nilai lain, buang hanya kunci itu agar palet pengguna tidak ikut hilang.
export function resolveStoredTheme(raw: unknown): ThemeResolution {
  const parsed = ThemeSchema.safeParse(raw);
  if (parsed.success)
    return { theme: parsed.data, template: themeTemplate(parsed.data), invalid: false, invalidTemplate: false };

  if (isRecord(raw) && 'template' in raw) {
    const withoutTemplate = { ...raw };
    delete withoutTemplate.template;
    const fallback = ThemeSchema.safeParse(withoutTemplate);
    if (fallback.success)
      return { theme: fallback.data, template: 'default', invalid: false, invalidTemplate: true };
  }

  return { theme: DEFAULT_THEME, template: 'default', invalid: true, invalidTemplate: false };
}
