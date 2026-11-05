import { describe, expect, it } from 'vitest';
import { needsSecondFactor } from '../../src/lib/auth/aal';

describe('needsSecondFactor', () => {
  it('menahan sesi aal1 bila akun punya faktor terverifikasi', () => {
    expect(needsSecondFactor({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(true);
  });

  it('meloloskan sesi yang sudah aal2', () => {
    expect(needsSecondFactor({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(false);
  });

  it('meloloskan akun tanpa faktor terverifikasi', () => {
    expect(needsSecondFactor({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(false);
  });

  it('meloloskan sesi tanpa level yang terbaca', () => {
    expect(needsSecondFactor({ currentLevel: null, nextLevel: null })).toBe(false);
  });
});
