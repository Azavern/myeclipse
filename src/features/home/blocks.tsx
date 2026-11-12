import Link from 'next/link';
import { LoginLink } from '@/components/login-link';
import { ExtLink } from '@/components/states';
import { Icon, type IconName } from '@/components/ui/icon';
import { Marquee } from '@/components/ui/marquee';
import { Avatar, Chip, DateBadge, EmptyState, SectionCard, Tile, type Tone } from '@/components/ui/primitives';
import { activitySummary, deadlineBadge, DUE_SOON_DAYS, homeTaskGroups, memberRoleLabel, nextClass, sessionState, summaryTiles, type SessionState } from '@/features/home/derive';
import { MemberCard, type MemberItem } from '@/features/members/member-card';
import type { TaskItem } from '@/features/tasks/task-row';
import { cx } from '@/lib/cx';
import { formatRupiah } from '@/lib/kas/format';
import { formatClock, formatShortDate, formatWeekdayDate, formatWhen, hm, relativeTime, zoneLabel } from '@/lib/time';

export type ScheduleItem = { id: string; title: string; start_time: string; end_time: string; location: string | null; type: 'class' | 'activity'; day_of_week: number };
export type EventItem = { id: string; title: string; start_at: string; location: string | null };
export type Overview = { members_count: number | null; upcoming_events_count: number | null; active_tasks_count: number | null; due_soon_tasks_count: number | null };
export type ActivityWeek = { week_start: string; activity_count: number };
export type KasHomeSummary = { balance: number; own_unpaid: number; own_pending: number };

export type OverviewTile = { icon: IconName; value: number; label: string; tone: Tone };

// Daftar metrik dipakai dua kali: sebagai kartu statistik (anggota) dan sebagai panel kaca di hero tamu.
export function overviewTiles(ov: Overview): OverviewTile[] {
  const tiles: OverviewTile[] = [];
  if (ov.members_count !== null) tiles.push({ icon: 'users', value: ov.members_count, label: 'Anggota aktif', tone: 'brand' });
  if (ov.upcoming_events_count !== null) tiles.push({ icon: 'calendar-days', value: ov.upcoming_events_count, label: 'Event mendatang', tone: 'accent' });
  if (ov.active_tasks_count !== null) tiles.push({ icon: 'tasks', value: ov.active_tasks_count, label: 'Tugas aktif', tone: 'brand' });
  if (ov.due_soon_tasks_count !== null) tiles.push({
    icon: ov.due_soon_tasks_count > 0 ? 'alert-triangle' : 'check-circle', value: ov.due_soon_tasks_count,
    label: 'Perlu tindakan', tone: ov.due_soon_tasks_count > 0 ? 'warning' : 'neutral',
  });
  return tiles;
}

export function Hero({ name, tagline, description, highlight, highlightUrl, coverUrl, todayLabel, guest, stats, secondary }: {
  name: string; tagline: string | null; description?: string | null; highlight: string | null; highlightUrl: string | null;
  coverUrl?: string; todayLabel: string; guest: boolean; stats?: OverviewTile[];
  secondary?: { href: string; label: string; icon: IconName } | null;
}) {
  const hasCover = !!coverUrl;
  const highlightText = highlight?.trim() || null;
  const highlightLink = highlightText && highlightUrl?.startsWith('https://') ? highlightUrl : null;
  const highlightBody = highlightText ? (
    <span className="hero__highlight-body">
      <span className="hero__highlight-label">Sorotan</span>
      <span className="hero__highlight-text" title={highlightText}>{highlightText}</span>
    </span>
  ) : null;
  const context = (
    <div className="hero__context">
      <p className="hero__today">
        <span className="hero__today-label">Hari ini</span>
        <span className="hero__today-date"><Icon name="calendar" size={16} />{todayLabel}</span>
      </p>
      {highlightBody && (highlightLink
        ? <ExtLink href={highlightLink} className="hero__highlight hero__highlight--link">{highlightBody}</ExtLink>
        : <p className="hero__highlight">{highlightBody}</p>)}
    </div>
  );
  const statsList = guest && stats && stats.length > 0 ? (
    <ul className="hero__stats" aria-label="Ringkasan kelas">
      {stats.map((s) => (
        <li key={s.label} className="hero__stat">
          <span className="hero__stat-icon"><Icon name={s.icon} size={18} /></span>
          <span className="hero__stat-value">{s.value}</span>
          <span className="hero__stat-label">{s.label}</span>
        </li>))}
    </ul>
  ) : null;
  return (
    <section data-ui="hero" className={cx('hero', hasCover && 'hero--cover', guest && 'hero--guest')} aria-labelledby="class-name">
      {coverUrl && (
        <div className="hero__cover">
          <img className="hero__img" src={coverUrl} alt={`Sampul kelas ${name}`} width={1600} height={500} decoding="async" fetchPriority="high" />
        </div>)}
      <div className="hero__body">
        <div className="hero__identity">
          <div className="hero__lead">
            <div className="hero__identity-main">
              <h1 id="class-name" className="hero__title">{name}</h1>
              {tagline && <p className="hero__tagline">{tagline}</p>}
              {guest && description && <p className="hero__desc">{description}</p>}
            </div>
            {guest && (
              <div className="hero__actions">
                <LoginLink data-ui="button" className={cx('btn btn--lg', !hasCover && 'btn--onhero-solid')}><Icon name="log-in" size={18} />Masuk ke kelas</LoginLink>
                {secondary && <Link data-ui="button" href={secondary.href} className={cx('btn btn--lg', hasCover ? 'btn--secondary' : 'btn--onhero')}><Icon name={secondary.icon} size={18} />{secondary.label}</Link>}
                <Link data-ui="button" href="/qr" className={cx('btn btn--lg', hasCover ? 'btn--secondary' : 'btn--onhero')}><Icon name="qr" size={18} />Buat QR</Link>
                <Link data-ui="button" href="/inventory/access" className={cx('btn btn--lg', hasCover ? 'btn--secondary' : 'btn--onhero')}><Icon name="key" size={18} />Akses inventory</Link>
              </div>)}
          </div>
          {guest ? (
            <div className="hero__side">
              {context}
              {statsList}
            </div>
          ) : context}
        </div>
      </div>
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
            <Link data-ui="panel" href={i.href} className="card card--link explore__card">
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

// Ringkasan member: tile kecil yang seluruhnya dapat diklik, dengan nada semantik hanya untuk tindakan.
export function OverviewTiles({ ov }: { ov: Overview }) {
  const tiles = summaryTiles(ov);
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="h-summary">
      <h2 id="h-summary" className="sr-only">Ringkasan kelas</h2>
      <ul className="sum">
        {tiles.map((t) => {
          const empty = t.value === 0;
          return (
            <li key={t.key}>
              <Link href={t.href} className={cx('sum__item', t.tone === 'warning' && 'sum__item--warning', t.key === 'due' && 'sum__item--due')}>
                <span className="sum__icon"><Icon name={t.icon} size={20} /></span>
                <span className="sum__body">
                  {empty && <span className="sum__empty">{t.empty}</span>}
                  <span className={cx('sum__value', empty && 'sum__value--empty')}>{t.value}</span>
                  <span className={cx('sum__label', empty && 'sum__label--empty')}><Marquee>{t.label}</Marquee></span>
                  {t.note && <span className={cx('sum__note', empty && 'sum__note--empty')}><Marquee>{t.note}</Marquee></span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SESSION_UI: Record<SessionState, { label: string; icon: IconName }> = {
  done: { label: 'Selesai', icon: 'check-circle' },
  live: { label: 'Berlangsung', icon: 'activity' },
  next: { label: 'Berikutnya', icon: 'clock' },
};

// Aksi "Semua …" di kepala SectionCard. Di ponsel labelnya dipendekkan menjadi "Semua"
// agar judul section mendapat ruang; nama aksesibel lengkap tetap berasal dari aria-label.
export function SectionLink({ href, label, short = 'Semua' }: { href: string; label: string; short?: string }) {
  return (
    <Link data-ui="button" href={href} aria-label={label} className="btn btn--ghost btn--sm scard__link">
      <span className="scard__link-long">{label}</span>
      <span className="scard__link-short" aria-hidden="true">{short}</span>
      <Icon name="arrow-right" size={16} />
    </Link>
  );
}

export function SectionFoot({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="tmore scard__foot">
      <Marquee>{label}</Marquee>
      <Icon name="arrow-right" size={16} />
    </Link>
  );
}

export function ScheduleBlock({ rows, all, tz, now, dayName, day }: {
  rows: ScheduleItem[]; all: ScheduleItem[]; tz: string; now: Date; dayName: string; day: number;
}) {
  const states = rows.map((row) => sessionState(row.start_time, row.end_time, now, tz));
  const hasUpcoming = states.some((state) => state !== 'done');
  const upcoming = hasUpcoming ? null : nextClass(all, day, now);
  return (
    <SectionCard id="h-sched" icon="calendar-clock" title={<Marquee>Kuliah hari ini</Marquee>} meta={<Marquee>{`${dayName} (${zoneLabel(tz)})`}</Marquee>} flush
      className="scard--mobile-foot" action={<SectionLink href="/schedule" label="Semua jadwal" />}
      footer={<SectionFoot href="/schedule" label="Lihat semua jadwal" />}>
      {hasUpcoming
        ? (
          <ol className="sched">
            {rows.slice(0, 6).map((row, i) => {
              const state = states[i] ?? 'next';
              const ui = SESSION_UI[state];
              return (
                <li key={row.id} className={cx('sched__item', state !== 'done' && `sched__item--${state}`)}>
                  <div className="sched__time">{hm(row.start_time)}<span>{hm(row.end_time)}</span></div>
                  <div className="sched__body">
                    <span className="sched__title">{row.title}</span>
                    <div className="meta">
                      {row.location && <span><Icon name="map-pin" size={14} />{row.location}</span>}
                      <span className={cx('sched__status', `sched__status--${state}`)}><Icon name={ui.icon} size={14} />{ui.label}</span>
                    </div>
                  </div>
                </li>);
            })}
          </ol>)
        : upcoming
          ? (
            <div className="nextclass">
              <Icon name="calendar-clock" size={18} />
              <div className="nextclass__body">
                <span className="nextclass__label">Kuliah berikutnya<span className="nextclass__sep">:</span></span>{' '}
                <span className="nextclass__when">{formatWeekdayDate(upcoming.at.toISOString(), tz)} · {hm(upcoming.row.start_time)}</span>
                <span className="nextclass__sep" aria-hidden="true"> — </span>
                <strong className="nextclass__title">{upcoming.row.title}</strong>
              </div>
            </div>)
          : <EmptyState slim icon="calendar" title="Tidak ada jadwal">Jadwal kuliah semester ini belum diisi.</EmptyState>}
    </SectionCard>
  );
}

function HomeTaskGroup({ id, title, tone, items, tz, now, mobileHidden }: {
  id: string; title: string; tone: 'warning' | 'danger'; items: TaskItem[]; tz: string; now: Date; mobileHidden: ReadonlySet<string>;
}) {
  const hiddenOnMobile = items.every((t) => mobileHidden.has(t.id));
  return (
    <section className={cx('tgroup', `tgroup--${tone}`, hiddenOnMobile && 'tgroup--mobile-hidden')} aria-labelledby={id}>
      <h3 id={id} className="tgroup__head">
        <Icon name={tone === 'danger' ? 'alert-triangle' : 'hourglass'} size={16} />
        <span>{title}</span>
        <span className="tgroup__count">· {items.length}</span>
      </h3>
      <ul className="tgroup__list">
        {items.map((t) => (
          <li key={t.id} className={cx('htask', mobileHidden.has(t.id) && 'htask--mobile-hidden')}>
            <Link href={`/tasks/${t.id}`} className="htask__row">
              <span className="htask__main">
                <span className="htask__title">{t.title}</span>
                <span className="meta htask__meta">
                  <span className="htask__course"><Icon name="book" size={14} />{t.course ?? 'Tanpa mata kuliah'}</span>
                  <span className="htask__deadline"><Icon name="clock" size={14} />{formatWhen(t.deadline, tz)}</span>
                </span>
              </span>
              <Chip tone={tone === 'danger' ? 'error' : 'warning'} icon={tone === 'danger' ? 'alert-triangle' : 'hourglass'}>{deadlineBadge(t.deadline, now)}</Chip>
            </Link>
          </li>))}
      </ul>
    </section>
  );
}

export function TasksBlock({ rows, tz, now }: { rows: TaskItem[]; tz: string; now: Date }) {
  const { soon, overdue, hidden } = homeTaskGroups(rows, now);
  const urgent = soon.length + overdue.length;
  const visibleTasks = [...soon, ...overdue];
  const mobileHidden = new Set(visibleTasks.slice(3).map((t) => t.id));
  return (
    <SectionCard id="h-tasks" icon="tasks" title={<Marquee>Tugas</Marquee>} flush
      className="scard--mobile-foot" action={<SectionLink href="/tasks" label="Semua tugas" />}
      footer={<SectionFoot href="/tasks" label={`Lihat semua ${rows.length} tugas`} />}>
      {urgent === 0
        ? (
          <EmptyState slim icon="check-circle" title={rows.length === 0 ? 'Tidak ada tugas aktif' : 'Tidak ada tugas mendesak'}>
            {rows.length === 0 ? 'Semua tugas sudah beres.' : `Tenggat terdekat masih lebih dari ${DUE_SOON_DAYS} hari.`}
          </EmptyState>)
        : (
          <>
            {soon.length > 0 && <HomeTaskGroup id="h-tasks-warning" title="Segera berakhir" tone="warning" items={soon} tz={tz} now={now} mobileHidden={mobileHidden} />}
            {overdue.length > 0 && <HomeTaskGroup id="h-tasks-overdue" title="Lewat tenggat" tone="danger" items={overdue} tz={tz} now={now} mobileHidden={mobileHidden} />}
            {hidden > 0 && <Link href="/tasks" className="tmore tmore--desktop">+{hidden} lainnya<Icon name="arrow-right" size={16} /></Link>}
          </>)}
    </SectionCard>
  );
}

export function EventsBlock({ rows, tz, now }: { rows: EventItem[]; tz: string; now: Date }) {
  return (
    <SectionCard id="h-events" icon="calendar-days" title={<Marquee>Event mendatang</Marquee>} flush
      className="scard--mobile-foot" action={<SectionLink href="/events" label="Semua event" />}
      footer={<SectionFoot href="/events" label="Lihat semua event" />}>
      {rows.length === 0
        ? <EmptyState slim icon="calendar-days" title="Belum ada event mendatang">Kegiatan kelas akan muncul di sini.</EmptyState>
        : (
          <ul className="rows">
            {rows.slice(0, 3).map((e) => (
              <li key={e.id} className="row">
                <DateBadge iso={e.start_at} tz={tz} />
                <div className="row__body">
                  <Link href={`/events/${e.id}`} className="row__title stretch">{e.title}</Link>
                  <div className="meta">
                    <span><Icon name="clock" size={14} />{formatClock(e.start_at, tz)} {zoneLabel(tz)}</span>
                    {e.location && <span><Icon name="map-pin" size={14} />{e.location}</span>}
                    <span>{new Date(e.start_at) <= now ? 'Sedang berlangsung' : relativeTime(e.start_at, now)}</span>
                  </div>
                </div>
              </li>))}
          </ul>)}
    </SectionCard>
  );
}

// Diagram batang HTML: ukuran teks tetap di semua lebar layar. Tinggi batang dikuantisasi ke kelas .pct-N (kelipatan 5%),
// sehingga tidak perlu atribut style (CSP). Angka tiap pekan tertulis di dalam daftar, jadi diagram tidak mengandalkan bentuk saja.
export function ActivityBlock({ rows }: { rows: ActivityWeek[] }) {
  const total = rows.reduce((a, r) => a + r.activity_count, 0);
  const max = Math.max(1, ...rows.map((r) => r.activity_count));
  const chart = (
    <>
      <div role="img" aria-label={activitySummary(rows)}>
        <ol className="bars" aria-hidden="true">
          {rows.map((r, i) => (
            <li key={r.week_start}>
              <span className="bars__val">{r.activity_count}</span>
              <span className="bars__track" aria-hidden="true">
                <span className={cx('bars__bar', `pct-${Math.round((r.activity_count / max) * 20) * 5}`, i === rows.length - 1 && 'bars__bar--now')} />
              </span>
              <span className={cx('bars__lab', i === rows.length - 1 && 'bars__lab--now')}>{i === rows.length - 1 ? 'Pekan ini' : formatShortDate(r.week_start)}</span>
            </li>))}
        </ol>
      </div>
      <p className="muted activity-note">{total} aktivitas tercatat dalam {rows.length} pekan.</p>
      <p className="chart__note">Pekan dimulai Senin.</p>
    </>
  );
  return (
    <SectionCard id="h-act" icon="activity" title={<Marquee>{`Aktivitas ${rows.length} pekan terakhir`}</Marquee>}>
      {total === 0
        ? <EmptyState slim icon="activity" title="Belum ada aktivitas">Aktivitas jadwal, tugas, dan event akan tercatat di sini.</EmptyState>
        : (
          <>
            <div className="act-desktop">{chart}</div>
            <details className="act-disclosure">
              <summary className="act-disclosure__summary">
                <span>{total} aktivitas dalam {rows.length} pekan</span>
                <Icon name="chevron-down" size={18} className="act-disclosure__chevron" />
              </summary>
              <div className="act-disclosure__body">{chart}</div>
            </details>
          </>) }
    </SectionCard>
  );
}

export function KasBlock({ summary }: { summary: KasHomeSummary }) {
  return (
    <SectionCard id="h-kas" icon="wallet" title={<Marquee>Kas kelas</Marquee>}
      action={<SectionLink href="/kas" label="Buka kas" />}
      footer={<SectionFoot href="/kas" label="Lihat rincian kas" />}>
      <div className="kas-home">
        <div>
          <span className="kas-home__label">Saldo kas</span>
          <strong className={cx('kas-home__balance', summary.balance < 0 && 'kas-home__balance--negative')}>
            {formatRupiah(summary.balance)}
          </strong>
        </div>
        <div className="kas-home__notes">
          <span><b>{summary.own_unpaid}</b> iuran belum dibayar</span>
          <span><b>{summary.own_pending}</b> menunggu verifikasi</span>
        </div>
      </div>
    </SectionCard>
  );
}

export function MembersBlock({ rows, avatars, large }: { rows: MemberItem[]; avatars: Map<string, string>; large?: boolean }) {
  if (rows.length === 0) return null;
  if (large) {
    return (
      <section aria-labelledby="h-members">
        <div className="section__head">
          <h2 id="h-members" className="section__title"><Icon name="users" size={20} />Anggota terbaru</h2>
          <Link data-ui="button" href="/members" className="btn btn--ghost btn--sm">Semua anggota<Icon name="arrow-right" size={16} /></Link>
        </div>
        <ul className="member-grid">{rows.map((m) => <MemberCard key={m.username} m={m} avatar={m.avatar_path ? avatars.get(m.avatar_path) : undefined} hideDefaultRole />)}</ul>
      </section>
    );
  }
  return (
    <SectionCard id="h-members" icon="users" title={<Marquee>Anggota terbaru</Marquee>} flush
      className="scard--mobile-foot" action={<SectionLink href="/members" label="Semua anggota" />}
      footer={<SectionFoot href="/members" label="Lihat semua anggota" />}>
      <ul className="mgrid">
        {rows.slice(0, 12).map((m) => {
          const role = memberRoleLabel(m.role_name);
          return (
            <li key={m.username}>
              <Link href={`/members/${m.username}`} className="mgrid__item" title={m.full_name}>
                <Avatar name={m.full_name} seed={m.username} src={m.avatar_path ? avatars.get(m.avatar_path) : undefined} />
                <span className="mgrid__name">{m.full_name}</span>
                {role && <span className="mgrid__role">{role}</span>}
              </Link>
            </li>);
        })}
      </ul>
    </SectionCard>
  );
}
