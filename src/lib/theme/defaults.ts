import type { Theme } from './schema';

// Harus identik dengan migrasi 20261012120000_theme_default_v2.sql (dijaga tes unit).
export const DEFAULT_THEME: Theme = {
  layout: 'standard',
  font_preset: 'rounded',
  palette: {
    primary: '#0F766E', secondary: '#C2410C', background: '#F2F7F6', surface: '#FFFFFF', border: '#D3E1DE',
    text_primary: '#0E1F1D', text_secondary: '#455E5A', success: '#15803D', warning: '#B45309', error: '#B91C1C',
  },
};
// Tema bawaan versi 1 (migrasi 0008). Dipakai migrasi v2 agar hanya kelas yang belum pernah diubah yang berganti tampilan.
export const LEGACY_THEME_V1: Theme = {
  layout: 'standard',
  font_preset: 'editorial',
  palette: {
    primary: '#A64B00', secondary: '#2C4A5E', background: '#F7F4ED', surface: '#FFFFFF', border: '#D9D3C5',
    text_primary: '#1C1B19', text_secondary: '#5A564D', success: '#2F6B3A', warning: '#8A5A00', error: '#B3261E',
  },
};
