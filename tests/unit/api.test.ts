import { describe, expect, it } from 'vitest';
import {
  API_KEY_PATTERN, generateApiKey, hashApiKeySecret, parseApiKey, verifyApiKeySecret,
} from '../../src/lib/api/keys';
import {
  canWriteOwned, isAllowed, normalizePermissions, normalizeScope,
  permissionCount, scopeFor, scopeMatches,
} from '../../src/lib/api/permissions';
import { DEFAULT_SCOPE } from '../../src/lib/api/resources';

describe('API key', () => {
  it('membuat prefix 12 hex dan secret 43 karakter base64url', () => {
    const key = generateApiKey();
    const parsed = parseApiKey(key.key);
    expect(parsed).not.toBeNull();
    expect(parsed!.prefix).toBe(key.prefix);
    expect(parsed!.prefix).toMatch(/^[a-f0-9]{12}$/);
    expect(parsed!.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('menghasilkan key berbeda dan hash yang cocok dengan secret', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(hashApiKeySecret('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(verifyApiKeySecret(parseApiKey(a.key)!.secret, a.hash)).toBe(true);
    expect(verifyApiKeySecret(parseApiKey(b.key)!.secret, a.hash)).toBe(false);
  });

  it('menolak format cacat', () => {
    for (const raw of ['', 'ecl_', 'ecl_abc_def', 'exl_0123456789ab_' + 'a'.repeat(43), 'ecl_0123456789ab_' + 'a'.repeat(42)]) {
      expect(parseApiKey(raw), raw).toBeNull();
    }
    expect(API_KEY_PATTERN.test(generateApiKey().key)).toBe(true);
    expect(verifyApiKeySecret('x', 'bukan-hash')).toBe(false);
  });
});

describe('izin API', () => {
  it('hanya menyimpan resource/aksi yang dikenal dan bernilai true', () => {
    const value = normalizePermissions({
      events: { read: true, create: true, update: false },
      cloud: { read: true },
      schedules: { launch: true },
      tasks: 'read',
    });
    expect(value).toEqual({ events: { read: true, create: true } });
    expect(isAllowed(value, 'events', 'read')).toBe(true);
    expect(isAllowed(value, 'events', 'delete')).toBe(false);
    expect(isAllowed(value, 'schedules', 'read')).toBe(false);
    expect(permissionCount(value)).toBe(2);
  });

  it('cakupan default none dan nilai asing diabaikan', () => {
    expect(normalizeScope(null)).toEqual(DEFAULT_SCOPE);
    expect(normalizeScope({ portfolio: 'all', members: 'galaxy', inventory: 'public' }))
      .toEqual({ ...DEFAULT_SCOPE, portfolio: 'all' });
    expect(normalizeScope({ inventory: 'self' }).inventory).toBe('self');
    expect(scopeFor(normalizeScope({ portfolio: 'self' }), 'portfolio')).toBe('self');
    expect(scopeFor(normalizeScope({}), 'members')).toBe('none');
  });
});

describe('pencocokan cakupan', () => {
  const base = { ownerId: 'owner', memberIds: ['a', 'b'], rowOwnerId: 'a', visibility: 'public' };

  it('all, selected, self, public, none', () => {
    expect(scopeMatches('all', base)).toBe(true);
    expect(scopeMatches('selected', base)).toBe(true);
    expect(scopeMatches('selected', { ...base, rowOwnerId: 'c' })).toBe(false);
    expect(scopeMatches('self', { ...base, rowOwnerId: 'owner' })).toBe(true);
    expect(scopeMatches('self', base)).toBe(false);
    expect(scopeMatches('public', base)).toBe(true);
    expect(scopeMatches('public', { ...base, visibility: 'class_member' })).toBe(false);
    expect(scopeMatches('none', base)).toBe(false);
  });

  it('penulisan hanya untuk self dan baris milik sendiri', () => {
    expect(canWriteOwned(normalizeScope({ portfolio: 'self' }), 'portfolio', 'owner', 'owner')).toBe(true);
    expect(canWriteOwned(normalizeScope({ portfolio: 'self' }), 'portfolio', 'owner', 'a')).toBe(false);
    expect(canWriteOwned(normalizeScope({ portfolio: 'all' }), 'portfolio', 'owner', 'owner')).toBe(false);
  });
});
