-- Migration 0012 — palet bawaan v2 (DESIGN.md v2)
--
-- Mengganti tema bawaan lama (krem/oranye, font Editorial) dengan palet teal + aksen hangat dan font Rounded.
-- Hanya kelas yang temanya MASIH sama persis dengan bawaan lama yang diubah; tema yang sudah dikustom Ketua
-- tidak disentuh. Nilai baru WAJIB identik dengan DEFAULT_THEME di src/lib/theme/defaults.ts (dijaga tes unit).

update public.classes
set theme = '{
  "layout": "standard",
  "font_preset": "rounded",
  "palette": {
    "primary": "#0F766E", "secondary": "#C2410C", "background": "#F2F7F6",
    "surface": "#FFFFFF", "border": "#D3E1DE", "text_primary": "#0E1F1D",
    "text_secondary": "#455E5A", "success": "#15803D", "warning": "#B45309",
    "error": "#B91C1C"
  }
}'::jsonb
where theme = '{
  "layout": "standard",
  "font_preset": "editorial",
  "palette": {
    "primary": "#A64B00", "secondary": "#2C4A5E", "background": "#F7F4ED",
    "surface": "#FFFFFF", "border": "#D9D3C5", "text_primary": "#1C1B19",
    "text_secondary": "#5A564D", "success": "#2F6B3A", "warning": "#8A5A00",
    "error": "#B3261E"
  }
}'::jsonb;
