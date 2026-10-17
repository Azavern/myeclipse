import type { Theme } from './schema';
import { DEFAULT_THEME } from './defaults';

type Palette = Theme['palette'];
export type ThemePreset = { id: string; name: string; note: string; palette: Palette };

// Palet siap pakai di editor tema. Semuanya lolos aturan kontras ThemeSchema (dijaga tes unit).
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
];
