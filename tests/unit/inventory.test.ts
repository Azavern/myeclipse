import { describe, expect, it } from 'vitest';
import {
  cleanInvKey, INV_KEY_LENGTH, isValidInvKey, invKeyStatus, normalizeInvKey,
} from '../../src/lib/inventory/keys';

describe('inv_key', () => {
  it('menormalkan spasi dan huruf kecil', () => {
    expect(normalizeInvKey('  customkey1234567 ')).toBe('CUSTOMKEY1234567');
  });

  it('hanya menerima tepat 16 karakter huruf, angka, - dan _', () => {
    expect(INV_KEY_LENGTH).toBe(16);
    expect(isValidInvKey('CUSTOMKEY1234567')).toBe(true);
    expect(isValidInvKey('customkey1234567')).toBe(true);
    expect(isValidInvKey('AB-CD_EF12345678')).toBe(true);
    expect(isValidInvKey('CUSTOMKEY123456')).toBe(false);
    expect(isValidInvKey('CUSTOMKEY12345678')).toBe(false);
    expect(isValidInvKey('CUSTOM KEY12345')).toBe(false);
    expect(isValidInvKey('CUSTOMKEY12345!')).toBe(false);
  });

  it('membersihkan isian klien tanpa melebihi 16 karakter', () => {
    expect(cleanInvKey(' ab-cd_12! ')).toBe('AB-CD_12');
    expect(cleanInvKey('x'.repeat(30))).toHaveLength(16);
  });

  it('menurunkan status dari waktu, pencabutan, dan masa aktif', () => {
    const now = new Date('2026-10-29T12:00:00Z');
    expect(invKeyStatus({ revoked_at: null, expires_at: null }, now)).toBe('active');
    expect(invKeyStatus({ revoked_at: null, expires_at: '2026-10-30T00:00:00Z' }, now)).toBe('active');
    expect(invKeyStatus({ revoked_at: null, expires_at: '2026-10-29T00:00:00Z' }, now)).toBe('expired');
    expect(invKeyStatus({ revoked_at: '2026-10-29T00:00:00Z', expires_at: null }, now)).toBe('revoked');
  });
});
