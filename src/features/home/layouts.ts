// Daftar blok Beranda dan urutannya per preset tema (blueprint §15). Konstanta kode, bukan data pengguna;
// tiap blok dirender hanya bila section (dan halaman sumber datanya) terlihat oleh viewer.
export const HOME_LAYOUTS = {
  standard: ['identity', 'overview', 'upcoming', 'activity', 'members'],
  profile_focused: ['identity', 'members', 'upcoming', 'overview', 'activity'],
} as const;
export type HomeBlock = (typeof HOME_LAYOUTS)['standard' | 'profile_focused'][number];
