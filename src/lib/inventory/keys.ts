// Aturan inv_key: tepat 16 karakter, disimpan kapital. Simbol dibatasi ke
// huruf, angka, - dan _ supaya key tetap bisa diketik ulang dari pesan chat.
export const INV_KEY_LENGTH = 16;
export const INV_KEY_QUOTA = 12;

const PATTERN = /^[A-Z0-9_-]{16}$/;
const SAFE = /[^A-Z0-9_-]/g;

export const normalizeInvKey = (value: string) => value.trim().toUpperCase();
export const cleanInvKey = (value: string) => normalizeInvKey(value).replace(SAFE, '').slice(0, INV_KEY_LENGTH);
export const isValidInvKey = (value: string) => PATTERN.test(normalizeInvKey(value));

export const INV_TTL = ['24h', '7d', '1m', '6m', 'never'] as const;
export type InvTtl = (typeof INV_TTL)[number];
export const INV_TTL_LABEL: Record<InvTtl, string> = {
  '24h': '24 jam',
  '7d': '7 hari',
  '1m': '1 bulan',
  '6m': '6 bulan',
  never: 'Tidak kedaluwarsa',
};

export type InvKeyStatus = 'active' | 'expired' | 'revoked';

// Status diturunkan dari waktu server, bukan job yang menulis ulang baris.
export function invKeyStatus(
  key: { revoked_at: string | null; expires_at: string | null },
  now: Date,
): InvKeyStatus {
  if (key.revoked_at) return 'revoked';
  if (key.expires_at && new Date(key.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'active';
}
