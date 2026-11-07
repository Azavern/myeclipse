import type { Theme, ThemeTemplate } from './schema';
import { DEFAULT_THEME } from './defaults';

type Palette = Theme['palette'];

export type TemplatePreset = {
  id: ThemeTemplate; name: string; note: string; palette: Palette;
  layout: Theme['layout']; font_preset: Theme['font_preset'];
};
// Preset boleh membawa tata letak dan huruf (mis. tema gelap yang memakai font editorial),
// sehingga sekali klik editor ikut memuat keduanya. Preset lama hanya mengganti palet.
export type ThemePreset = {
  id: string; name: string; note: string; palette: Palette;
  layout?: Theme['layout']; font_preset?: Theme['font_preset'];
};

// Palet siap pakai di editor tema. Semuanya lolos aturan kontras ThemeSchema (dijaga tes unit).
// Template adalah paket tampilan. Palet di sini dipakai editor dan tes; dekorasi visualnya
// berada di styles/templates agar komponen tidak pernah memakai nilai mentah.
export const TEMPLATE_PRESETS: TemplatePreset[] = [
  { id: 'default', name: 'Default', note: 'Tampilan sekarang, dengan warna dan huruf yang bisa diatur.',
    layout: 'standard', font_preset: 'rounded', palette: DEFAULT_THEME.palette },
  { id: 'neobrutalism', name: 'Neo-Brutalism', note: 'Bingkai tebal, bayangan keras, dan tipografi tegas tanpa kaca.',
    layout: 'standard', font_preset: 'grotesk', palette: {
      primary: '#2457D6', secondary: '#6B2FD0', background: '#F4F0EA', surface: '#FFFDF8', border: '#000000',
      text_primary: '#000000', text_secondary: '#3D3A35', success: '#1E7A3E', warning: '#8A5A00', error: '#C0262B' } },
  { id: 'archive', name: 'Arsip 1960-an', note: 'Arsip gelap dengan aksen kuningan, huruf klasik, dan ornamen garis.',
    layout: 'standard', font_preset: 'editorial', palette: {
      primary: '#C5A059', secondary: '#8FAE98', background: '#141311', surface: '#1C1A17', border: '#3A3226',
      text_primary: '#E6DEC8', text_secondary: '#B9AE93', success: '#8FB58F', warning: '#D9A441', error: '#E07A5F' } },
];

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'kampus', name: 'Kampus', note: 'Teal hangat, bawaan', palette: DEFAULT_THEME.palette },
  { id: 'indigo', name: 'Indigo', note: 'Biru-ungu akademik', palette: {
    primary: '#4338CA', secondary: '#BE185D', background: '#F5F5FC', surface: '#FFFFFF', border: '#DADAEE',
    text_primary: '#14142B', text_secondary: '#4A4A68', success: '#15803D', warning: '#B45309', error: '#B91C1C' } },
  { id: 'hutan', name: 'Hutan', note: 'Hijau tenang', palette: {
    primary: '#166534', secondary: '#A16207', background: '#F4F8F1', surface: '#FFFFFF', border: '#D6E2CF',
    text_primary: '#12200F', text_secondary: '#4B5E45', success: '#15803D', warning: '#B45309', error: '#B91C1C' } },
  { id: 'gerhana', name: 'Gerhana', note: 'Mode gelap', palette: {
    primary: '#F59E0B', secondary: '#7DD3FC', background: '#0B1220', surface: '#131C30', border: '#2A3652',
    text_primary: '#EAF0FB', text_secondary: '#A9B7D0', success: '#4ADE80', warning: '#FBBF24', error: '#F87171' } },
  // Tema gelap bernama kelas: biru-tinta seperti sampul "Eclipse", satu aksen amber sebagai korona.
  // Teks di atas tombol jatuh ke `background` karena putih dan text_primary gagal 4,5:1 (lihat onColor).
  { id: 'eclipse_gelap', name: 'Eclipse Gelap', note: 'Biru-tinta dengan korona amber', layout: 'standard', font_preset: 'editorial', palette: {
    primary: '#F0A04B', secondary: '#7FB2D9', background: '#0F141A', surface: '#17202A', border: '#2B3846',
    text_primary: '#EEF2F6', text_secondary: '#AAB7C4', success: '#5FBF84', warning: '#E5B84A', error: '#F28B82' } },
];
