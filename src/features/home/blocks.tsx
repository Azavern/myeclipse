import Link from 'next/link';
import type { ReactNode } from 'react';
import { ExtLink } from '@/components/states';
import { Icon, type IconName } from '@/components/ui/icon';
import { Avatar, DateBadge, EmptyState, StatTile, Tile, type Tone } from '@/components/ui/primitives';
import { MemberCard, type MemberItem } from '@/features/members/member-card';
import { TaskRow, type TaskItem } from '@/features/tasks/task-row';
import { cx } from '@/lib/cx';
import { formatClock, formatShortDate, hm, zoneLabel } from '@/lib/time';

export type ScheduleItem = { id: string; title: string; start_time: string; end_time: string; location: string | null; type: 'class' | 'activity' };
export type EventItem = { id: string; title: string; start_at: string; location: string | null };
export type Overview = { members_count: number | null; upcoming_events_count: number | null; active_tasks_count: number | null; due_soon_tasks_count: number | null };
export type ActivityWeek = { week_start: string; activity_count: number };

function BlockCard({ id, title, icon, href, linkLabel, flush, children }: {
  id: string; title: ReactNode; icon: IconName; href?: string; linkLabel?: string; flush?: boolean; children: ReactNode;
}) {
  return (
    <section className={cx('card', flush && 'card--flush')} aria-labelledby={id}>
      <div className={cx('card__head', flush && 'card__head--pad')}>
        <h2 id={id} className="card__title"><Icon name={icon} size={20} />{title}</h2>
        {href && <Link href={href} className="btn btn--ghost btn--sm">{linkLabel}<Icon name="arrow-right" size={16} /></Link>}
      </div>
      {children}
    </section>
  );
}

export type OverviewTile = { icon: IconName; value: number; label: string; tone: Tone };

// Daftar metrik dipakai dua kali: sebagai kartu statistik (anggota) dan sebagai panel kaca di hero tamu.
export function overviewTiles(ov: Overview): OverviewTile[] {
  const tiles: OverviewTile[] = [];
  if (ov.members_count !== null) tiles.push({ icon: 'users', value: ov.members_count, label: 'Anggota aktif', tone: 'brand' });
  if (ov.upcoming_events_count !== null) tiles.push({ icon: 'calendar-days', value: ov.upcoming_events_count, label: 'Event mendatang', tone: 'accent' });
  if (ov.active_tasks_count !== null) tiles.push({ icon: 'tasks', value: ov.active_tasks_count, label: 'Tugas aktif', tone: 'brand' });
  if (ov.due_soon_tasks_count !== null) tiles.push({ icon: 'hourglass', value: ov.due_soon_tasks_count, label: 'Tenggat dalam 3 hari', tone: ov.due_soon_tasks_count > 0 ? 'warning' : 'success' });
  return tiles;
}

export function Hero({ name, tagline, description, highlight, highlightUrl, coverUrl, todayLabel, guest, stats, secondary }: {
  name: string; tagline: string | null; description?: string | null; highlight: string | null; highlightUrl: string | null;
  coverUrl?: string; todayLabel: string; guest: boolean; stats?: OverviewTile[];
  secondary?: { href: string; label: string; icon: IconName } | null;
}) {
  return (
    <section className={cx('hero', coverUrl && 'hero--cover', guest && 'hero--guest')} aria-labelledby="class-name">
      {coverUrl && <img className="hero__img" src={coverUrl} alt="" width={1600} height={900} decoding="async" fetchPriority="high" />}
      <div className="hero__body">
        <div className="hero__meta">
          <span className="chip chip--onhero"><Icon name="calendar" size={14} />{todayLabel}</span>
          {highlight && (highlightUrl
            ? <ExtLink href={highlightUrl} className="chip chip--onhero"><Icon name="sparkles" size={14} />{highlight}</ExtLink>
            : <span className="chip chip--onhero"><Icon name="sparkles" size={14} />{highlight}</span>)}
        </div>
        <h1 id="class-name" className="hero__title">{name}</h1>
        {tagline && <p className="hero__tagline">{tagline}</p>}
        {guest && description && <p className="hero__desc">{description}</p>}
        {guest && (
          <div className="hero__actions">
            <Link href="/login" className="btn btn--onhero-solid btn--lg"><Icon name="log-in" size={18} />Masuk ke kelas</Link>
            {secondary && <Link href={secondary.href} className="btn btn--onhero btn--lg"><Icon name={secondary.icon} size={18} />{secondary.label}</Link>}
            <Link href="/inventory/access" className="btn btn--onhero btn--lg"><Icon name="key" size={18} />Akses inventory</Link>
          </div>)}
      </div>
      {guest && stats && stats.length > 0 && (
        <ul className="hero__stats" aria-label="Ringkasan kelas">
          {stats.map((s) => (
            <li key={s.label} className="hero__stat">
              <span className="hero__stat-icon"><Icon name={s.icon} size={18} /></span>
              <span className="hero__stat-value">{s.value}</span>
              <span className="hero__stat-label">{s.label}</span>
            </li>))}
        </ul>)}
    </section>
  );
}

export type ExploreItem = { href: string; label: string; desc: string; icon: IconName };

// Pintu masuk ke halaman publik yang memang boleh dilihat tamu; urutannya mengikuti navigasi utama.
export function ExploreBlock({ items }: { items: ExploreItem[] }) {
  return (
    <section className="explore" aria-labelledby="h-explore">
      <div className="section__head">
        <h2 id="h-explore" className="section__title"><Icon name="sparkles" size={20} />Jelajahi kelas</h2>
      </div>
      <ul className="explore__grid">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="card card--link explore__card">
              <Tile icon={i.icon} />
              <span className="explore__text">
                <span className="explore__label">{i.label}</span>
                <span className="explore__desc">{i.desc}</span>
              </span>
              <Icon name="arrow-right" size={18} className="explore__go" />
            </Link>
          </li>))}
      </ul>
    </section>
  );
}

export function OverviewTiles({ ov }: { ov: Overview }) {
  const tiles = overviewTiles(ov);
  if (tiles.length === 0) return null;
  return (
    <section aria-label="Ringkasan kelas"><div className="stat-grid">{tiles.map((t) => <StatTile key={t.label} {...t} />)}</div></section>
  );
}

export function ScheduleBlock({ rows, tz, now, dayName }: { rows: ScheduleItem[]; tz: string; now: Date; dayName: string }) {
  const clock = formatClock(now.toISOString(), tz);
  return (
    <BlockCard id="h-sched" icon="calendar" title={<>Kuliah hari ini<span className="muted"> · {dayName} ({zoneLabel(tz)})</span></>} href="/schedule" linkLabel="Semua jadwal">
      {rows.length === 0
        ? <EmptyState slim icon="calendar" title="Tidak ada jadwal hari ini">Waktunya istirahat atau mengejar tugas.</EmptyState>
        : (
          <ol className="tl">
            {rows.slice(0, 6).map((r) => {
              const live = hm(r.start_time) <= clock && clock < hm(r.end_time);
              return (
                <li key={r.id} className="tl__item">
                  <div className="tl__time">{hm(r.start_time)}<span>{hm(r.end_time)}</span></div>
                  <div className={cx('tl__body', r.type === 'activity' && 'tl__body--activity')}>
                    <span className="tl__title">{r.title}</span>
                    <div className="meta">
                      {r.location && <span><Icon name="map-pin" size={14} />{r.location}</span>}
                      {live && <span className="chip chip--brand">Berlangsung</span>}
                    </div>
                  </div>
                </li>);
            })}
          </ol>)}
    </BlockCard>
  );
}

export function TasksBlock({ rows, tz, now }: { rows: TaskItem[]; tz: string; now: Date }) {
  return (
    <BlockCard id="h-tasks" icon="tasks" title="Tugas" href="/tasks" linkLabel="Semua tugas" flush>
      {rows.length === 0
        ? <EmptyState slim icon="check-circle" title="Tidak ada tugas aktif">Semua tugas sudah beres.</EmptyState>
        : <ul className="rows">{rows.map((t) => <TaskRow key={t.id} t={t} tz={tz} now={now} />)}</ul>}
    </BlockCard>
  );
}

export function EventsBlock({ rows, tz }: { rows: EventItem[]; tz: string }) {
  return (
    <BlockCard id="h-events" icon="calendar-days" title="Event mendatang" href="/events" linkLabel="Semua event" flush>
      {rows.length === 0
        ? <EmptyState slim icon="calendar-days" title="Belum ada event mendatang">Kegiatan kelas akan muncul di sini.</EmptyState>
        : (
          <ul className="rows">
            {rows.map((e) => (
              <li key={e.id} className="row">
                <DateBadge iso={e.start_at} tz={tz} />
                <div className="row__body">
                  <Link href={`/events/${e.id}`} className="row__title stretch">{e.title}</Link>
                  <div className="meta">
                    <span><Icon name="clock" size={14} />{formatClock(e.start_at, tz)} {zoneLabel(tz)}</span>
                    {e.location && <span><Icon name="map-pin" size={14} />{e.location}</span>}
                  </div>
                </div>
              </li>))}
          </ul>)}
    </BlockCard>
  );
}

// Diagram batang HTML: ukuran teks tetap di semua lebar layar. Tinggi batang dikuantisasi ke kelas .pct-N (kelipatan 5%),
// sehingga tidak perlu atribut style (CSP). Angka tiap pekan tertulis di dalam daftar, jadi diagram tidak mengandalkan bentuk saja.
export function ActivityBlock({ rows }: { rows: ActivityWeek[] }) {
  const total = rows.reduce((a, r) => a + r.activity_count, 0);
  const max = Math.max(1, ...rows.map((r) => r.activity_count));
  return (
    <BlockCard id="h-act" icon="activity" title={`Aktivitas ${rows.length} pekan terakhir`}>
      {total === 0
        ? <EmptyState slim icon="activity" title="Belum ada aktivitas">Perubahan jadwal, tugas, dan event akan tercatat di sini.</EmptyState>
        : (
          <>
            <ol className="bars" aria-labelledby="h-act">
              {rows.map((r, i) => (
                <li key={r.week_start}>
                  <span className="bars__val">{r.activity_count}</span>
                  <span className="bars__track" aria-hidden="true">
                    <span className={cx('bars__bar', `pct-${Math.round((r.activity_count / max) * 20) * 5}`, i === rows.length - 1 && 'bars__bar--now')} />
                  </span>
                  <span className="bars__lab"><span className="sr-only">Pekan </span>{formatShortDate(r.week_start)}</span>
                </li>))}
            </ol>
            <p className="muted">{total} perubahan tercatat dalam {rows.length} pekan.</p>
          </>)}
    </BlockCard>
  );
}

export function MembersBlock({ rows, avatars, large }: { rows: MemberItem[]; avatars: Map<string, string>; large?: boolean }) {
  if (rows.length === 0) return null;
  if (large) {
    return (
      <section aria-labelledby="h-members">
        <div className="section__head">
          <h2 id="h-members" className="section__title"><Icon name="users" size={20} />Anggota terbaru</h2>
          <Link href="/members" className="btn btn--ghost btn--sm">Semua anggota<Icon name="arrow-right" size={16} /></Link>
        </div>
        <ul className="member-grid">{rows.map((m) => <MemberCard key={m.username} m={m} avatar={m.avatar_path ? avatars.get(m.avatar_path) : undefined} />)}</ul>
      </section>
    );
  }
  return (
    <BlockCard id="h-members" icon="users" title="Anggota terbaru" href="/members" linkLabel="Semua anggota" flush>
      <ul className="rows">
        {rows.slice(0, 5).map((m) => (
          <li key={m.username} className="row">
            <Avatar name={m.full_name} src={m.avatar_path ? avatars.get(m.avatar_path) : undefined} />
            <div className="row__body">
              <Link href={`/members/${m.username}`} className="row__title stretch">{m.full_name}</Link>
              <span className="muted">{m.role_name}</span>
            </div>
          </li>))}
      </ul>
    </BlockCard>
  );
}
