import Link from 'next/link';
import type { HomeMode } from '@/lib/theme/schema';

// Tombol footer bernama "backside". Hanya tampil saat / masih beranda klasik;
// saat mode intro aktif, / sudah menuju intro sehingga tautan ini disembunyikan.
export function BacksideLink({ mode }: { mode: HomeMode }) {
  if (mode === 'intro') return null;
  return (
    <Link href="/intro" className="nav-link nav-link--backside" aria-label="backside — buka halaman intro kelas">
      <span className="nav-link__text">backside</span>
    </Link>
  );
}
