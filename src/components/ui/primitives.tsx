import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { dateParts, formatClock } from '@/lib/time';
import { TASK_LABEL, type TaskDisplayStatus } from '@/lib/tasks';
import { Icon, type IconName } from './icon';

export type Tone = 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'neutral';

// ---- Avatar: foto bila ada, selain itu inisial dengan warna stabil dari nama ----
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
const hue = (seed: string) => [...seed].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5;
const AV_PX = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 } as const;

export function Avatar({ name, src, size = 'md', className, seed }: { name: string; src?: string | null; size?: keyof typeof AV_PX; className?: string; seed?: string }) {
  const px = AV_PX[size];
  return (
    <span data-ui="avatar" className={cx('avatar', size !== 'md' && `avatar--${size}`, !src && `av-${hue(seed ?? name)}`, className)} aria-hidden="true">
      {src ? <img src={src} alt="" width={px} height={px} loading="lazy" decoding="async" /> : initials(name)}
    </span>
  );
}

// ---- Gambar dari Storage (URL bertanda tangan) dengan fallback bertema ----
export function StorageImage({ src, alt, width, height, ratio = 'media', icon = 'image', priority = false, className }: {
  src?: string | null; alt: string; width: number; height: number; ratio?: 'media' | 'wide' | 'hero' | 'sq'; icon?: IconName; priority?: boolean; className?: string;
}) {
  const cls = cx('media', ratio === 'wide' && 'media--wide', ratio === 'hero' && 'media--hero', ratio === 'sq' && 'media--sq', className);
  if (!src) return <div className={cx(cls, 'media--ph')} aria-hidden="true"><Icon name={icon} size={32} /></div>; // pengganti dekoratif
  return (
    <div className={cls}>
      <img src={src} alt={alt} width={width} height={height} decoding="async" {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })} />
    </div>
  );
}

// ---- Chip, tile ikon, notice ----
export function Chip({ tone = 'neutral', icon, children, className }: { tone?: Tone | 'outline'; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span data-ui="badge" className={cx('chip', tone !== 'neutral' && `chip--${tone}`, className)}>
      {icon && <Icon name={icon} size={14} />}{children}
    </span>
  );
}
export function Tile({ icon, tone = 'brand', size, className }: { icon: IconName; tone?: Tone; size?: 'sm' | 'lg'; className?: string }) {
  return <span className={cx('tile', tone !== 'brand' && `tile--${tone}`, size && `tile--${size}`, className)}><Icon name={icon} size={size === 'lg' ? 28 : size === 'sm' ? 18 : 22} /></span>;
}
const NOTICE_ICON: Record<'info' | 'error' | 'success' | 'warning', IconName> = { info: 'info', error: 'alert-circle', success: 'check-circle', warning: 'alert-triangle' };
export function Notice({ tone = 'info', children, role }: { tone?: keyof typeof NOTICE_ICON; children: ReactNode; role?: 'alert' | 'status' }) {
  return <div className={cx('notice', tone !== 'info' && `notice--${tone}`)} role={role}><Icon name={NOTICE_ICON[tone]} size={18} /><div>{children}</div></div>;
}

// ---- Kepala halaman, breadcrumb, seksi, statistik ----
export type Crumb = { label: string; href?: string };
export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <span key={c.label} className="cluster">
          {i > 0 && <Icon name="chevron-right" size={14} />}
          {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}
export function PageHeader({ icon, title, description, actions, crumbs, id = 'page-title' }: {
  icon?: IconName; title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]; id?: string;
}) {
  return (
    <>
      {crumbs && <Crumbs items={crumbs} />}
      <header className="page-head">
        <div className="page-head__main">
          {icon && <Tile icon={icon} size="lg" />}
          <div className="page-head__text">
            <h1 id={id}>{title}</h1>
            {description && <p className="page-head__desc">{description}</p>}
          </div>
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </header>
    </>
  );
}
// Kartu berjudul dengan satu resep kepala: tinggi minimal 3.5rem (3rem di mobile), ikon + judul +
// meta opsional, aksi di kanan, dan garis pemisah yang selalu ada. Desktop memotong judul;
// di mobile judul membungkus dan meta turun ke baris kedua.
export function SectionCard({ id, title, icon, meta, action, footer, flush, children, className }: {
  id: string; title: ReactNode; icon: IconName; meta?: ReactNode; action?: ReactNode; footer?: ReactNode;
  flush?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <section data-ui="panel" className={cx('card', 'scard', flush && 'card--flush', className)} aria-labelledby={id}>
      <div className="scard__head" data-ui="section-head">
        <h2 id={id} className="scard__title" data-ui="section-title">
          <Icon name={icon} size={20} />
          <span className="scard__label">{title}</span>
          {meta && <span className="scard__meta">{meta}</span>}
        </h2>
        {action && <div className="scard__action" data-ui="section-action">{action}</div>}
      </div>
      <div className={cx('scard__body', flush && 'scard__body--flush')}>{children}</div>
      {footer}
    </section>
  );
}
export function Section({ id, title, icon, action, children, className }: { id: string; title: string; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('section', className)} aria-labelledby={id}>
      <div className="section__head">
        <h2 id={id} className="section__title">{icon && <Icon name={icon} size={20} />}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function StatTile({ icon, value, label, tone = 'brand' }: { icon: IconName; value: number | string; label: string; tone?: Tone }) {
  return (
    <div data-ui="panel" className="card stat">
      <Tile icon={icon} tone={tone} />
      <div><div className="stat__value">{value}</div><div className="stat__label">{label}</div></div>
    </div>
  );
}

// ---- Tombol/tautan, tab, kartu kosong ----
type BtnProps = { variant?: 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger-soft' | 'onhero'; size?: 'sm' | 'lg'; icon?: IconName; className?: string };
export const btnClass = ({ variant = 'primary', size, className }: BtnProps) =>
  cx('btn', variant !== 'primary' && `btn--${variant}`, size && `btn--${size}`, className);
export function LinkButton({ href, children, icon, ...rest }: BtnProps & { href: string; children: ReactNode }) {
  return <Link data-ui="button" href={href} className={btnClass(rest)}>{icon && <Icon name={icon} size={18} />}{children}</Link>;
}
export function Segmented({ label, items }: { label: string; items: { href: string; label: string; active: boolean; icon?: IconName }[] }) {
  return (
    <nav className="segmented" aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? 'page' : undefined}>{i.icon && <Icon name={i.icon} size={16} />}{i.label}</Link>))}
    </nav>
  );
}
export function EmptyState({ icon = 'sparkles', title, children, action, compact, slim, page }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean; slim?: boolean; page?: boolean }) {
  const Title = page ? 'h1' : 'p'; // state yang menggantikan seluruh halaman memegang h1
  return (
    <div className={cx('empty', compact && 'empty--compact', slim && 'empty--slim')}>
      <div className="empty__art"><Icon name={icon} size={compact ? 28 : 36} /></div>
      <Title className="empty__title">{title}</Title>
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  );
}

// ---- Tanggal dan status tugas ----
export function DateBadge({ iso, tz, past }: { iso: string; tz: string; past?: boolean }) {
  const p = dateParts(iso, tz);
  return <span className={cx('date-badge', past && 'date-badge--past')} aria-hidden="true"><b>{p.day}</b><span>{p.mon}</span></span>;
}
export const timeRange = (a: string, b: string, tz: string) => `${formatClock(a, tz)}–${formatClock(b, tz)}`;

export const TASK_UI: Record<TaskDisplayStatus, { tone: Tone; icon: IconName }> = {
  completed: { tone: 'success', icon: 'check-circle' }, archived: { tone: 'neutral', icon: 'archive' },
  overdue: { tone: 'error', icon: 'alert-triangle' }, due_soon: { tone: 'warning', icon: 'hourglass' }, active: { tone: 'brand', icon: 'clock' },
};
export function TaskStatusChip({ status }: { status: TaskDisplayStatus }) {
  const u = TASK_UI[status];
  return <Chip tone={u.tone} icon={u.icon}>{TASK_LABEL[status]}</Chip>;
}
