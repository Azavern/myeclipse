import { describe, expect, it } from 'vitest';
import {
  decideLibraryFetch, isPeriodicFetch, LIBRARY_COOLDOWN_MS, LIBRARY_WINDOW_MAX, LIBRARY_WINDOW_MS,
} from '../../src/lib/library/throttle';

const at = (seconds: number) => 1_700_000_000_000 + seconds * 1_000;
const gapsOf = (times: number[]) => times.slice(1).map((time, index) => time - (times[index] ?? time));

// Jarak tidak berirama yang meniru klik manusia, dipakai untuk menguji aturan
// jumlah tanpa ikut memicu deteksi pola.
const uneven = [0, 2, 7, 9.3, 15.4, 18.5, 23.2, 25.7, 32.6, 35.4];

describe('pembatas pengambilan Library', () => {
  it('mengizinkan pengambilan pertama dan mencatat waktunya', () => {
    const result = decideLibraryFetch({ hits: [], blockedUntil: null, now: at(0) });
    expect(result.blocked).toBe(false);
    if (result.blocked) return;
    expect(result.block).toBe(false);
    expect(result.hits).toEqual([at(0)]);
  });

  it('memblokir dua pengambilan beruntun kurang dari satu detik', () => {
    const now = at(0) + 400;
    const result = decideLibraryFetch({ hits: [at(0)], blockedUntil: null, now });
    expect(result.blocked).toBe(false);
    if (result.blocked) return;
    expect(result.block).toBe(true);
  });

  it('memblokir setelah lebih dari sepuluh pengambilan dalam satu menit', () => {
    const times = uneven.slice(0, LIBRARY_WINDOW_MAX - 1).map((second) => at(second));
    const allowed = decideLibraryFetch({ hits: times, blockedUntil: null, now: at(40) });
    expect(allowed.blocked).toBe(false);
    if (allowed.blocked) return;
    expect(allowed.block).toBe(false);

    const blocked = decideLibraryFetch({
      hits: uneven.slice(0, LIBRARY_WINDOW_MAX).map((second) => at(second)),
      blockedUntil: null,
      now: at(41),
    });
    expect(blocked.blocked).toBe(false);
    if (blocked.blocked) return;
    expect(blocked.block).toBe(true);
  });

  it('mengenali pola berirama tiap 1, 3, 5, dan 10 detik', () => {
    for (const gap of [1, 3, 5, 10]) {
      const times = [0, 1, 2, 3, 4].map((step) => at(step * gap));
      expect(isPeriodicFetch(gapsOf(times)), `jarak ${gap} detik`).toBe(true);
    }
  });

  it('tidak menganggap jeda yang tidak berirama sebagai pola', () => {
    expect(isPeriodicFetch([1_100, 2_700, 1_400, 3_900])).toBe(false);
    expect(isPeriodicFetch([900, 3_000, 6_000, 9_500])).toBe(false);
    expect(isPeriodicFetch([2_000, 2_100, 1_900])).toBe(false);
  });

  it('memblokir pola berirama walaupun jumlahnya belum melewati batas', () => {
    const times = [0, 3, 6, 9, 12, 15].map((second) => at(second));
    const result = decideLibraryFetch({ hits: times.slice(0, 5), blockedUntil: null, now: times[5] ?? at(15) });
    expect(result.blocked).toBe(false);
    if (result.blocked) return;
    expect(result.block).toBe(true);
  });

  it('menahan pengambilan selama jeda dan membukanya setelah satu menit', () => {
    const until = at(60);
    const during = decideLibraryFetch({ hits: [], blockedUntil: until, now: at(20) });
    expect(during.blocked).toBe(true);
    if (!during.blocked) return;
    expect(during.retryAfterMs).toBe(LIBRARY_COOLDOWN_MS - 20_000);

    const after = decideLibraryFetch({ hits: [], blockedUntil: until, now: at(61) });
    expect(after.blocked).toBe(false);
    if (after.blocked) return;
    expect(after.block).toBe(false);
  });

  it('mengabaikan riwayat di luar jendela satu menit', () => {
    const stale = at(-(LIBRARY_WINDOW_MS / 1_000) - 5);
    const result = decideLibraryFetch({ hits: [stale, at(-50)], blockedUntil: null, now: at(0) });
    expect(result.blocked).toBe(false);
    if (result.blocked) return;
    expect(result.block).toBe(false);
    expect(result.hits).toEqual([at(-50), at(0)]);
  });
});
