'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { findEmailOwner } from '@/lib/email-change';
import { env } from '@/lib/env';
import { generateOtp, hashOtp, otpHashMatches, OTP_MAX_ATTEMPTS, OTP_RESEND_SECONDS, OTP_TTL_SECONDS } from '@/lib/mail/otp';
import { sendOtpEmail } from '@/lib/mail/send';
import { createRateLimiter } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

export type SendCodeResult =
  | { ok: true; email: string; expiresIn: number; cooldown: number }
  | { ok: false; error: string; retryAfter?: number };
export type VerifyCodeResult = { ok: true; email: string } | { ok: false; error: string };

const emailField = z.string().trim().toLowerCase().email('Email tidak valid.').max(254, 'Email maksimal 254 karakter.');
const codeField = z.string().trim().regex(/^\d{6}$/, 'Kode terdiri dari 6 angka.');
const EXPIRED_SESSION = 'Sesi ini sudah berakhir. Masuk kembali.';
const GENERIC = 'Permintaan belum bisa diproses. Coba lagi.';

// Pembatas best-effort per pengguna: kode baru boleh tiap 30 detik (ditegakkan
// juga di DB lewat sent_at), tetapi tetap dibatasi agar satu akun tidak
// menghabiskan kuota SMTP dalam satu jam.
const allowSend = createRateLimiter(10, 60 * 60 * 1000);

const secondsUntilResend = (sentAt: string) =>
  Math.max(1, Math.ceil((Date.parse(sentAt) + OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000));

/** Kirim kode 6 angka ke alamat email baru. Email akun belum berubah sampai kode diverifikasi. */
export async function requestEmailCode(input: string): Promise<SendCodeResult> {
  const parsed = emailField.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Email tidak valid.' };
  const ctx = await requireActionContext();
  if (!ctx) return { ok: false, error: EXPIRED_SESSION };
  const email = parsed.data;
  // Alamat yang sama boleh diminta ulang hanya untuk memverifikasi email lama
  // yang statusnya belum terverifikasi; alamat yang sudah terverifikasi ditolak.
  if (ctx.user.email?.toLowerCase() === email && ctx.user.email_confirmed_at)
    return { ok: false, error: 'Email itu sudah menjadi email akunmu dan sudah terverifikasi.' };
  if (!allowSend(ctx.user.id)) return { ok: false, error: 'Terlalu banyak permintaan kode. Coba lagi nanti.' };

  // Cek ketersediaan lebih awal agar pengguna tidak menunggu kode ke alamat
  // yang sudah dipakai akun lain. Verifikasi tetap memeriksa ulang di Auth.
  const owner = await findEmailOwner(email);
  if (owner && owner !== ctx.user.id) return { ok: false, error: 'Email ini tidak bisa dipakai. Coba alamat lain.' };

  const admin = createAdminClient();
  const now = new Date();
  const code = generateOtp();
  const otpHash = hashOtp(env.SUPABASE_SECRET_KEY, ctx.user.id, email, code);
  const sentAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000).toISOString();

  // UPDATE bersyarat adalah penjaga jeda 30 detik: waktu dibandingkan di DB,
  // bukan di jam klien, dan hanya baris yang sudah lewat jeda yang berubah.
  const cutoff = new Date(now.getTime() - OTP_RESEND_SECONDS * 1000).toISOString();
  const { data: updated, error: updateError } = await admin
    .from('email_change_requests')
    .update({ new_email: email, otp_hash: otpHash, expires_at: expiresAt, sent_at: sentAt, attempts: 0 })
    .eq('user_id', ctx.user.id)
    .lt('sent_at', cutoff)
    .select('user_id');
  if (updateError) {
    console.error('requestEmailCode update', updateError.code);
    return { ok: false, error: GENERIC };
  }

  if (!updated?.length) {
    const { data: existing, error: readError } = await admin
      .from('email_change_requests')
      .select('sent_at')
      .eq('user_id', ctx.user.id)
      .maybeSingle<{ sent_at: string }>();
    if (readError) {
      console.error('requestEmailCode read', readError.code);
      return { ok: false, error: GENERIC };
    }
    if (existing) {
      const retryAfter = secondsUntilResend(existing.sent_at);
      return { ok: false, error: `Tunggu ${retryAfter} detik sebelum mengirim kode lagi.`, retryAfter };
    }
    const { error: insertError } = await admin.from('email_change_requests').insert({
      user_id: ctx.user.id, new_email: email, otp_hash: otpHash, expires_at: expiresAt, sent_at: sentAt,
    });
    if (insertError) {
      // 23505 = permintaan lain membuat baris lebih dulu (dua klik beruntun).
      if (insertError.code === '23505') return { ok: false, error: 'Kode baru saja dikirim. Tunggu sebentar.', retryAfter: OTP_RESEND_SECONDS };
      console.error('requestEmailCode insert', insertError.code);
      return { ok: false, error: GENERIC };
    }
  }

  if (!(await sendOtpEmail(email, code, ctx.className))) {
    // Pengiriman gagal bukan salah pengguna: hapus baris agar tidak terkena jeda 30 detik.
    await admin.from('email_change_requests').delete().eq('user_id', ctx.user.id).eq('otp_hash', otpHash);
    return { ok: false, error: 'Kode belum bisa dikirim. Coba lagi beberapa saat lagi.' };
  }
  return { ok: true, email, expiresIn: OTP_TTL_SECONDS, cooldown: OTP_RESEND_SECONDS };
}

/** Verifikasi kode lalu ganti email Supabase Auth. Kode dihapus sebelum email diubah. */
export async function verifyEmailCode(input: string): Promise<VerifyCodeResult> {
  const parsed = codeField.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Kode terdiri dari 6 angka.' };
  const ctx = await requireActionContext();
  if (!ctx) return { ok: false, error: EXPIRED_SESSION };
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from('email_change_requests')
    .select('new_email,otp_hash,expires_at,attempts')
    .eq('user_id', ctx.user.id)
    .maybeSingle<{ new_email: string; otp_hash: string; expires_at: string; attempts: number }>();
  if (error) {
    console.error('verifyEmailCode read', error.code);
    return { ok: false, error: GENERIC };
  }
  if (!row) return { ok: false, error: 'Tidak ada kode yang menunggu. Klik Verifikasi untuk mengirim kode baru.' };

  if (Date.parse(row.expires_at) <= Date.now()) {
    await admin.from('email_change_requests').delete().eq('user_id', ctx.user.id).eq('otp_hash', row.otp_hash);
    return { ok: false, error: 'Kode sudah kedaluwarsa. Kirim kode baru.' };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await admin.from('email_change_requests').delete().eq('user_id', ctx.user.id).eq('otp_hash', row.otp_hash);
    return { ok: false, error: 'Terlalu banyak percobaan. Kirim kode baru.' };
  }

  const computed = hashOtp(env.SUPABASE_SECRET_KEY, ctx.user.id, row.new_email, parsed.data);
  if (!otpHashMatches(row.otp_hash, computed)) {
    const attempts = row.attempts + 1;
    const query = admin.from('email_change_requests');
    // Hash ikut dikunci agar percobaan tertunda tidak menimpa kode yang lebih baru.
    if (attempts >= OTP_MAX_ATTEMPTS) await query.delete().eq('user_id', ctx.user.id).eq('otp_hash', row.otp_hash);
    else await query.update({ attempts }).eq('user_id', ctx.user.id).eq('otp_hash', row.otp_hash);
    const left = OTP_MAX_ATTEMPTS - attempts;
    return { ok: false, error: left > 0 ? `Kode salah. Sisa ${left} percobaan.` : 'Terlalu banyak percobaan. Kirim kode baru.' };
  }

  // Pakai sekali: DELETE yang mengembalikan baris adalah klaim atomik. Bila
  // tidak ada baris yang terhapus, kode ini sudah dipakai permintaan lain.
  const { data: used, error: deleteError } = await admin
    .from('email_change_requests')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('otp_hash', row.otp_hash)
    .select('user_id');
  if (deleteError || !used?.length) return { ok: false, error: 'Kode sudah dipakai. Kirim kode baru.' };

  // Bila tujuannya email yang sekarang (verifikasi email lama), cukup tandai
  // terkonfirmasi tanpa menulis ulang alamatnya.
  const sameEmail = ctx.user.email?.toLowerCase() === row.new_email;
  const { error: authError } = await admin.auth.admin.updateUserById(ctx.user.id,
    sameEmail ? { email_confirm: true } : { email: row.new_email, email_confirm: true });
  if (authError) {
    console.error('verifyEmailCode auth', authError.code ?? authError.status);
    const unusable = authError.code === 'email_exists'
      || authError.code === 'email_address_invalid'
      || authError.code === 'email_address_not_authorized';
    return { ok: false, error: unusable ? 'Email ini tidak bisa dipakai. Coba alamat lain.' : 'Email belum bisa diganti. Coba lagi.' };
  }

  // Email adalah identitas login: sesi di perangkat lain tidak perlu bertahan.
  await ctx.supabase.auth.signOut({ scope: 'others' });
  revalidatePath('/settings/account');
  return { ok: true, email: row.new_email };
}
