import { describe, expect, it } from 'vitest';
import { generateOtp, hashOtp, otpEmail, otpHashMatches, OTP_TTL_SECONDS } from '../../src/lib/mail/otp';
import { formatCountdown } from '../../src/lib/time';

const SECRET = 'secret-uji';
const USER = '00000000-0000-0000-0000-000000000001';
const EMAIL = 'baru@email.com';

describe('OTP email', () => {
  it('selalu 6 angka, termasuk nol di depan', () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('hash deterministik, 64 hex, dan terikat ke secret + user + email + kode', () => {
    const hash = hashOtp(SECRET, USER, EMAIL, '123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp(SECRET, USER, EMAIL, '123456')).toBe(hash);
    expect(hashOtp('lain', USER, EMAIL, '123456')).not.toBe(hash);
    expect(hashOtp(SECRET, 'user-lain', EMAIL, '123456')).not.toBe(hash);
    expect(hashOtp(SECRET, USER, 'lain@email.com', '123456')).not.toBe(hash);
    expect(hashOtp(SECRET, USER, EMAIL, '123457')).not.toBe(hash);
  });

  it('membandingkan hash dengan aman dan menolak panjang berbeda', () => {
    const hash = hashOtp(SECRET, USER, EMAIL, '123456');
    expect(otpHashMatches(hash, hash)).toBe(true);
    expect(otpHashMatches(hash, hashOtp(SECRET, USER, EMAIL, '000000'))).toBe(false);
    expect(otpHashMatches(hash, 'pendek')).toBe(false);
    expect(otpHashMatches('', '')).toBe(true); // keduanya kosong; pemanggil tidak pernah mengirim hash kosong
  });

  it('templat email memuat nama kelas, kode, dan masa berlaku 5 menit', () => {
    const mail = otpEmail('654321', 'Kelas Uji');
    expect(mail.subject).toContain('Kelas Uji');
    expect(mail.html).toContain('Kelas Uji');
    expect(mail.text).toContain('654321');
    expect(mail.text).toContain('5 menit');
    expect(mail.html).toContain('654321');
    expect(OTP_TTL_SECONDS).toBe(300);
  });

  it('format hitungan mundur mm:ss', () => {
    expect(formatCountdown(300)).toBe('5:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-4)).toBe('0:00');
  });
});
