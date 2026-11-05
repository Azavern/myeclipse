import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

// PIN hanya 6 angka, jadi hash harus mahal secara sengaja. Parameter ini juga
// ditulis di dalam hash agar verifikasi tidak bergantung pada konstanta yang
// bisa berubah diam-diam. Lockout percobaan ada di database (migrasi 0031).
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEM = 64 * 1024 * 1024;

export const PIN_RE = /^\d{6}$/;

function derive(pin: string, salt: Buffer, n = N, r = R, p = P): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(pin, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(pin, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  // Tolak parameter di luar yang kita tulis, supaya baris rusak tidak membuat
  // server menghitung scrypt dengan biaya tak terbatas.
  if (n !== N || r !== R || p !== P) return false;
  const salt = Buffer.from(parts[4] ?? '', 'base64url');
  const expected = Buffer.from(parts[5] ?? '', 'base64url');
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;
  const actual = await derive(pin, salt, n, r, p);
  return timingSafeEqual(actual, expected);
}

// Dipakai saat email tidak punya PIN: biaya scrypt tetap dijalankan agar waktu
// jawab tidak membedakan akun ber-PIN dari yang tidak.
export async function burnPinWork(pin: string): Promise<void> {
  await derive(pin, randomBytes(SALT_LENGTH));
}
