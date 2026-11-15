'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { IntroChapter, IntroMember } from './chapters';

type OfKind<K extends IntroChapter['kind']> = Extract<IntroChapter, { kind: K }>;

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? '').join('').toUpperCase() || '?';

// Foto dari Storage bisa gagal (404, CORS, atau URL kedaluwarsa). Ganti dengan inisial
// berwarna cadangan; jangan biarkan ikon rusak muncul.
function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="intro-avatar intro-avatar--fallback" aria-hidden="true">{initials(name)}</span>;
  return (
    <span className="intro-avatar">
      <img src={src} alt="" width={72} height={72} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}

function Cover({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="intro-hero__cover intro-hero__cover--fallback" aria-hidden="true" />;
  return <img className="intro-hero__cover" src={src} alt={`Sampul kelas ${name}`} width={1200} height={800} decoding="async" onError={() => setFailed(true)} />;
}

function Head({ chapter, tag = 'h2' }: { chapter: IntroChapter; tag?: 'h1' | 'h2' }) {
  const Tag = tag;
  return (
    <>
      <p className="intro-label">{chapter.label}</p>
      <Tag className="intro-heading">
        {chapter.title}
        {chapter.accent && <> <em>{chapter.accent}</em></>}
      </Tag>
    </>
  );
}

function Highlight({ text, url }: { text: string | null; url: string | null }) {
  if (!text) return null;
  const body = (
    <span className="intro-highlight__body">
      <span className="intro-highlight__label">Sorotan</span>
      <span>{text}</span>
    </span>
  );
  return url
    ? <a className="intro-highlight intro-highlight--link" href={url} target="_blank" rel="noopener noreferrer">{body}<span aria-hidden="true">↗</span></a>
    : <p className="intro-highlight">{body}</p>;
}

export function IdentityCard({ chapter }: { chapter: OfKind<'identity'> }) {
  return (
    <div className="intro-card__inner intro-hero">
      <Cover name={chapter.name} src={chapter.coverUrl} />
      <div className="intro-hero__body">
        <Head chapter={chapter} tag="h1" />
        {chapter.tagline && <p className="intro-hero__tagline">{chapter.tagline}</p>}
        <p className="intro-hero__hint"><span aria-hidden="true">↓</span> Gulir untuk masuk</p>
      </div>
    </div>
  );
}

export function AboutCard({ chapter }: { chapter: OfKind<'about'> }) {
  return (
    <div className="intro-card__inner">
      <Head chapter={chapter} />
      {chapter.description && <p className="intro-body">{chapter.description}</p>}
      <Highlight text={chapter.highlight} url={chapter.highlightUrl} />
    </div>
  );
}

export function OverviewTitle({ chapter }: { chapter: OfKind<'overview'> }) {
  return <div className="intro-card__inner intro-card__inner--center"><Head chapter={chapter} /></div>;
}

export function OverviewTile({ chapter, index }: { chapter: OfKind<'overview'>; index: number }) {
  const tile = chapter.tiles[index];
  if (!tile) return null;
  return (
    <div className={`intro-tile${tile.tone === 'warning' ? ' intro-tile--warning' : ''}`} aria-label={`${tile.label}: ${tile.value}`}>
      <span className="intro-tile__value">{tile.value}</span>
      <span className="intro-tile__label">{tile.value === 0 ? tile.empty : tile.label}</span>
      {tile.note && <span className="intro-tile__note">{tile.note}</span>}
    </div>
  );
}

export function ScheduleCard({ chapter }: { chapter: OfKind<'schedule'> }) {
  return (
    <div className="intro-card__inner">
      <Head chapter={chapter} />
      <p className="intro-meta">{chapter.dayName} · {chapter.zone}</p>
      {chapter.rows.length > 0 ? (
        <ul className="intro-rows">
          {chapter.rows.map((row) => (
            <li key={row.id} className="intro-row">
              <span className="intro-row__time">{row.time}</span>
              <span className="intro-row__main">
                <span className="intro-row__title">{row.title}</span>
                {row.location && <span className="intro-row__meta">{row.location}</span>}
              </span>
              <span className={`intro-chip intro-chip--${row.state}`}>{row.stateLabel}</span>
            </li>
          ))}
        </ul>
      ) : chapter.next ? (
        <p className="intro-next">
          <span className="intro-next__label">Kuliah berikutnya</span>
          <span>{chapter.next.when}</span>
          <strong>{chapter.next.title}</strong>
        </p>
      ) : <p className="intro-empty-line">{chapter.empty}</p>}
      <Link className="intro-link" href="/schedule">Buka jadwal lengkap <span aria-hidden="true">→</span></Link>
    </div>
  );
}

export function TasksCard({ chapter }: { chapter: OfKind<'tasks'> }) {
  return (
    <div className="intro-card__inner">
      <Head chapter={chapter} />
      {chapter.groups.length > 0 ? (
        <div className="intro-groups">
          {chapter.groups.map((group) => (
            <section key={group.title} className={`intro-group intro-group--${group.tone}`}>
              <h3 className="intro-group__title">{group.title}</h3>
              <ul className="intro-rows">
                {group.rows.map((row) => (
                  <li key={row.id} className="intro-row intro-row--task">
                    <span className="intro-row__main">
                      <span className="intro-row__title">{row.title}</span>
                      <span className="intro-row__meta">{row.course ?? 'Tanpa mata kuliah'} · {row.when}</span>
                    </span>
                    <span className={`intro-chip intro-chip--${row.tone}`}>{row.badge}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {chapter.hidden > 0 && <p className="intro-meta">+{chapter.hidden} tugas lain di halaman tugas.</p>}
        </div>
      ) : <p className="intro-empty-line">{chapter.empty}</p>}
      <Link className="intro-link" href="/tasks">Lihat semua {chapter.total} tugas <span aria-hidden="true">→</span></Link>
    </div>
  );
}

export function EventsCard({ chapter }: { chapter: OfKind<'events'> }) {
  return (
    <div className="intro-card__inner">
      <Head chapter={chapter} />
      {chapter.rows.length > 0 ? (
        <ul className="intro-rows">
          {chapter.rows.map((row) => (
            <li key={row.id} className="intro-row">
              <span className="intro-row__main">
                <span className="intro-row__title">{row.title}</span>
                <span className="intro-row__meta">{row.when}{row.location ? ` · ${row.location}` : ''}</span>
              </span>
              <span className="intro-chip intro-chip--neutral">{row.relative}</span>
            </li>
          ))}
        </ul>
      ) : <p className="intro-empty-line">{chapter.empty}</p>}
      <Link className="intro-link" href="/events">Buka semua event <span aria-hidden="true">→</span></Link>
    </div>
  );
}

export function ActivityCard({ chapter }: { chapter: OfKind<'activity'> }) {
  return (
    <div className="intro-card__inner">
      <Head chapter={chapter} />
      {chapter.total > 0 ? (
        <>
          <div className="intro-bars" role="img" aria-label={chapter.summary}>
            {chapter.rows.map((row) => (
              <span key={row.week} className="intro-bars__col" aria-hidden="true">
                <span className="intro-bars__value">{row.value}</span>
                <span className="intro-bars__track">
                  <span className="intro-bars__fill" data-bar data-pct={row.pct} />
                </span>
                <span className="intro-bars__week">{row.label}</span>
              </span>
            ))}
          </div>
          <p className="intro-meta">{chapter.total} aktivitas tercatat. Pekan dimulai Senin.</p>
        </>
      ) : <p className="intro-empty-line">{chapter.empty}</p>}
    </div>
  );
}

export function MemberCard({ member, index, total }: { member: IntroMember; index: number; total: number }) {
  return (
    <div className="intro-card__inner intro-member">
      <div className="intro-member__top">
        <Avatar name={member.name} src={member.avatarUrl} />
        <span className="intro-member__number">{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      </div>
      <h3 className="intro-member__name">{member.name}</h3>
      <p className="intro-member__role">{member.role}</p>
    </div>
  );
}

export function FinaleCard({ chapter }: { chapter: OfKind<'finale'> }) {
  return (
    <div className="intro-card__inner intro-finale">
      <Head chapter={chapter} />
      <p className="intro-body">
        {chapter.guest
          ? 'Masuk untuk membuka bagian yang hanya tersedia bagi anggota kelas.'
          : 'Petualangan ini selesai. Beranda klasik tetap tersedia kapan saja.'}
      </p>
      <div className="intro-actions">
        {chapter.guest && <Link className="intro-btn intro-btn--solid" href={chapter.loginHref}>Masuk ke kelas</Link>}
        <Link className={`intro-btn${chapter.guest ? '' : ' intro-btn--solid'}`} href={chapter.classicHref}>Buka beranda klasik</Link>
      </div>
      {chapter.guest && chapter.explore.length > 0 && (
        <nav className="intro-explore" aria-label="Jelajahi kelas">
          <p className="intro-label">Jelajahi kelas</p>
          <ul>
            {chapter.explore.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>
                  <span>{item.label}</span>
                  <span className="intro-explore__desc">{item.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {chapter.className && <p className="intro-finale__mark">{chapter.className}</p>}
    </div>
  );
}

export function MemberRoster({ members }: { members: IntroMember[] }) {
  return (
    <section className="intro-roster" aria-labelledby="intro-roster-title">
      <div className="intro-roster__head">
        <p className="intro-label">Direktori lengkap</p>
        <h2 id="intro-roster-title" className="intro-roster__title">Semua anggota <span>{members.length}</span></h2>
      </div>
      <ul className="intro-roster__list">
        {members.map((member) => (
          <li key={member.username}>
            <Link href={`/members/${member.username}`} className="intro-roster__row">
              <Avatar name={member.name} src={member.avatarUrl} />
              <span className="intro-roster__text">
                <span className="intro-roster__name">{member.name}</span>
                <span className="intro-roster__role">{member.role}</span>
              </span>
              <span className="intro-roster__arrow" aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
