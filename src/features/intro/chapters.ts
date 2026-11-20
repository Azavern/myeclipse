import { activitySummary, deadlineBadge, homeTaskGroups, memberRoleLabel, nextClass, sessionState, summaryTiles, type SessionState } from '@/features/home/derive';
import type { IntroActId } from './choreography';
import { buildTimeline, type TimelineAct } from './choreography';
import type { IntroSource } from './queries';
import type { TaskItem } from '@/features/tasks/task-row';
import { DAYS, formatShortDate, formatWeekdayDate, formatWhen, hm, isoWeekday, relativeTime, zoneLabel } from '@/lib/time';

// Kunci visibility per jenis bab. Bab hanya dibuat dari data yang sudah lolos
// gate server; peta ini dipakai untuk dokumentasi dan tes, bukan untuk menyembunyikan UI.
export const INTRO_CHAPTER_KEYS = {
  identity: 'section.home.identity',
  about: 'section.home.identity',
  overview: 'section.home.overview',
  schedule: 'section.home.schedule',
  tasks: 'section.home.tasks',
  events: 'section.home.events',
  activity: 'section.home.activity',
  members: 'section.home.members',
  leader: 'section.home.members',
  finale: 'page.home',
} as const;

export type IntroMember = { username: string; name: string; role: string; avatarUrl?: string };
export type IntroLeader = IntroMember & { bio: string | null };

type Base = { id: string; act: IntroActId; label: string; title: string; accent?: string };

export type IntroChapter =
  | (Base & {
    kind: 'identity'; name: string; tagline: string | null; description: string | null;
    highlight: string | null; highlightUrl: string | null; coverUrl?: string; guest: boolean;
  })
  | (Base & { kind: 'about'; description: string | null; highlight: string | null; highlightUrl: string | null })
  | (Base & {
    kind: 'overview';
    tiles: { key: string; value: number; label: string; note?: string; empty: string; tone: 'neutral' | 'warning' }[];
  })
  | (Base & {
    kind: 'schedule'; rows: { id: string; title: string; time: string; location: string | null; state: SessionState; stateLabel: string }[];
    next: { title: string; when: string } | null; dayName: string; zone: string; empty: string;
  })
  | (Base & {
    kind: 'tasks';
    groups: { title: string; tone: 'warning' | 'danger'; rows: { id: string; title: string; course: string | null; when: string; badge: string; tone: 'warning' | 'danger' }[] }[];
    empty: string; total: number; hidden: number;
  })
  | (Base & {
    kind: 'events'; rows: { id: string; title: string; when: string; location: string | null; relative: string }[]; empty: string;
  })
  | (Base & {
    kind: 'activity'; rows: { week: string; label: string; value: number; pct: number }[]; total: number; summary: string; empty: string;
  })
  | (Base & { kind: 'members'; items: IntroMember[]; total: number; shown: number })
  | (Base & { kind: 'leader'; member: IntroLeader })
  | (Base & {
    kind: 'finale'; guest: boolean; className: string | null; explore: IntroSource['explore'];
    classicHref: string; loginHref: string;
  });

export type IntroAct = TimelineAct<IntroChapter>;

const SESSION_LABEL: Record<SessionState, string> = { done: 'Selesai', live: 'Berlangsung', next: 'Berikutnya' };

const safeHttps = (url: string | null | undefined) => (url?.startsWith('https://') ? url : null);

// Membangun bab dari sumber yang sudah difilter visibility. Tidak ada nama, angka,
// atau tanggal contoh: semua nilai berasal dari IntroSource.
export function buildIntroChapters(source: IntroSource): IntroChapter[] {
  const chapters: IntroChapter[] = [];
  const id = source.identity;
  const identityVisible = !!id;

  if (id) {
    chapters.push({
      id: 'identity', act: 'gate', kind: 'identity', label: 'Eclipse · intro',
      title: id.name, name: id.name, tagline: id.tagline, description: id.description,
      highlight: id.highlight_text?.trim() || null, highlightUrl: safeHttps(id.highlight_url),
      coverUrl: source.coverUrl, guest: source.guest,
    });
    if (id.description || id.highlight_text?.trim()) {
      chapters.push({
        id: 'about', act: 'gate', kind: 'about', label: 'Tentang kelas',
        title: 'Satu kelas,', accent: 'satu cerita',
        description: id.description, highlight: id.highlight_text?.trim() || null,
        highlightUrl: safeHttps(id.highlight_url),
      });
    }
  }

  const ov = source.overview?.[0];
  if (ov) {
    const tiles = summaryTiles(ov).map((tile) => ({
      key: tile.key, value: tile.value, label: tile.label, note: tile.note, empty: tile.empty, tone: tile.tone,
    }));
    if (tiles.length > 0) {
      chapters.push({
        id: 'overview', act: 'overview', kind: 'overview', label: 'Ringkasan',
        title: 'Kelas dalam', accent: 'angka', tiles,
      });
    }
  }

  if (source.schedule) {
    const semester = source.schedule.filter((row) => row.semester === source.schedule?.[0]?.semester);
    const day = isoWeekday(source.timezone, source.now);
    const today = semester.filter((row) => row.day_of_week === day);
    const states = today.map((row) => sessionState(row.start_time, row.end_time, source.now, source.timezone));
    const hasUpcoming = states.some((state) => state !== 'done');
    const next = hasUpcoming ? null : nextClass(semester, day, source.now);
    chapters.push({
      id: 'schedule', act: 'orbit', kind: 'schedule', label: 'Jadwal',
      title: 'Kuliah', accent: 'hari ini',
      rows: today.slice(0, 6).map((row, index) => ({
        id: row.id, title: row.title, time: `${hm(row.start_time)}–${hm(row.end_time)}`,
        location: row.location, state: states[index] ?? 'next', stateLabel: SESSION_LABEL[states[index] ?? 'next'],
      })),
      next: next ? {
        title: next.row.title,
        when: `${formatWeekdayDate(next.at.toISOString(), source.timezone)} · ${hm(next.row.start_time)}`,
      } : null,
      dayName: DAYS[day - 1] ?? '',
      zone: zoneLabel(source.timezone),
      empty: semester.length === 0 ? 'Jadwal kuliah semester ini belum diisi.' : 'Tidak ada jadwal kuliah hari ini.',
    });
  }

  if (source.tasks) {
    const { soon, overdue, hidden } = homeTaskGroups(source.tasks, source.now);
    const row = (task: TaskItem, tone: 'warning' | 'danger') => ({
      id: task.id, title: task.title, course: task.course ?? null,
      when: formatWhen(task.deadline, source.timezone), badge: deadlineBadge(task.deadline, source.now), tone,
    });
    const groups = [
      soon.length > 0 ? { title: 'Segera berakhir', tone: 'warning' as const, rows: soon.map((task) => row(task, 'warning')) } : null,
      overdue.length > 0 ? { title: 'Lewat tenggat', tone: 'danger' as const, rows: overdue.map((task) => row(task, 'danger')) } : null,
    ].filter((group): group is { title: string; tone: 'warning' | 'danger'; rows: ReturnType<typeof row>[] } => !!group);
    chapters.push({
      id: 'tasks', act: 'orbit', kind: 'tasks', label: 'Tugas', title: 'Tenggat', accent: 'terdekat',
      groups, total: source.tasks.length, hidden,
      empty: source.tasks.length === 0 ? 'Tidak ada tugas aktif.' : 'Tidak ada tugas mendesak dalam 72 jam ke depan.',
    });
  }

  if (source.events) {
    chapters.push({
      id: 'events', act: 'orbit', kind: 'events', label: 'Event mendatang', title: 'Acara', accent: 'berikutnya',
      rows: source.events.map((event) => ({
        id: event.id, title: event.title, when: formatWhen(event.start_at, source.timezone),
        location: event.location,
        relative: new Date(event.start_at) <= source.now ? 'Sedang berlangsung' : relativeTime(event.start_at, source.now),
      })),
      empty: 'Belum ada event mendatang. Kegiatan kelas akan muncul di sini.',
    });
  }

  if (source.activity) {
    const activity = source.activity;
    const total = activity.reduce((sum, week) => sum + week.activity_count, 0);
    const max = Math.max(1, ...activity.map((week) => week.activity_count));
    chapters.push({
      id: 'activity', act: 'orbit', kind: 'activity', label: 'Aktivitas',
      title: 'Aktivitas', accent: `${activity.length} pekan terakhir`,
      rows: activity.map((week, index) => ({
        week: week.week_start,
        label: index === activity.length - 1 ? 'Pekan ini' : formatShortDate(week.week_start),
        value: week.activity_count,
        pct: Math.round((week.activity_count / max) * 20) * 5,
      })),
      total,
      summary: activitySummary(activity),
      empty: 'Aktivitas jadwal, tugas, dan event akan tercatat di sini.',
    });
  }

  if (source.members && source.members.length > 0) {
    const items: IntroMember[] = source.members.map((member) => ({
      username: member.username,
      name: member.full_name,
      role: memberRoleLabel(member.role_name) ?? 'Anggota',
      avatarUrl: member.avatar_path ? source.avatars[member.avatar_path] : undefined,
    }));
    chapters.push({
      id: 'members', act: 'comet', kind: 'members', label: 'Anggota',
      title: 'Anggota', accent: 'kelas',
      // Helix adalah satu-satunya daftar anggota; jangan menyisakan orang di luar babak.
      items, total: items.length, shown: items.length,
    });

    // Profil Ketua memakai baris member_profile_v yang sama dengan halaman anggota.
    // bio/avatar sudah disamarkan view; bila baris itu tidak terlihat, bab tidak dibuat.
    if (source.leader) {
      const role = source.leader.role_name.trim().toLowerCase() === 'ketua' ? 'Ketua kelas' : source.leader.role_name;
      chapters.push({
        id: 'leader', act: 'leader', kind: 'leader', label: 'Profil ketua',
        title: 'Ketua', accent: 'kelas',
        member: {
          username: source.leader.username,
          name: source.leader.full_name,
          role,
          bio: source.leader.bio?.trim() || null,
          avatarUrl: source.leader.avatar_path ? source.avatars[source.leader.avatar_path] : undefined,
        },
      });
    }
  }

  if (chapters.length > 0) {
    chapters.push({
      id: 'finale', act: 'finale', kind: 'finale', label: 'Langkah berikutnya',
      title: source.guest ? 'Masuk ke' : 'Kembali ke', accent: source.guest ? 'kelas' : 'beranda',
      guest: source.guest,
      className: identityVisible ? id.name : null,
      explore: source.explore,
      classicHref: '/beranda',
      loginHref: '/login?next=%2F',
    });
  }

  return chapters;
}

export function buildIntroActs(chapters: IntroChapter[]): { acts: IntroAct[]; total: number } {
  const memberChapter = chapters.find((chapter): chapter is Extract<IntroChapter, { kind: 'members' }> => chapter.kind === 'members');
  const groups = (['gate', 'overview', 'orbit', 'comet', 'leader', 'finale'] as const).map((act) => ({
    id: act,
    chapters: chapters.filter((chapter) => chapter.act === act),
    // Heliks bergerak 42vh per anggota yang tampil, bukan per jumlah bab.
    itemCount: act === 'comet' ? memberChapter?.shown : undefined,
  }));
  return buildTimeline(groups);
}
