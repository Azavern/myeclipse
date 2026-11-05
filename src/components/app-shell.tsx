import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '@/app/actions';
import { Avatar } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { MoreSheet, NavLink, type NavItem } from '@/components/nav';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer, getVisibilityMap } from '@/lib/visibility/server';

// [href, label, ikon, kunci visibility]; urutan = urutan di sidebar. Empat pertama yang terlihat menjadi tab bawah di layar sempit.
const PAGES: [string, string, NavItem['icon'], string][] = [
  ['/', 'Beranda', 'home', 'page.home'], ['/schedule', 'Jadwal', 'calendar', 'page.schedule'],
  ['/tasks', 'Tugas', 'tasks', 'page.tasks'], ['/events', 'Event', 'calendar-days', 'page.events'],
  ['/members', 'Anggota', 'users', 'page.members'], ['/class', 'Kelas', 'book', 'page.class_about'],
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

export async function AppFrame({ children }: { children: ReactNode }) {
  const [map, viewer, cls] = await Promise.all([getVisibilityMap(), getViewer(), getClass()]);
  const supabase = await createClient();
  const [meRow, pendingKnowledge] = await Promise.all([
    viewer.user && viewer.status
      ? supabase.from('member_profile_v').select('full_name,role_name,avatar_path').eq('user_id', viewer.user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    viewer.user && viewer.status === 'active' && map.get('page.knowledge') === true
      ? pendingKnowledgeCount(supabase, viewer.user.id, viewer.can('class.manage'))
      : Promise.resolve(0),
  ]);
  const me = meRow.data as { full_name: string; role_name: string; avatar_path: string | null } | null;
  const signed = await signMany(supabase, 'class-media', [cls?.logo_path]);
  const memberSigned = await signMany(supabase, 'member-media', [me?.avatar_path]);
  const logo = cls?.logo_path ? signed.get(cls.logo_path) : undefined;
  const avatar = me?.avatar_path ? memberSigned.get(me.avatar_path) : undefined;
  const className = cls?.name ?? 'Eclipse';

  const main: NavItem[] = PAGES.filter(([, , , key]) => map.get(key) === true)
    .map(([href, label, icon]) => ({ href, label, icon,
      ...(href === '/knowledge' ? { except: ['/knowledge/manage', '/knowledge/new'] } : {}) }));
  // QR Studio selalu tampil: halaman publik, tidak terikat visibility maupun status login.
  main.push({ href: '/qr', label: 'QR Studio', icon: 'qr' });
  // Pintu masuk editor, terpisah dari halaman publik /knowledge. Badge permintaan
  // edit menempel di sini, bukan di tautan penjelajah publik.
  if (viewer.user && viewer.status === 'active' && map.get('page.knowledge') === true) {
    const at = main.findIndex((i) => i.href === '/knowledge');
    main.splice(at + 1, 0, {
      href: '/knowledge/manage', label: 'Kelola pengetahuan', icon: 'pencil',
      match: ['/knowledge/manage', '/knowledge/new'],
      ...(pendingKnowledge > 0 ? { badge: pendingKnowledge } : {}),
    });
  }
  // Inventory pribadi: hanya untuk anggota aktif dan bukan halaman ber-visibility.
  if (viewer.user && viewer.status === 'active') {
    main.push({ href: '/inventory', label: 'Inventory', icon: 'link', except: ['/inventory/access'] });
    main.push({ href: '/cloud', label: 'Cloud', icon: 'upload' });
    main.push({ href: '/library', label: 'Library', icon: 'image' });
  }
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

  // Layar sempit: anggota = 4 tab + "Lainnya". Tamu = semua halaman (maks. 4) + "Masuk"; bila lebih dari 4, 3 tab + "Lainnya".
  const loggedIn = !!viewer.user;
  const guestFits = !loggedIn && main.length <= 4;
  const tabs = loggedIn ? main.slice(0, 4) : guestFits ? main : main.slice(0, 3);
  const overflow = [...main.slice(tabs.length), ...account, ...manage];
  const showMore = !guestFits;
  const userName = me?.full_name ?? viewer.user?.email ?? '';

  const brand = (
    <Link href="/" className="brand" aria-label={`${className}, ke beranda`}>
      <span className="brand__mark">{logo ? <img src={logo} alt="" width={40} height={40} /> : <Icon name="cap" size={22} />}</span>
      <span className="brand__text"><span className="brand__name">{className}</span>{cls?.code && <span className="brand__sub">{cls.code}</span>}</span>
    </Link>
  );
  const signOutForm = (
    <form action={signOut}><button type="submit" className="nav-link nav-link--danger"><Icon name="log-out" size={20} /><span className="nav-link__text">Keluar</span></button></form>
  );
  const userCard = loggedIn && (
    <div className="user-card">
      <Avatar name={userName || '?'} src={avatar} size="md" />
      <span className="user-card__text"><span className="user-card__name">{userName}</span><span className="user-card__role">{me?.role_name ?? 'Belum jadi anggota'}</span></span>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Menu samping">
        {brand}
        <nav className="nav" aria-label="Navigasi utama">
          <div className="nav__group">{main.map((i) => <NavLink key={i.href} item={i} />)}</div>
          {(account.length > 0 || manage.length > 0) && (
            <div className="nav__group"><span className="nav__label">Akun dan pengelolaan</span>{[...account, ...manage].map((i) => <NavLink key={i.href} item={i} />)}</div>)}
        </nav>
        <div className="sidebar__foot">
          {userCard}
          {loggedIn ? signOutForm : <Link href="/login" className="btn"><Icon name="log-in" size={18} /><span className="nav-link__text">Masuk</span></Link>}
        </div>
      </aside>
      <div>
        <header className="topbar">{brand}</header>
        <main id="main" className="app-main" tabIndex={-1}><div className="container page-enter">{children}</div></main>
      </div>
      <nav className="bottom-nav" aria-label="Navigasi bawah">
        {tabs.map((i) => <NavLink key={i.href} item={i} variant="tab" />)}
        {guestFits && <Link href="/login" className="tab"><Icon name="log-in" size={22} /><span>Masuk</span></Link>}
        {showMore && (
          <MoreSheet items={overflow}>
            {userCard}
            {loggedIn ? signOutForm : <Link href="/login" className="btn"><Icon name="log-in" size={18} />Masuk</Link>}
          </MoreSheet>)}
      </nav>
    </div>
  );
}
