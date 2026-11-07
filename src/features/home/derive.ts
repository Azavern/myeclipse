import { DUE_SOON_HOURS } from '../../lib/tasks';
import { formatClock, formatShortDate, hm, relativeTime } from '../../lib/time';

export type SessionState = 'done' | 'live' | 'next';

// Status kuliah memakai jam dinding kelas, bukan zona peramban. `now` disuntikkan agar bisa dites.
export function sessionState(start: string, end: string, now: Date, tz: string): SessionState {
  const clock = formatClock(now.toISOString(), tz);
  if (clock >= hm(end)) return 'done';
  if (clock >= hm(start)) return 'live';
  return 'next';
}

// Tugas Home hanya menampilkan yang mendesak: segera berakhir (≤ DUE_SOON_HOURS) lalu lewat tenggat.
// Yang paling dekat tampil lebih dulu; yang paling baru lewat tampil di atas. Maksimal lima baris.
export function homeTaskGroups<T extends { deadline: string }>(rows: T[], now: Date): { soon: T[]; overdue: T[]; hidden: number } {
  const soon: T[] = [];
  const overdue: T[] = [];
  for (const row of rows) {
    const at = new Date(row.deadline).getTime();
    if (at < now.getTime()) overdue.push(row);
    else if (at - now.getTime() <= DUE_SOON_HOURS * 3_600_000) soon.push(row);
  }
  soon.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  overdue.sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime());
  const ordered = [...soon, ...overdue];
  const shown = ordered.slice(0, 5);
  const visible = new Set(shown);
  return { soon: soon.filter((row) => visible.has(row)), overdue: overdue.filter((row) => visible.has(row)), hidden: ordered.length - shown.length };
}

// Satu ekspresi waktu relatif untuk badge tugas: "Lewat 20 hari" atau "2 hari lagi".
export function deadlineBadge(iso: string, now: Date): string {
  const rel = relativeTime(iso, now);
  if (new Date(iso).getTime() >= now.getTime()) return rel;
  if (rel === 'kemarin') return 'Lewat 1 hari';
  if (rel === 'sekarang') return 'Lewat tenggat';
  return `Lewat ${rel.replace(/ lalu$/, '')}`;
}

export const DUE_SOON_DAYS = DUE_SOON_HOURS / 24;

export type OverviewCounts = {
  members_count: number | null; upcoming_events_count: number | null;
  active_tasks_count: number | null; due_soon_tasks_count: number | null;
};
export type SummaryItem = {
  key: 'members' | 'events' | 'tasks' | 'due'; href: string;
  icon: 'users' | 'calendar-days' | 'tasks' | 'alert-triangle' | 'check-circle';
  value: number; label: string; empty: string; note?: string; tone: 'neutral' | 'warning';
};

// Ringkasan Home: setiap angka adalah tautan ke halaman asalnya. Angka nol ditulis sebagai kalimat,
// dan nilai NULL dari RPC tidak dirender sama sekali (blueprint §15.2, AC-HOME-4).
export function summaryTiles(ov: OverviewCounts): SummaryItem[] {
  const items: SummaryItem[] = [];
  if (ov.members_count !== null) items.push({
    key: 'members', href: '/members', icon: 'users', value: ov.members_count,
    label: 'Anggota aktif', empty: 'Tidak ada anggota aktif', tone: 'neutral',
  });
  if (ov.upcoming_events_count !== null) items.push({
    key: 'events', href: '/events', icon: 'calendar-days', value: ov.upcoming_events_count,
    label: 'Event mendatang', empty: 'Tidak ada event mendatang', tone: 'neutral',
  });
  if (ov.active_tasks_count !== null) items.push({
    key: 'tasks', href: '/tasks', icon: 'tasks', value: ov.active_tasks_count,
    label: 'Tugas aktif', empty: 'Tidak ada tugas aktif', tone: 'neutral',
  });
  if (ov.due_soon_tasks_count !== null) items.push({
    key: 'due', href: '/tasks', icon: ov.due_soon_tasks_count > 0 ? 'alert-triangle' : 'check-circle',
    value: ov.due_soon_tasks_count, label: 'Perlu tindakan', empty: 'Tidak ada tindakan mendesak',
    note: ov.due_soon_tasks_count > 0 ? `lewat tenggat atau ≤${DUE_SOON_DAYS} hari` : undefined,
    tone: ov.due_soon_tasks_count > 0 ? 'warning' : 'neutral',
  });
  return items;
}

// Peran bawaan cukup disebut lewat konteks halaman; badge hanya untuk jabatan yang berbeda.
export function memberRoleLabel(role: string | null | undefined): string | null {
  const value = role?.trim();
  return value && value.toLowerCase() !== 'member' ? value : null;
}

// Alternatif teks grafik: setiap pekan dan angkanya terbaca tanpa mengandalkan bentuk batang.
export function activitySummary(rows: { week_start: string; activity_count: number }[]): string {
  const weeks = rows.map((row, i) => `${i === rows.length - 1 ? 'pekan ini' : `pekan mulai ${formatShortDate(row.week_start)}`} ${row.activity_count} aktivitas`);
  return `Aktivitas ${rows.length} pekan terakhir: ${weeks.join('; ')}.`;
}

export type NextClass<T> = { row: T; at: Date };

// Jadwal berulang mingguan: cari hari terdekat setelah hari ini yang punya kelas, termasuk pekan depan.
export function nextClass<T extends { day_of_week: number; start_time: string; type: 'class' | 'activity' }>(
  rows: T[], currentDay: number, now: Date,
): NextClass<T> | null {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = ((currentDay - 1 + offset) % 7) + 1;
    const first = rows
      .filter((row) => row.type === 'class' && row.day_of_week === day)
      .sort((a, b) => hm(a.start_time).localeCompare(hm(b.start_time)))[0];
    if (first) return { row: first, at: new Date(now.getTime() + offset * 86_400_000) };
  }
  return null;
}
