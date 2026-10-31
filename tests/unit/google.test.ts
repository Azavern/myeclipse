import { describe, expect, it } from 'vitest';
import { GOOGLE_ISSUER, checkClaims, createNonce, hashNonce, readClaims } from '../../src/lib/auth/google';
import { allowsGoogleSignIn, buildCsp } from '../../src/lib/security/csp';

const jwt = (payload: unknown) => {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(payload)}.tanda-tangan`;
};

const future = Math.floor(Date.now() / 1000) + 300;

describe('nonce Google Identity Services', () => {
  it('32 byte acak, base64url, dan berbeda tiap pemanggilan', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  it('hash SHA-256 hex huruf kecil dan terikat pada nonce', () => {
    expect(hashNonce('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashNonce('a')).not.toBe(hashNonce('b'));
    expect(hashNonce(createNonce())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('klaim ID token Google', () => {
  it('membaca payload JWT tanpa verifikasi tanda tangan', () => {
    expect(readClaims(jwt({ iss: GOOGLE_ISSUER, email: 'a@b.id' }))).toEqual({ iss: GOOGLE_ISSUER, email: 'a@b.id' });
  });
  it('token cacat tidak melempar galat', () => {
    for (const bad of ['', 'a.b', 'a.b.c.d', `x.${Buffer.from('bukan json').toString('base64url')}.y`]) {
      expect(readClaims(bad), bad).toBeNull();
    }
  });

  const nonce = createNonce();
  const claims = {
    iss: GOOGLE_ISSUER, aud: 'client.apps.googleusercontent.com', sub: '123',
    email: 'Budi@Email.com', email_verified: true, nonce: hashNonce(nonce), exp: future,
  };
  it('menerima token dengan issuer, nonce, email terverifikasi, dan masa berlaku yang benar', () => {
    expect(checkClaims(claims, hashNonce(nonce))).toEqual({ ok: true, email: 'budi@email.com' });
  });
  it('menolak issuer lain dan payload kosong', () => {
    expect(checkClaims({ ...claims, iss: 'https://evil.example' }, hashNonce(nonce))).toEqual({ ok: false, reason: 'claims' });
    expect(checkClaims(null, hashNonce(nonce))).toEqual({ ok: false, reason: 'claims' });
  });
  it('menolak nonce yang berbeda tanpa membocorkan perbandingan', () => {
    expect(checkClaims({ ...claims, nonce: 'x' }, hashNonce(nonce))).toEqual({ ok: false, reason: 'nonce' });
    expect(checkClaims({ ...claims, nonce: hashNonce(createNonce()) }, hashNonce(nonce))).toEqual({ ok: false, reason: 'nonce' });
    expect(checkClaims({ ...claims, nonce: undefined }, hashNonce(nonce))).toEqual({ ok: false, reason: 'nonce' });
  });
  it('menolak email yang belum terverifikasi dan token kedaluwarsa', () => {
    expect(checkClaims({ ...claims, email_verified: false }, hashNonce(nonce))).toEqual({ ok: false, reason: 'email' });
    expect(checkClaims({ ...claims, exp: future - 400 }, hashNonce(nonce))).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('CSP halaman masuk Google Identity Services', () => {
  const dir = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
  it('hanya /login yang membuka skrip, koneksi, dan frame Google', () => {
    expect(allowsGoogleSignIn('/login')).toBe(true);
    for (const p of ['/', '/loginx', '/settings/account', '/auth/google']) expect(allowsGoogleSignIn(p), p).toBe(false);
  });
  it('rute login menambah accounts.google.com tanpa melepas nonce dan strict-dynamic', () => {
    const csp = buildCsp({ nonce: 'n', googleSignIn: true });
    expect(dir(csp, 'script-src')).toBe("script-src 'self' 'nonce-n' 'strict-dynamic' https://accounts.google.com");
    expect(dir(csp, 'connect-src')).toBe("connect-src 'self' https://accounts.google.com");
    expect(dir(csp, 'frame-src')).toBe('frame-src https://accounts.google.com');
  });
  it('rute lain tidak memuat asal Google sama sekali', () => {
    const csp = buildCsp({ nonce: 'n' });
    expect(csp).not.toContain('accounts.google.com');
    expect(csp).not.toContain('frame-src');
  });
});
