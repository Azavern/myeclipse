import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Google Identity Services mengembalikan ID token (JWT) ke peramban. Nonce
// mencegah token diputar ulang: aplikasi membuat nonce acak, mengirim SHA-256
// hex-nya ke Google, lalu Supabase membandingkan klaim `nonce` pada token dengan
// hash dari nonce asli yang kita simpan di cookie httpOnly.
//
// Modul ini murni (tanpa server-only) supaya dapat diuji Vitest. Verifikasi
// tanda tangan, issuer, audiens, dan masa berlaku yang mengikat tetap dilakukan
// Supabase Auth; pemeriksaan di sini hanya penyaring awal agar token yang jelas
// salah tidak sempat membuat sesi.
export const GOOGLE_NONCE_COOKIE = 'gsi_nonce';
export const GOOGLE_NONCE_TTL_SECONDS = 600;
export const GOOGLE_ISSUER = 'https://accounts.google.com';

export type GoogleClaims = {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  nonce?: unknown;
  exp?: unknown;
};

export type GoogleClaimCheck =
  | { ok: true; email: string | null }
  | { ok: false; reason: 'claims' | 'nonce' | 'email' | 'expired' };

/** Nonce acak 32 byte; dikirim ke Google hanya dalam bentuk hash. */
export function createNonce(): string {
  return randomBytes(32).toString('base64url');
}

/** Bentuk nonce yang diharapkan Supabase pada klaim token: SHA-256 hex. */
export function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex');
}

/**
 * Payload JWT tanpa verifikasi tanda tangan; `null` bila bentuknya tidak sah.
 * Jangan pakai hasilnya untuk memberi akses — hanya untuk menolak lebih awal.
 */
export function readClaims(token: string): GoogleClaims | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as GoogleClaims) : null;
  } catch {
    return null;
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Issuer, nonce, email terverifikasi, dan masa berlaku harus cocok. */
export function checkClaims(
  claims: GoogleClaims | null,
  expectedHashedNonce: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): GoogleClaimCheck {
  if (!claims || claims.iss !== GOOGLE_ISSUER) return { ok: false, reason: 'claims' };
  if (typeof claims.nonce !== 'string' || !sameString(claims.nonce, expectedHashedNonce)) {
    return { ok: false, reason: 'nonce' };
  }
  if (claims.email_verified !== true) return { ok: false, reason: 'email' };
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return { ok: false, reason: 'expired' };
  return { ok: true, email: typeof claims.email === 'string' ? claims.email.toLowerCase() : null };
}
