import type { ReactNode } from 'react';
import { SubNavLink, type NavItem } from '@/components/nav';
import { getViewer } from '@/lib/visibility/server';

// Sub-navigasi Pengaturan: bagian akun untuk semua anggota aktif, bagian pengelolaan sesuai permission.
// Hanya tampilan; setiap halaman tetap memeriksa izinnya sendiri di server.
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer.user || viewer.status !== 'active') return <>{children}</>;
  const account: NavItem[] = [
    { href: '/settings/profile', label: 'Profil saya', icon: 'user', match: ['/settings/profile', '/settings/social'] },
    { href: '/settings/portfolio', label: 'Portofolio', icon: 'briefcase' },
    { href: '/settings/account', label: 'Keamanan', icon: 'lock' },
  ];
  const manage: NavItem[] = [
    ...(viewer.can('class.manage') ? ([
      { href: '/settings/class', label: 'Kelas', icon: 'book' },
      { href: '/settings/theme', label: 'Tema', icon: 'palette' },
      { href: '/settings/visibility', label: 'Visibilitas', icon: 'eye' },
    ] satisfies NavItem[]) : []),
    ...(viewer.can('members.manage') ? ([{ href: '/settings/members', label: 'Anggota', icon: 'users' }] satisfies NavItem[]) : []),
  ];
  return (
    <div className="settings">
      <nav className="subnav" aria-label="Pengaturan">
        <span className="subnav__label">Akun</span>
        {account.map((i) => <SubNavLink key={i.href} item={i} />)}
        {manage.length > 0 && <span className="subnav__label">Pengelolaan kelas</span>}
        {manage.map((i) => <SubNavLink key={i.href} item={i} />)}
      </nav>
      <div className="settings__content">{children}</div>
    </div>
  );
}
