// Isi OTP untuk perubahan email. Bagian murni (tanpa nodemailer/server-only)
// supaya aturan kode dan templat email bisa diuji dengan Vitest.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Kode berlaku 5 menit sejak dikirim. */
export const OTP_TTL_SECONDS = 300;
/** Jeda minimum sebelum kode boleh dikirim ulang. */
export const OTP_RESEND_SECONDS = 30;
/** Percobaan verifikasi salah sebelum kode dibuang. */
export const OTP_MAX_ATTEMPTS = 5;

/** 6 angka dari CSPRNG; nol di depan dipertahankan. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// Kode hanya 6 angka, jadi hash tanpa kunci bisa dipecahkan dari dump DB.
// HMAC dengan kunci server (dan pesan yang mengikat user + email tujuan)
// membuat hash tidak berguna tanpa secret. Bind ke email juga mencegah kode
// yang dikirim untuk satu alamat dipakai setelah alamat itu diganti.
export function hashOtp(secret: string, userId: string, email: string, code: string): string {
  return createHmac('sha256', secret).update(`email-change:${userId}:${email}:${code}`).digest('hex');
}

/** Perbandingan waktu-tetap antara hash tersimpan dan hash hitungan. */
export function otpHashMatches(stored: string, computed: string): boolean {
  const a = Buffer.from(stored, 'utf8');
  const b = Buffer.from(computed, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

// Nama kelas selalu dari `classes.name` (A-01), jadi dikirim pemanggil — bukan
// di-hard-code — ke subjek, kop email, dan nama pengirim.
export function otpEmail(code: string, className: string) {
  const minutes = OTP_TTL_SECONDS / 60;
  const title = 'Verifikasi email baru';
  return {
    subject: `${title} — ${className}`,
    text: `${title}\n\nKode verifikasi: ${code}\n\nKode berlaku ${minutes} menit dan hanya dapat digunakan sekali. Jika kamu tidak meminta perubahan email, abaikan email ini dan email akunmu tidak berubah.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;padding:28px;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">
<h2 style="margin:0 0 8px;color:#4338ca">${className}</h2>
<h3 style="margin:0 0 16px">${title}</h3>
<p style="margin:0 0 16px">Masukkan kode berikut di Pengaturan → Keamanan akun untuk memakai alamat email ini:</p>
<p style="margin:0 0 16px;padding:20px;border-radius:12px;background:#eef2ff;text-align:center;font-size:30px;letter-spacing:8px;font-weight:bold;color:#3730a3">${code}</p>
<p style="margin:0 0 8px">Kode berlaku <strong>${minutes} menit</strong> dan hanya dapat digunakan sekali.</p>
<p style="margin:0">Jika kamu tidak meminta perubahan email, abaikan email ini dan email akunmu tidak berubah.</p>
</div>`,
  };
}

