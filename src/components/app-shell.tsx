import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/actions';
import { Avatar } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { LoginLink } from '@/components/login-link';
import { BacksideLink } from '@/features/intro/backside-link';
import { MoreSheet, NavLink, type NavItem } from '@/components/nav';
import { getClass } from '@/lib/class';
import { homeMode } from '@/lib/theme/schema';
import { resolveStoredTheme } from '@/lib/theme/resolve';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer, getVisibilityMap } from '@/lib/visibility/server';

// [href, label, ikon, kunci visibility]; urutan = urutan di sidebar. Empat pertama yang terlihat menjadi tab bawah di layar sempit.
const PAGES: [string, string, NavItem['icon'], string][] = [
  ['/', 'Beranda', 'home', 'page.home'], ['/schedule', 'Jadwal', 'calendar', 'page.schedule'],
  ['/tasks', 'Tugas', 'tasks', 'page.tasks'], ['/kas', 'Kas', 'wallet', 'page.kas'],
  ['/members', 'Anggota', 'users', 'page.members'],
  ['/events', 'Event', 'calendar-days', 'page.events'], ['/class', 'Kelas', 'book', 'page.class_about'],
  ['/knowledge', 'Pengetahuan', 'book-open', 'page.knowledge'],
];

// Jumlah permintaan edit yang menunggu tindakan pemakai: milik penulis sendiri,
// ditambah eskalasi bila ia Ketua. Hanya penanda navigasi; kegagalan hitung tidak
// boleh menggagalkan halaman, jadi count null diperlakukan sebagai nol.
async function pendingKnowledgeCount(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, isLeader: boolean) {
  const [author, leader] = await Promise.all([
    supabase.from('knowledge_edit_requests')
      .select('id,knowledge_entries!inner(author_id)', { count: 'exact', head: true })
      .eq('status', 'pending_author').eq('knowledge_entries.author_id', userId),
    isLeader
      ? supabase.from('knowledge_edit_requests').select('id', { count: 'exact', head: true }).eq('status', 'escalated')
      : Promise.resolve({ count: 0 }),
  ]);
  return (author.count ?? 0) + (leader.count ?? 0);
}

async function pendingKasCount(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase.rpc('get_kas_summary');
  if (error) return 0;
  return Number(((data ?? []) as { pending_verifications: number }[])[0]?.pending_verifications ?? 0);
}

export async function AppFrame({ children }: { children: ReactNode }) {
  const [map, viewer, cls] = await Promise.all([getVisibilityMap(), getViewer(), getClass()]);
  const supabase = await createClient();
  const [meRow, pendingKnowledge, pendingKas] = await Promise.all([
    viewer.user && viewer.status
      ? supabase.from('member_profile_v').select('full_name,role_name,avatar_path').eq('user_id', viewer.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    viewer.user && viewer.status === 'active' && map.get('page.knowledge') === true
      ? pendingKnowledgeCount(supabase, viewer.user.id, viewer.can('class.manage'))
      : Promise.resolve(0),
    viewer.user && viewer.status === 'active' && map.get('page.kas') === true
      ? pendingKasCount(supabase)
      : Promise.resolve(0),
  ]);
  const me = meRow.data as { full_name: string; role_name: string; avatar_path: string | null } | null;
  const signed = await signMany(supabase, 'class-media', [cls?.logo_path]);
  const memberSigned = await signMany(supabase, 'member-media', [me?.avatar_path]);
  const logo = cls?.logo_path ? signed.get(cls.logo_path) : undefined;
  const avatar = me?.avatar_path ? memberSigned.get(me.avatar_path) : undefined;
  const className = cls?.name ?? 'Eclipse';
  const home = homeMode(resolveStoredTheme(cls?.theme).theme);

  const active = !!viewer.user && viewer.status === 'active';
  const pages: NavItem[] = PAGES.filter(([, , , key]) => map.get(key) === true)
    .map(([href, label, icon]) => ({ href, label, icon,
      ...(href === '/knowledge' ? { except: ['/knowledge/manage', '/knowledge/new'] } : {}),
      ...(href === '/kas' && pendingKas > 0 ? { badge: pendingKas } : {}) }));
  // Grup "Utama" dan "Sumber daya" dipisah; empat destinasi pertama `main` tetap menjadi tab bawah.
  const primary = pages.filter((item) => item.href !== '/knowledge');
  const utilities: NavItem[] = pages.filter((item) => item.href === '/knowledge');
  // QR Studio selalu tampil: halaman publik, tidak terikat visibility maupun status login.
  // Library, Cloud, dan Inventory hanya untuk anggota aktif.
  if (active) {
    utilities.push(
      { href: '/library', label: 'Library', icon: 'images' },
      { href: '/cloud', label: 'Cloud', icon: 'cloud' },
      { href: '/inventory', label: 'Inventory', icon: 'package', except: ['/inventory/access'] },
    );
  }
  utilities.push({ href: '/qr', label: 'QR Studio', icon: 'qr' });
  // Pintu masuk editor, terpisah dari halaman publik /knowledge. Badge permintaan
  // edit menempel di sini, bukan di tautan penjelajah publik.
  const knowledgeManage: NavItem[] = active && map.get('page.knowledge') === true
    ? [{
      href: '/knowledge/manage', label: 'Kelola pengetahuan', icon: 'pencil',
      match: ['/knowledge/manage', '/knowledge/new'],
      ...(pendingKnowledge > 0 ? { badge: pendingKnowledge } : {}),
    }]
    : [];
  const account: NavItem[] = viewer.user ? [
    { href: '/settings/profile', label: 'Profil saya', icon: 'user', match: ['/settings/profile', '/settings/social', '/settings/account'] },
    { href: '/settings/portfolio', label: 'Portofolio saya', icon: 'briefcase' },
  ] : [];
  const canManage = viewer.can('class.manage');
  const manage: NavItem[] = canManage || viewer.can('members.manage')
    ? [{ href: canManage ? '/settings/class' : '/settings/members', label: 'Pengelolaan kelas', icon: 'settings',
      match: ['/settings/class', '/settings/theme', '/settings/visibility', '/settings/access', '/settings/members', '/settings/cloud', '/settings/developer'] }]
    : viewer.can('members.request')
      ? [{ href: '/settings/members', label: 'Anggota', icon: 'users' }]
      : [];

  // Sidebar: tiga grup berlabel. Grup akun dan pengelolaan disematkan di bawah bersama blok akun.
  const main = [...primary, ...utilities];
  const management = [...account, ...knowledgeManage, ...manage];

  // Layar sempit: anggota = 4 tab + "Lainnya". Tamu = semua halaman (maks. 4) + "Masuk"; bila lebih dari 4, 3 tab + "Lainnya".
  const loggedIn = !!viewer.user;
  const guestFits = !loggedIn && main.length <= 4;
  const tabs = loggedIn ? main.slice(0, 4) : guestFits ? main : main.slice(0, 3);
  const overflow = [...main.slice(tabs.length), ...management];
  const showMore = !guestFits;
  const userName = me?.full_name ?? viewer.user?.email ?? '';

  const brand = (
    <Link href="/" className="brand" aria-label={`${className}, ke beranda`}>
      <span className="brand__mark">{logo ? <img src={logo} alt="" width={40} height={40} /> : <Icon name="cap" size={22} />}</span>
      <span className="brand__text"><span className="brand__name">{className}</span>{cls?.code && <span className="brand__sub">{cls.code}</span>}</span>
    </Link>
  );
  const signOutForm = (
    <form action={signOut}><button data-ui="nav-item" type="submit" className="nav-link nav-link--danger"><Icon name="log-out" size={20} /><span className="nav-link__text">Keluar</span></button></form>
  );
  const userCard = loggedIn && (
    <Link href="/settings/profile" data-ui="panel" className="user-card" aria-label="Buka profil saya">
      <Avatar name={userName || '?'} src={avatar} size="md" />
      <span className="user-card__text"><span className="user-card__name">{userName}</span><span className="user-card__role">{me?.role_name ?? 'Belum jadi anggota'}</span></span>
    </Link>
  );

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Menu samping">
        {brand}
        <nav className="nav" aria-label="Navigasi utama">
          {primary.length > 0 && (
            <div className="nav__group"><span className="nav__label">Utama</span>{primary.map((i) => <NavLink key={i.href} item={i} />)}</div>)}
          {utilities.length > 0 && (
            <div className="nav__group"><span className="nav__label">Sumber daya</span>{utilities.map((i) => <NavLink key={i.href} item={i} />)}</div>)}
        </nav>
        <div className="sidebar__foot">
          {management.length > 0 && (
            <div className="nav__group">
              <span className="nav__label">Akun dan pengelolaan</span>
              {management.map((i) => <NavLink key={i.href} item={i} />)}
              {signOutForm}
            </div>)}
          <BacksideLink mode={home} />
          {userCard}
          {!loggedIn && <LoginLink data-ui="button" className="btn" aria-label="Masuk"><Icon name="log-in" size={18} /><span className="nav-link__text">Masuk</span></LoginLink>}
        </div>
      </aside>
      <div>
        <header data-ui="topbar" className="topbar">{brand}</header>
        <main id="main" className="app-main" tabIndex={-1}><div className="container page-enter">{children}</div></main>
      </div>
      <nav data-ui="bottom-nav" className="bottom-nav" aria-label="Navigasi bawah">
        {tabs.map((i) => <NavLink key={i.href} item={i} variant="tab" />)}
        {guestFits && <LoginLink data-ui="nav-item" className="tab"><Icon name="log-in" size={22} /><span>Masuk</span></LoginLink>}
        {showMore && (
          <MoreSheet items={overflow}>
            {userCard}
            {loggedIn ? signOutForm : <LoginLink data-ui="button" className="btn"><Icon name="log-in" size={18} />Masuk</LoginLink>}
          </MoreSheet>)}
      </nav>
    </div>
  );
}
