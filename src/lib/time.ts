const ZONE: Record<string, string> = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' };
export const zoneLabel = (tz: string) => ZONE[tz] ?? tz;
export const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const hm = (t: string) => t.slice(0, 5);
// mm:ss untuk hitungan mundur (mis. masa berlaku kode OTP).
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

// Selalu memakai timezone kelas, bukan zona browser (blueprint §19).
export function formatWhen(iso: string, tz: string) {
  const s = new Intl.DateTimeFormat('id-ID', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso)).replace(/(\d{2})\.(\d{2})/, '$1:$2'); // id-ID memakai titik di jam; seluruh aplikasi memakai titik dua
  return `${s} ${zoneLabel(tz)}`;
}

// Zona kelas bersifat tetap (tanpa DST), jadi offset konstan cukup (blueprint A-04, D-21).
const OFFSET_H: Record<string, number> = { 'Asia/Jakarta': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 };
export function localToUtc(local: string, tz: string): string { // "YYYY-MM-DDTHH:mm" waktu dinding -> ISO UTC
  const [d = '', t = ''] = local.split('T');
  const [y = 0, mo = 1, da = 1] = d.split('-').map(Number);
  const [h = 0, mi = 0] = t.split(':').map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h, mi) - (OFFSET_H[tz] ?? 7) * 3_600_000).toISOString();
}
export function utcToLocal(iso: string, tz: string): string {
  return new Date(new Date(iso).getTime() + (OFFSET_H[tz] ?? 7) * 3_600_000).toISOString().slice(0, 16);
}

// ---- Tampilan tanggal untuk UI (selalu di zona kelas) ----
const idf = (tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('id-ID', { timeZone: tz, ...o });
export function dateParts(iso: string, tz: string) {
  const d = new Date(iso);
  return { day: idf(tz, { day: 'numeric' }).format(d), mon: idf(tz, { month: 'short' }).format(d), weekday: idf(tz, { weekday: 'short' }).format(d) };
}
export const formatDay = (iso: string, tz: string) => idf(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
export function formatClock(iso: string, tz: string) { // "08:00" (id-ID memakai titik, jadi dipakai en-GB)
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
export const formatDateOnly = (ymd: string) => idf('UTC', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));
// 1 = Senin … 7 = Minggu pada zona kelas.
export function isoWeekday(tz: string, now: Date) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(w) + 1;
}
// "3 jam lagi", "kemarin", "2 hari lalu": fungsi murni (now disuntikkan) agar bisa dites.
export function relativeTime(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const future = diff >= 0;
  const m = Math.round(Math.abs(diff) / 60_000);
  const suffix = future ? 'lagi' : 'lalu';
  if (m < 1) return 'sekarang';
  if (m < 60) return `${m} menit ${suffix}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam ${suffix}`;
  const d = Math.round(h / 24);
  if (d === 1) return future ? 'besok' : 'kemarin';
  if (d < 30) return `${d} hari ${suffix}`;
  const mo = Math.round(d / 30);
  return `${mo} bulan ${suffix}`;
}
export const formatShortDate = (ymd: string) => idf('UTC', { day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
// "Senin, 12 Oktober 2026 · 08:00–10:00 WIB" bila satu hari; selain itu dua tanggal lengkap.
export function formatRange(startIso: string, endIso: string, tz: string) {
  const day = (iso: string) => idf(tz, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso));
  return day(startIso) === day(endIso)
    ? `${formatDay(startIso, tz)} · ${formatClock(startIso, tz)}–${formatClock(endIso, tz)} ${zoneLabel(tz)}`
    : `${formatWhen(startIso, tz)} – ${formatWhen(endIso, tz)}`;
}
