'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from '@/components/ui/icon';

export type NavItem = { href: string; label: string; icon: IconName; match?: string[]; except?: string[]; badge?: number };

const isActive = (pathname: string, { href, match, except = [] }: NavItem) =>
  !except.some((h) => pathname === h || pathname.startsWith(`${h}/`))
  && (match ?? [href]).some((h) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`)));

const badgeText = (n?: number) => (n && n > 0 ? (n > 99 ? '99+' : String(n)) : null);

// Penanda jumlah tugas menunggu; angkanya dekoratif, teks pembaca layar ditambahkan terpisah.
function NavBadge({ count, className }: { count: number; className?: string }) {
  const text = badgeText(count);
  return text ? <span className={cx('nav-badge', className)} aria-hidden="true">{text}</span> : null;
}

// Tautan navigasi dengan aria-current pada halaman aktif (blueprint §11, DESIGN.md §9).
export function NavLink({ item, variant = 'side' }: { item: NavItem; variant?: 'side' | 'tab' }) {
  const active = isActive(usePathname(), item);
  const current = active ? ('page' as const) : undefined;
  const badge = badgeText(item.badge);
  return variant === 'tab' ? (
    <Link href={item.href} className="tab" aria-current={current}>
      <span className="tab__icon"><Icon name={item.icon} size={22} /><NavBadge count={item.badge ?? 0} /></span>
      <span>{item.label}</span>{badge && <span className="sr-only">, {item.badge} menunggu tindakan</span>}
    </Link>
  ) : (
    <Link href={item.href} className="nav-link" aria-current={current} title={item.label}>
      <Icon name={item.icon} size={20} /><span className="nav-link__text">{item.label}</span>
      <NavBadge count={item.badge ?? 0} />{badge && <span className="sr-only">, {item.badge} menunggu tindakan</span>}
    </Link>
  );
}

export function SubNavLink({ item }: { item: NavItem }) {
  const active = isActive(usePathname(), item);
  return (
    <Link href={item.href} className="nav-link" aria-current={active ? 'page' : undefined}>
      <Icon name={item.icon} size={18} /><span className="nav-link__text">{item.label}</span>
    </Link>
  );
}

// Lembar "Lainnya" untuk layar sempit: sisa halaman, akun, dan keluar/masuk.
export function MoreSheet({ items, children }: { items: NavItem[]; children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => { ref.current?.close(); }, [pathname]);
  const anyActive = items.some((i) => isActive(pathname, i));
  return (
    <>
      <button type="button" className="tab" aria-haspopup="dialog" aria-current={anyActive ? 'page' : undefined} onClick={() => ref.current?.showModal()}>
        <Icon name="menu" size={22} /><span>Lainnya</span>
      </button>
      <dialog ref={ref} className="sheet" aria-labelledby="more-title"
        onClick={(e) => { if (e.target === e.currentTarget) ref.current?.close(); }}>
        <div className="sheet__grab" aria-hidden="true" />
        <div className="sheet__head">
          <h2 id="more-title">Menu</h2>
          <button type="button" className={cx('btn btn--ghost btn--icon')} aria-label="Tutup menu" onClick={() => ref.current?.close()}><Icon name="x" /></button>
        </div>
        <div className="sheet__body">
          <div className="nav__group">
            {items.map((i) => (
              <Link key={i.href} href={i.href} className="nav-link" aria-current={isActive(pathname, i) ? 'page' : undefined}>
                <Icon name={i.icon} size={20} /><span className="nav-link__text">{i.label}</span>
                <NavBadge count={i.badge ?? 0} />{badgeText(i.badge) && <span className="sr-only">, {i.badge} menunggu tindakan</span>}
              </Link>))}
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
