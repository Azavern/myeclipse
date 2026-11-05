import { describe, expect, it } from 'vitest';
import { PIN_RE, hashPin, verifyPin } from '../../src/lib/auth/pin-hash';

describe('PIN scrypt', () => {
  it('menyimpan format scrypt dengan salt acak, bukan PIN', async () => {
    const a = await hashPin('123456');
    const b = await hashPin('123456');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('123456');
  });

  it('menerima PIN yang benar dan menolak yang salah', async () => {
    const hash = await hashPin('654321');
    await expect(verifyPin('654321', hash)).resolves.toBe(true);
    await expect(verifyPin('654322', hash)).resolves.toBe(false);
  });

  it('menolak hash rusak atau parameter di luar batas', async () => {
    await expect(verifyPin('123456', 'bukan-hash')).resolves.toBe(false);
    await expect(verifyPin('123456', 'scrypt$999999999$8$1$abc$def')).resolves.toBe(false);
    await expect(verifyPin('123456', 'scrypt$16384$8$1$abc$def')).resolves.toBe(false);
  });

  it('hanya menerima PIN 6 angka', () => {
    expect(PIN_RE.test('123456')).toBe(true);
    for (const bad of ['12345', '1234567', '12a456', ' 123456', '']) expect(PIN_RE.test(bad), bad).toBe(false);
  });
});
