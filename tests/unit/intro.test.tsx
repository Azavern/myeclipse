import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BacksideLink } from '../../src/features/intro/backside-link';
import { buildIntroActs, buildIntroChapters, INTRO_CHAPTER_KEYS, introRoster } from '../../src/features/intro/chapters';
import { IntroEmpty } from '../../src/features/intro/empty';
import { actPresence, dwell, focusWeight, pickTier } from '../../src/features/intro/choreography';
import type { IntroSource } from '../../src/features/intro/queries';
import { DEFAULT_THEME } from '../../src/lib/theme/defaults';
import { homeDestination } from '../../src/lib/theme/home-mode';
import { ThemeSchema } from '../../src/lib/theme/schema';

const NOW = new Date('2026-11-15T03:00:00Z'); // Minggu, 10.00 WIB

function source(overrides: Partial<IntroSource> = {}): IntroSource {
  return {
    identity: {
      name: 'Eclipse', tagline: 'Satu kelas', description: 'Deskripsi kelas.',
      highlight_text: 'Pengumuman', highlight_url: 'https://example.com', timezone: 'Asia/Jakarta', cover_path: null,
    },
    overview: [{ members_count: 25, upcoming_events_count: 2, active_tasks_count: 4, due_soon_tasks_count: 1 }],
    activity: [
      { week_start: '2026-10-26', activity_count: 2 },
      { week_start: '2026-11-02', activity_count: 5 },
      { week_start: '2026-11-09', activity_count: 3 },
    ],
    schedule: [
      { id: 's1', title: 'Kuliah A', start_time: '08:00', end_time: '09:40', location: 'Ruang 1', type: 'class', day_of_week: 7, semester: '2026/2027-1' },
    ],
    events: [{ id: 'e1', title: 'Diskusi', start_at: '2026-11-16T03:00:00Z', location: 'Daring' }],
    tasks: [
      { id: 't1', title: 'Laporan', course: 'Kuliah A', deadline: '2026-11-16T03:00:00Z', status: 'active' },
    ],
    members: Array.from({ length: 25 }, (_, index) => ({
      username: `anggota${index + 1}`, full_name: `Anggota ${index + 1}`,
      role_name: index === 0 ? 'Ketua' : 'member', status: 'active', avatar_path: null,
      joined_at: '2026-10-01T00:00:00Z',
    })),
    avatars: {},
    explore: [{ href: '/schedule', label: 'Jadwal', desc: 'Kuliah' }],
    guest: false,
    now: NOW,
    timezone: 'Asia/Jakarta',
    ...overrides,
  };
}

const kinds = (input: IntroSource) => buildIntroChapters(input).map((chapter) => chapter.kind);

describe('pemetaan bab intro ke kunci visibility', () => {
  it('memakai kunci yang sama dengan beranda', () => {
    expect(INTRO_CHAPTER_KEYS).toEqual({
      identity: 'section.home.identity',
      about: 'section.home.identity',
      overview: 'section.home.overview',
      schedule: 'section.home.schedule',
      tasks: 'section.home.tasks',
      events: 'section.home.events',
      activity: 'section.home.activity',
      members: 'section.home.members',
      finale: 'page.home',
    });
  });

  it('membangun kelima adegan dari data yang semuanya terlihat', () => {
    const chapters = buildIntroChapters(source());
    expect(kinds(source())).toEqual([
      'identity', 'about', 'overview', 'schedule', 'tasks', 'events', 'activity', 'members', 'finale',
    ]);
    const acts = buildIntroActs(chapters).acts;
    expect(acts.map((act) => act.id)).toEqual(['gate', 'overview', 'orbit', 'comet', 'finale']);
    expect(introRoster(chapters)).toHaveLength(25);
    const members = chapters.find((chapter) => chapter.kind === 'members');
    expect(members?.kind === 'members' && members.shown).toBe(19);
    expect(members?.kind === 'members' && members.total).toBe(25);
  });

  it('membuang bab yang datanya tersaring, bukan menyembunyikannya di CSS', () => {
    const partial = source({ schedule: null, tasks: null, events: null, activity: null, members: null });
    expect(kinds(partial)).toEqual(['identity', 'about', 'overview', 'finale']);
    const acts = buildIntroActs(buildIntroChapters(partial)).acts;
    expect(acts.map((act) => act.id)).toEqual(['gate', 'overview', 'finale']);
    expect(buildIntroActs(buildIntroChapters(partial)).total)
      .toBeLessThan(buildIntroActs(buildIntroChapters(source())).total);
  });

  it('kembali kosong saat semua bab data tersaring', () => {
    const empty = source({
      identity: null, overview: null, activity: null, schedule: null,
      events: null, tasks: null, members: null,
    });
    expect(buildIntroChapters(empty)).toEqual([]);
    expect(buildIntroActs([]).total).toBe(0);
  });

  it('merender pesan kosong tanpa canvas dan tanpa nama kelas', () => {
    const html = renderToStaticMarkup(createElement(IntroEmpty, { brand: 'Intro', guest: true }));
    expect(html).not.toContain('<canvas');
    expect(html).toContain('Belum ada yang bisa ditampilkan');
    expect(html).toContain('Buka beranda klasik');
    expect(html).not.toContain('Eclipse');
  });
});

describe('pemilihan tier gerak', () => {
  it('menghormati reduced motion, saveData, dan ketiadaan WebGL', () => {
    expect(pickTier({ reducedMotion: true, webgl: true, saveData: false, phone: false })).toBe('static');
    expect(pickTier({ reducedMotion: false, webgl: false, saveData: false, phone: false })).toBe('css');
    expect(pickTier({ reducedMotion: false, webgl: true, saveData: true, phone: true })).toBe('css');
    expect(pickTier({ reducedMotion: false, webgl: true, saveData: false, phone: true })).toBe('mobile');
    expect(pickTier({ reducedMotion: false, webgl: true, saveData: false, phone: false })).toBe('full');
  });
});

describe('kontinuitas koreografi', () => {
  it('tidak melonjakkan opacity adegan saat digulir tiap 1vh', () => {
    const { acts, total } = buildIntroActs(buildIntroChapters(source()));
    expect(total).toBeGreaterThan(0);
    expect(acts.at(-1)?.end).toBe(total);
    let previous = acts.map((act) => actPresence(act, 0).opacity);
    for (let t = 1; t <= total; t += 1) {
      const next = acts.map((act) => actPresence(act, t).opacity);
      next.forEach((value, index) => expect(Math.abs(value - (previous[index] ?? 0))).toBeLessThan(0.06));
      previous = next;
    }
  });

  it('menjaga bobot fokus orbit dan komet tetap mulus', () => {
    const { acts } = buildIntroActs(buildIntroChapters(source()));
    for (const act of acts.filter((item) => item.id === 'orbit' || item.id === 'comet')) {
      const count = act.id === 'orbit' ? act.chapters.length : 19;
      const rest = act.id === 'orbit' ? 0.25 : 0.22;
      const weights = (t: number) => {
        const focus = dwell(((t - act.start) / act.weight) * (count - 1), rest);
        return Array.from({ length: count }, (_, index) => focusWeight(index, focus));
      };
      let previous = weights(act.start);
      for (let t = act.start + 1; t <= act.end; t += 1) {
        const next = weights(t);
        next.forEach((value, index) => expect(Math.abs(value - (previous[index] ?? 0))).toBeLessThan(0.1));
        previous = next;
      }
    }
  });
});

describe('mode beranda dan backside', () => {
  it('mengarahkan / ke intro hanya saat tema memilih intro', () => {
    expect(homeDestination(DEFAULT_THEME)).toBe('/');
    expect(homeDestination(undefined)).toBe('/');
    expect(homeDestination({ ...DEFAULT_THEME, home_mode: 'intro' })).toBe('/intro');
  });

  it('tetap menerima tema lama tanpa home_mode', () => {
    expect(ThemeSchema.safeParse(DEFAULT_THEME).success).toBe(true);
    expect(ThemeSchema.safeParse({ ...DEFAULT_THEME, home_mode: 'intro' }).success).toBe(true);
    expect(ThemeSchema.safeParse({ ...DEFAULT_THEME, home_mode: 'sinematik' }).success).toBe(false);
  });

  it('menampilkan backside hanya saat mode klasik', () => {
    const classic = renderToStaticMarkup(createElement(BacksideLink, { mode: 'classic' }));
    expect(classic).toContain('href="/intro"');
    expect(classic).toContain('backside');
    expect(renderToStaticMarkup(createElement(BacksideLink, { mode: 'intro' }))).toBe('');
  });
});
