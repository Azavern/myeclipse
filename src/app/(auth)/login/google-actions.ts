'use server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  GOOGLE_NONCE_COOKIE, GOOGLE_NONCE_TTL_SECONDS, checkClaims, createNonce, hashNonce, readClaims,
} from '@/lib/auth/google';
import { env } from '@/lib/env';
import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

// Login Google lewat Google Identity Services: peramban memperoleh ID token dari
// Google, lalu token itu ditukar menjadi sesi Supabase di server. Tidak ada
// redirect OAuth Supabase dan tidak ada role/profil/membership yang dibuat di sini.
export type GoogleSignInResult = { error: string } | { next: string };

export type GoogleNonceResult =
  | { ok: true; hashedNonce: string }
  | { ok: false; error: string };

type ViewerRow = { status: string | null };

const CREDENTIAL = z.string().min(200).max(8000);
const EXPIRED = 'Sesi masuk Google sudah kedaluwarsa. Muat ulang halaman lalu coba lagi.';
const GENERIC = 'Masuk dengan Google gagal. Coba lagi atau masuk dengan email dan kata sandi.';
const UNVERIFIED = 'Email akun ini belum terverifikasi. Masuk dengan kata sandi, lalu verifikasi email di Pengaturan → Keamanan akun.';
const MEMBER = 'Akun Google ini belum terdaftar sebagai anggota kelas. Minta Ketua kelas mengirim undangan.';
const INACTIVE = 'Akun ini sedang nonaktif. Hubungi Ketua kelas.';

const COOKIE = {
  httpOnly: true, sameSite: 'lax' as const, secure: env.IS_PROD, path: '/', maxAge: GOOGLE_NONCE_TTL_SECONDS,
};

// Nonce disimpan di cookie httpOnly dan dipakai sekali, sehingga ID token yang
// sama tidak bisa diputar ulang dari tab atau perangkat lain.
export async function beginGoogleSignIn(): Promise<GoogleNonceResult> {
  if (!env.GOOGLE_CLIENT_ID) return { ok: false, error: 'Masuk dengan Google belum dikonfigurasi. Gunakan email dan kata sandi.' };
  const nonce = createNonce();
  (await cookies()).set(GOOGLE_NONCE_COOKIE, nonce, COOKIE);
  return { ok: true, hashedNonce: hashNonce(nonce) };
}

function messageForCode(code: string | undefined): string {
  if (code === 'signup_disabled' || code === 'user_already_exists' || code === 'email_exists') return MEMBER;
  if (code === 'user_banned') return INACTIVE;
  if (code === 'email_not_confirmed' || code === 'provider_email_needs_verification') return UNVERIFIED;
  return GENERIC;
}

export async function completeGoogleSignIn(rawCredential: string, next: string): Promise<GoogleSignInResult> {
  const jar = await cookies();
  const nonce = jar.get(GOOGLE_NONCE_COOKIE)?.value;
  jar.delete(GOOGLE_NONCE_COOKIE); // sekali pakai, termasuk bila verifikasi gagal

  const token = CREDENTIAL.safeParse(rawCredential);
  if (!nonce || !token.success) return { error: EXPIRED };

  const checked = checkClaims(readClaims(token.data), hashNonce(nonce));
  if (!checked.ok) {
    console.error('googleSignIn token', checked.reason);
    if (checked.reason === 'email') return { error: UNVERIFIED };
    return { error: checked.reason === 'expired' ? EXPIRED : GENERIC };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: token.data, nonce });
  if (error || !data.user) {
    console.error('signInWithIdToken', error?.code ?? error?.status ?? 'no-user');
    return { error: messageForCode(error?.code) };
  }

  // Sama seperti login kata sandi: hanya akun dengan email terverifikasi dan
  // keanggotaan aktif yang boleh memakai sesi ini. Identitas Google yang
  // emailnya sama dengan akun kata sandi ditautkan Supabase ke user yang sama.
  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    return { error: UNVERIFIED };
  }
  const { data: ctx } = await supabase.rpc('get_viewer_context');
  const status = ((ctx ?? []) as ViewerRow[])[0]?.status ?? null;
  if (status !== 'active') {
    await supabase.auth.signOut();
    return { error: status ? INACTIVE : MEMBER };
  }
  return { next: safeRedirect(next) };
}
