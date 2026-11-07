import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/primitives';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';

// Layar masuk terbelah (DESIGN.md §8): panel merek di kiri (disembunyikan ringkas di layar sempit), kartu form di kanan.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const cls = await getClass();
  const logo = cls?.logo_path ? (await signMany(await createClient(), 'class-media', [cls.logo_path])).get(cls.logo_path) : undefined;
  const name = cls?.name ?? 'Eclipse';
  return (
    <div className="auth">
      <div className="auth__brand" data-ui="auth-brand">
        <Link href="/" className="brand" aria-label={`${name}, ke beranda`}>
          <span className="brand__mark" data-ui="brand-mark">{logo ? <img src={logo} alt="" width={40} height={40} /> : <Icon name="cap" size={22} />}</span>
          <span className="brand__text"><span className="brand__name">{name}</span>{cls?.code && <span className="brand__sub">{cls.code}</span>}</span>
        </Link>
        <div className="auth__lead">
          <p className="auth__headline">{cls?.tagline ?? 'Semua tentang kelasmu, dalam satu tempat.'}</p>
          <ul className="auth__points">
            <li><Tile icon="calendar" />Jadwal kuliah dan kegiatan yang selalu terbaru</li>
            <li><Tile icon="tasks" />Tugas dan tenggat yang tidak terlewat</li>
            <li><Tile icon="users" />Profil dan portofolio teman sekelas</li>
          </ul>
        </div>
        <p className="auth__foot">Akun dibuat oleh pengelola kelas.</p>
      </div>
      <main id="main" className="auth__panel" tabIndex={-1}><div className="auth__card">{children}</div></main>
    </div>
  );
}
