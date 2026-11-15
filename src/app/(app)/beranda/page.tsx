import type { Metadata } from 'next';
import { ClassicHome } from '@/features/home/classic-home';

export const metadata: Metadata = { title: 'Beranda klasik' };

// Rute tetap beranda klasik. Saat mode intro aktif, / mengarah ke /intro dan tombol
// "Buka beranda klasik" di intro menuju halaman ini.
export default function Beranda() {
  return <ClassicHome next="/beranda" />;
}
