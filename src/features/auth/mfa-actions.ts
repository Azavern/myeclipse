'use server';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { mfaPending } from '@/lib/auth/mfa';
import { verifyUserPin } from '@/lib/auth/pin';
import { withFlash } from '@/lib/flash';
import { safeRedirect } from '@/lib/safe-redirect';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type MfaEnrollState = { error?: string; factor?: { id: string; qr: string; secret: string } } | null;
export type MfaState = { error?: string } | null;

const codeField = z.string().trim().regex(/^\d{6}$/);
const factorField = z.string().uuid();
const CODE_ERROR = 'Masukkan 6 angka dari aplikasi authenticator.';
const EXPIRED = 'Sesi ini sudah berakhir. Masuk kembali.';

// Satu faktor TOTP per akun. Faktor yang belum terverifikasi (pendaftaran
// ditinggalkan) dibersihkan dulu supaya tidak menumpuk dan tidak membingungkan
// saat login.
export async function beginTotpEnrollment(_prev: MfaEnrollState, _fd: FormData): Promise<MfaEnrollState> {
  const ctx = await requireActionContext();
  if (!ctx) return { error: EXPIRED };
  try {
    const listed = await ctx.supabase.auth.mfa.listFactors();
    if (listed.error) {
      console.error('mfa list', listed.error.code);
      return { error: 'Verifikasi dua langkah belum bisa disiapkan. Coba lagi.' };
    }
    const totp = listed.data?.totp ?? [];
    if (totp.some((factor) => factor.status === 'verified')) {
      return { error: 'Verifikasi dua langkah sudah aktif. Matikan dulu untuk mendaftar ulang.' };
    }
    for (const factor of totp) {
      const removed = await ctx.supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) console.error('mfa cleanup', removed.error.code);
    }
    const enrolled = await ctx.supabase.auth.mfa.enroll({
      factorType: 'totp', friendlyName: ctx.className.slice(0, 40),
    });
    const data = enrolled.data;
    if (enrolled.error || !data || data.type !== 'totp') {
      console.error('mfa enroll', enrolled.error?.code);
      return { error: 'Verifikasi dua langkah belum aktif di server. Hubungi pengelola kelas.' };
    }
    // QR dibuat dari URI yang dikembalikan Supabase; tidak ada kunci enkripsi
    // tambahan dan rahasianya tetap disimpan oleh Supabase Auth.
    const qr = await QRCode.toDataURL(data.totp.uri, { margin: 1, width: 220 });
    return { factor: { id: data.id, qr, secret: data.totp.secret } };
  } catch (error) {
    console.error('mfa enroll', error instanceof Error ? error.name : 'unknown');
    return { error: 'Verifikasi dua langkah belum bisa disiapkan. Coba lagi.' };
  }
}

export async function verifyTotpEnrollment(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const factorId = factorField.safeParse(fd.get('factorId'));
  const code = codeField.safeParse(fd.get('code'));
  if (!factorId.success || !code.success) return { error: CODE_ERROR };
  const ctx = await requireActionContext();
  if (!ctx) return { error: EXPIRED };
  try {
    const challenge = await ctx.supabase.auth.mfa.challenge({ factorId: factorId.data });
    if (challenge.error || !challenge.data) {
      console.error('mfa challenge', challenge.error?.code);
      return { error: 'Verifikasi belum bisa dimulai. Coba lagi.' };
    }
    const verified = await ctx.supabase.auth.mfa.verify({
      factorId: factorId.data, challengeId: challenge.data.id, code: code.data,
    });
    if (verified.error) {
      console.error('mfa verify', verified.error.code);
      return { error: 'Kode tidak cocok atau sudah kedaluwarsa. Coba lagi.' };
    }
  } catch (error) {
    console.error('mfa verify', error instanceof Error ? error.name : 'unknown');
    return { error: 'Kode belum bisa diperiksa. Coba lagi.' };
  }
  await ctx.supabase.auth.signOut({ scope: 'others' });
  redirect(withFlash('/settings/account', 'twoFactor'));
}

// Menghapus faktor hanya bisa dilakukan dari sesi yang sudah aal2 (halaman ini
// hanya terbuka setelah login lengkap). Bila PIN aktif, PIN menjadi konfirmasi;
// tanpa PIN, sesi aal2 itu sendiri sudah cukup.
export async function removeTotp(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const ctx = await requireActionContext();
  if (!ctx) return { error: EXPIRED };
  const pinStatus = await ctx.supabase.rpc('pin_status');
  if (pinStatus.data === true) {
    const pin = z.string().regex(/^\d{6}$/).safeParse(fd.get('pin'));
    if (!pin.success) return { error: 'Masukkan PIN 6 angka untuk mematikan verifikasi dua langkah.' };
    if (!(await verifyUserPin(createAdminClient(), ctx.user.id, pin.data)))
      return { error: 'PIN salah atau terlalu banyak percobaan. Coba lagi nanti.' };
  }
  try {
    const listed = await ctx.supabase.auth.mfa.listFactors();
    if (listed.error) {
      console.error('mfa list', listed.error.code);
      return { error: 'Verifikasi dua langkah belum bisa dimatikan. Coba lagi.' };
    }
    const totp = listed.data?.totp ?? [];
    for (const factor of totp) {
      const removed = await ctx.supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) {
        console.error('mfa unenroll', removed.error.code);
        return { error: 'Verifikasi dua langkah belum bisa dimatikan. Coba lagi.' };
      }
    }
  } catch (error) {
    console.error('mfa unenroll', error instanceof Error ? error.name : 'unknown');
    return { error: 'Verifikasi dua langkah belum bisa dimatikan. Coba lagi.' };
  }
  redirect(withFlash('/settings/account', 'twoFactorOff'));
}

// Tantangan login: sesi aal1 sudah ada dari kata sandi/Google, tetapi belum
// boleh dipakai. Batas percobaan mengandalkan rate limit Supabase Auth.
export async function verifyLoginTotp(_prev: MfaState, fd: FormData): Promise<MfaState> {
  const parsed = z.object({ code: codeField, next: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: CODE_ERROR };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Sesi masuk sudah berakhir. Muat ulang halaman lalu masuk lagi.' };
  const target = safeRedirect(parsed.data.next);
  if (!(await mfaPending(supabase))) redirect(target);
  try {
    const listed = await supabase.auth.mfa.listFactors();
    if (listed.error) {
      console.error('mfa list', listed.error.code);
      return { error: 'Verifikasi dua langkah belum bisa diperiksa. Coba lagi.' };
    }
    const factor = (listed.data?.totp ?? []).find((item) => item.status === 'verified');
    if (!factor) return { error: 'Verifikasi dua langkah belum siap untuk akun ini. Masuk kembali.' };
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data) {
      console.error('mfa challenge', challenge.error?.code);
      return { error: 'Verifikasi belum bisa dimulai. Coba lagi.' };
    }
    const verified = await supabase.auth.mfa.verify({
      factorId: factor.id, challengeId: challenge.data.id, code: parsed.data.code,
    });
    if (verified.error) {
      console.error('mfa login verify', verified.error.code);
      return { error: 'Kode tidak cocok atau sudah kedaluwarsa. Coba lagi.' };
    }
  } catch (error) {
    console.error('mfa login verify', error instanceof Error ? error.name : 'unknown');
    return { error: 'Kode belum bisa diperiksa. Coba lagi.' };
  }
  redirect(target);
}

export async function cancelMfaLogin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
