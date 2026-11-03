import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Format: ecl_<12 hex prefix>_<43 base64url secret>. Prefix memberi jalur lookup
// murah tanpa menyimpan secret; 32 byte acak memberi entropi 256 bit sehingga
// SHA-256 cukup (tidak perlu hashing lambat seperti kata sandi).
export const API_KEY_PATTERN = /^ecl_([a-f0-9]{12})_([A-Za-z0-9_-]{43})$/;

export type ParsedApiKey = { prefix: string; secret: string };

export function parseApiKey(raw: string): ParsedApiKey | null {
  const match = API_KEY_PATTERN.exec(raw.trim());
  return match?.[1] && match[2] ? { prefix: match[1], secret: match[2] } : null;
}

export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomBytes(6).toString('hex');
  const secret = randomBytes(32).toString('base64url');
  return { key: `ecl_${prefix}_${secret}`, prefix, hash: hashApiKeySecret(secret) };
}

export function verifyApiKeySecret(secret: string, expectedHash: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashApiKeySecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
