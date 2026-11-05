'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaPending } from '@/lib/auth/mfa';
import { verifyUserPin } from '@/lib/auth/pin';
import { env } from '@/lib/env';
import { withFlash } from '@/lib/flash';
import { PWD_COOKIE } from '@/lib/auth-flags';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error: string } | null;
const token = z.string().regex(/^[A-Za-z0-9_-]{16,200}$/);
const passwordForm = z.object({
  password: z.string().min(10, 'Kata sandi minimal 10 karakter.').max(72, 'Kata sandi maksimal 72 karakter.'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: 'Konfirmasi kata sandi tidak sama.', path: ['confirm'] });

// Verifikasi lewat POST setelah klik (bukan GET) agar preview tautan di aplikasi chat tidak menghabiskan token.
export async function confirmAccessLink(_p: AuthState, fd: FormData): Promise<AuthState> {
  const t = token.safeParse(fd.get('token_hash'));
  const invalid = { error: 'Tautan ini tidak berlaku lagi. Minta Ketua membuat tautan baru.' };
  if (!t.success) return invalid;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: t.data, type: 'recovery' }); // hanya recovery
  if (error || !data.user) return invalid;
  (await cookies()).set(PWD_COOKIE, data.user.id, {
    httpOnly: true, sameSite: 'lax', secure: env.IS_PROD, path: '/', maxAge: 900,
  });
  redirect('/set-password');
}

export async function setPassword(_p: AuthState, fd: FormData): Promise<AuthState> {
  const parsed = passwordForm.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Isian tidak valid.' };
  const supabase = await createClient();
  const store = await cookies();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || store.get(PWD_COOKIE)?.value !== user.id) return { error: 'Sesi ini sudah berakhir. Buka kembali tautan akses.' };
  if ((await supabase.auth.updateUser({ password: parsed.data.password })).error)
    return { error: 'Kata sandi belum bisa disimpan. Coba lagi.' };
  await supabase.auth.signOut({ scope: 'others' }); // sesi lain tidak boleh bertahan setelah kredensial berubah
  const ctx = await supabase.rpc('get_viewer_context');
  const status = (ctx.data as { status: string | null }[] | null)?.[0]?.status;
  if (status === 'invited' && (await supabase.rpc('activate_my_membership')).error)
    return { error: 'Akun belum bisa diaktifkan. Coba lagi.' };
  store.delete(PWD_COOKIE);
  redirect(status === 'invited' ? '/settings/profile?onboarding=1' : '/');
}

const changeForm = z.object({
  current: z.string().max(72).optional(),
  pin: z.string().regex(/^\d{6}$/, 'PIN tepat 6 angka.').optional(),
  password: z.string().min(10, 'Kata sandi baru minimal 10 karakter.').max(72, 'Kata sandi maksimal 72 karakter.'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: 'Konfirmasi kata sandi tidak sama.', path: ['confirm'] });

// Tanpa echo `values`: kata sandi tidak boleh dikembalikan ke klien.
export async function changePassword(_p: { error?: string } | null, fd: FormData): Promise<{ error?: string } | null> {
  const parsed = changeForm.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Isian tidak valid.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Sesi ini sudah berakhir. Masuk kembali.' };
  // Aksi ini memakai klien langsung (bukan requireActionContext), jadi sesi aal1
  // milik akun ber-2FA harus ditahan sebelum bisa mengganti kredensial.
  if (await mfaPending(supabase)) return { error: 'Selesaikan verifikasi dua langkah sebelum mengganti kata sandi.' };
  // Bila PIN aktif, PIN menggantikan kata sandi lama sebagai konfirmasi. Ini
  // juga menghindari re-auth kata sandi yang menurunkan sesi aal2 ke aal1.
  const pinStatus = await supabase.rpc('pin_status');
  const hasPin = pinStatus.data === true;
  if (hasPin) {
    if (!parsed.data.pin) return { error: 'Masukkan PIN 6 angka.' };
    if (!(await verifyUserPin(createAdminClient(), user.id, parsed.data.pin)))
      return { error: 'PIN salah atau terlalu banyak percobaan. Coba lagi nanti.' };
  } else {
    if (!parsed.data.current) return { error: 'Kata sandi lama wajib diisi.' };
    if ((await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.current })).error)
      return { error: 'Kata sandi lama salah.' };
  }
  if ((await supabase.auth.updateUser({ password: parsed.data.password })).error)
    return { error: 'Kata sandi belum bisa disimpan. Coba lagi.' };
  await supabase.auth.signOut({ scope: 'others' });
  redirect(withFlash('/settings/account', 'password'));
}

export type ResetState = { message?: string; error?: string } | null;

// Anonim, jadi jawabannya selalu sama (tidak membocorkan email mana yang anggota). Hanya email anggota yang dicatat;
// insert lewat service role karena tabel tidak punya grant tulis untuk anon (migrasi 0011). Belum ada limiter laju (D-09).
export async function requestPasswordReset(_p: ResetState, fd: FormData): Promise<ResetState> {
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(fd.get('email'));
  if (!email.success) return { error: 'Email tidak valid.' };
  try {
    const admin = createAdminClient();
    const [{ data: cls }, users] = await Promise.all([
      admin.from('classes').select('id').single(), admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ]);
    const u = users.data?.users.find((x: { email?: string }) => x.email?.toLowerCase() === email.data);
    if (cls && u) {
      const { data: m } = await admin.from('memberships').select('user_id').eq('user_id', u.id).maybeSingle();
      if (m) {
        const { error } = await admin.from('password_reset_requests').insert({ class_id: cls.id, email: email.data });
        if (error && error.code !== '23505') console.error('requestPasswordReset', error.code); // 23505 = sudah ada yang menunggu
      }
    }
  } catch { console.error('requestPasswordReset gagal'); }
  return { message: 'Jika email itu terdaftar sebagai anggota, permintaanmu sudah diteruskan ke Ketua. Ketua akan membagikan tautan akses baru; hubungi Ketua langsung bila mendesak.' };
}
