import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { LIBRARY_COOLDOWN_MS, LIBRARY_WINDOW_MS, decideLibraryFetch } from './throttle';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LibraryGate = { allowed: true } | { allowed: false; retryAfterMs: number };

// Cadangan saat migrasi 0032 belum diterapkan: batas yang sama, tetapi hanya
// berlaku untuk proses ini. Kegagalannya dicatat sekali agar tidak membanjiri log.
const local = new Map<string, { hits: number[]; blockedUntil: number | null }>();
let warned = false;

const blockedFor = (ms: number): LibraryGate => ({ allowed: false, retryAfterMs: Math.max(1_000, Math.round(ms)) });

function gateLocal(userId: string): LibraryGate {
  const now = Date.now();
  const state = local.get(userId) ?? { hits: [], blockedUntil: null };
  const decision = decideLibraryFetch({ hits: state.hits, blockedUntil: state.blockedUntil, now });
  if (decision.blocked) return blockedFor(decision.retryAfterMs);

  local.set(userId, {
    hits: decision.hits,
    blockedUntil: decision.block ? now + LIBRARY_COOLDOWN_MS : null,
  });
  if (local.size > 2_000) {
    for (const [key, value] of local) {
      const stale = (value.blockedUntil ?? 0) <= now && value.hits.every((hit) => now - hit > LIBRARY_WINDOW_MS);
      if (stale) local.delete(key);
    }
  }
  return decision.block ? blockedFor(LIBRARY_COOLDOWN_MS) : { allowed: true };
}

// Satu pengambilan = satu daftar Drive. Riwayat disimpan di database supaya
// refresh yang jatuh ke instance lain tetap terhitung; keputusan dihitung dari
// riwayat itu, lalu jeda ditulis lewat fungsi kedua.
export async function gateLibraryFetch(supabase: Supabase, userId: string): Promise<LibraryGate> {
  try {
    const { data, error } = await supabase.rpc('library_fetch_hit');
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : null) as
      { recent?: string[] | null; blocked_until?: string | null; checked_at?: string } | null;
    const now = row?.checked_at ? Date.parse(row.checked_at) : Number.NaN;
    if (!row || !Number.isFinite(now)) throw new Error('respons pembatas kosong');

    const decision = decideLibraryFetch({
      hits: (row.recent ?? []).map((hit) => Date.parse(hit)).filter((hit) => Number.isFinite(hit)),
      blockedUntil: row.blocked_until ? Date.parse(row.blocked_until) : null,
      now,
    });
    if (decision.blocked) return blockedFor(decision.retryAfterMs);
    if (!decision.block) return { allowed: true };

    const { data: until, error: blockError } = await supabase.rpc('library_fetch_block');
    if (blockError) throw blockError;
    const blockedUntil = typeof until === 'string' ? Date.parse(until) : Number.NaN;
    return blockedFor(Number.isFinite(blockedUntil) ? blockedUntil - now : LIBRARY_COOLDOWN_MS);
  } catch (error) {
    if (!warned) {
      warned = true;
      console.error('library: pembatas database tidak tersedia, memakai pembatas per proses',
        error instanceof Error ? error.message : '');
    }
    return gateLocal(userId);
  }
}
