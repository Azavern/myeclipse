// Aturan pembatas pengambilan Library. Modul ini murni (tanpa I/O) supaya
// keputusannya bisa dites dan dipakai dua penyimpanan: tabel di database
// (utama) dan penyimpanan per proses saat migrasi belum diterapkan.

export const LIBRARY_COOLDOWN_MS = 60_000;
export const LIBRARY_WINDOW_MS = 60_000;
export const LIBRARY_WINDOW_MAX = 10;
export const LIBRARY_MIN_GAP_MS = 1_000;
export const LIBRARY_PATTERN_GAPS = 4;
export const LIBRARY_PATTERN_MAX_GAP_MS = 10_000;
export const LIBRARY_PATTERN_TOLERANCE = 0.25;
export const LIBRARY_HISTORY = 12;

export type LibraryThrottle =
  | { blocked: true; retryAfterMs: number }
  | { blocked: false; hits: number[]; block: boolean };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : sorted[middle] ?? 0;
};

// Pola berirama: empat jarak terakhir saling berdekatan (dalam 25% median).
// Ini yang menangkap pengambilan berkala tiap 1, 3, 5, atau 10 detik tanpa
// harus menunggu batas jumlah per menit tercapai. Jarak yang naik-turun
// seperti klik manusia biasa tidak dianggap pola.
export function isPeriodicFetch(gaps: number[]): boolean {
  const recent = gaps.slice(-LIBRARY_PATTERN_GAPS);
  if (recent.length < LIBRARY_PATTERN_GAPS) return false;
  const middle = median(recent);
  if (middle < LIBRARY_MIN_GAP_MS || middle > LIBRARY_PATTERN_MAX_GAP_MS) return false;
  return recent.every((gap) => Math.abs(gap - middle) <= middle * LIBRARY_PATTERN_TOLERANCE);
}

export function decideLibraryFetch(o: {
  hits: number[]; blockedUntil: number | null; now: number;
}): LibraryThrottle {
  if (o.blockedUntil !== null && o.blockedUntil > o.now) {
    return { blocked: true, retryAfterMs: o.blockedUntil - o.now };
  }

  const recent = [...o.hits.filter((hit) => Number.isFinite(hit) && hit > o.now - LIBRARY_WINDOW_MS && hit <= o.now), o.now]
    .sort((a, b) => a - b)
    .slice(-LIBRARY_HISTORY);
  const gaps = recent.slice(1).map((hit, index) => hit - (recent[index] ?? hit));

  const block = gaps.some((gap) => gap < LIBRARY_MIN_GAP_MS) // dua permintaan < 1 detik
    || recent.length > LIBRARY_WINDOW_MAX // lebih dari 10 kali per menit
    || isPeriodicFetch(gaps); // pola berirama 1–10 detik

  return { blocked: false, hits: recent, block };
}
