import type { Theme } from '@/lib/theme/schema';

// Pembagian blok Beranda per preset tema. Ini menggantikan baris tiga kolom blueprint §16
// (Jadwal | Event | Tugas) yang memaksa tinggi kartu sejajar: kini dua tumpukan independen,
// main dan rail, sehingga tinggi tiap kartu mengikuti isinya.
export type HomeBlock = 'identity' | 'overview' | 'schedule' | 'tasks' | 'events' | 'activity' | 'members';
export type HomeRegion = { full: HomeBlock[]; main: HomeBlock[]; rail: HomeBlock[]; wide: HomeBlock[] };

// `wide` hanya dipakai rail pada 1024–1279 px (Anggota selebar rail); pada ≥1280 px rail satu kolom.
export const HOME_REGIONS: Record<Theme['layout'], HomeRegion> = {
  standard: {
    full: ['identity'],
    main: ['schedule', 'tasks', 'overview'],
    rail: ['events', 'activity'],
    wide: ['members'],
  },
  profile_focused: {
    full: ['identity', 'members'],
    main: ['schedule', 'tasks', 'overview'],
    rail: ['events', 'activity'],
    wide: [],
  },
};
