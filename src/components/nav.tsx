'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
// Bagian atas dapat digeser ke bawah untuk menutup, selain tombol tutup dan backdrop.
export function MoreSheet({ items, children }: { items: NavItem[]; children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const dragging = useRef<{ id: number; startY: number; startedAt: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const pathname = usePathname();

  function reset() {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.classList.remove('sheet--dragging', 'sheet--closing');
    delete dialog.dataset.drag;
  }

  function closeSheet() {
    reset();
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    ref.current?.close();
  }

  function openSheet() {
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    reset();
    ref.current?.showModal();
  }

  useEffect(() => { closeSheet(); }, [pathname]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Kontrol di dalam header tetap menerima klik normal.
    if ((e.target as Element).closest('button, a')) return;
    const dialog = ref.current;
    if (!dialog) return;
    dragging.current = { id: e.pointerId, startY: e.clientY, startedAt: performance.now() };
    e.currentTarget.setPointerCapture(e.pointerId);
    dialog.classList.add('sheet--dragging');
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragging.current;
    if (!drag || drag.id !== e.pointerId) return;
    // Langkah 4px memakai atribut data + kelas CSS. Atribut style diblokir CSP.
    const step = Math.min(120, Math.round(Math.max(0, e.clientY - drag.startY) / 4) * 4);
    const dialog = ref.current;
    if (dialog) dialog.dataset.drag = String(step);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragging.current;
    if (!drag || drag.id !== e.pointerId) return;
    dragging.current = null;
    const dialog = ref.current;
    if (!dialog) return;
    const delta = Math.max(0, e.clientY - drag.startY);
    const quick = delta > 32 && delta / Math.max(1, performance.now() - drag.startedAt) > 0.5;
    dialog.classList.remove('sheet--dragging');
    if (delta > 96 || quick) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { closeSheet(); return; }
      delete dialog.dataset.drag;
      dialog.classList.add('sheet--closing');
      closeTimer.current = window.setTimeout(closeSheet, 210);
    } else {
      delete dialog.dataset.drag;
    }
  }

  function onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragging.current?.id !== e.pointerId) return;
    dragging.current = null;
    reset();
  }

  const anyActive = items.some((i) => isActive(pathname, i));
  return (
    <>
      <button type="button" className="tab" aria-haspopup="dialog" aria-current={anyActive ? 'page' : undefined} onClick={openSheet}>
        <Icon name="menu" size={22} /><span>Lainnya</span>
      </button>
      <dialog ref={ref} className="sheet" aria-labelledby="more-title" aria-describedby="more-hint"
        onClose={reset}
        onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
        <div className="sheet__drag"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
          <div className="sheet__grab" aria-hidden="true" />
          <div className="sheet__head">
            <h2 id="more-title">Menu</h2>
            <button type="button" className={cx('btn btn--ghost btn--icon')} aria-label="Tutup menu" onClick={closeSheet}><Icon name="x" /></button>
          </div>
        </div>
        <p id="more-hint" className="sr-only">Geser bagian atas menu ke bawah untuk menutup.</p>
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
