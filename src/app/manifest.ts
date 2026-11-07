import type { MetadataRoute } from 'next';
import { getClass } from '@/lib/class';
import { resolveStoredTheme } from '@/lib/theme/resolve';

// Manifest dibaca browser saat memasang aplikasi. Nama kelas diambil dari DB agar
// yang terpasang di beranda memakai identitas kelas, bukan nama bawaan.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cls = await getClass().catch(() => null);
  const name = cls?.name ?? 'Eclipse';
  const theme = resolveStoredTheme(cls?.theme).theme;
  return {
    id: '/',
    name,
    short_name: name,
    description: cls?.tagline ?? 'Rumah digital kelas: jadwal, tugas, event, anggota, dan pengetahuan.',
    lang: 'id',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: theme.palette.background,
    theme_color: theme.palette.primary,
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
