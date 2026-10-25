'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
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
  current: z.string().min(1, 'Kata sandi lama wajib diisi.').max(72),
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
  if ((await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.current })).error)
    return { error: 'Kata sandi lama salah.' };
  if ((await supabase.auth.updateUser({ password: parsed.data.password })).error)
    return { error: 'Kata sandi belum bisa disimpan. Coba lagi.' };
  await supabase.auth.signOut({ scope: 'others' });
  redirect(withFlash('/settings/account', 'password'));
}

const emailForm = z.object({
  email: z.string().trim().toLowerCase().email('Email tidak valid.').max(254, 'Email maksimal 254 karakter.'),
  current: z.string().min(1, 'Kata sandi wajib diisi.').max(72),
});

// `updateUser({ email })` tidak dipakai: perubahan itu menunggu konfirmasi lewat email, sedangkan proyek ini
// tidak punya pengiriman email (blueprint A-05). Re-auth kata sandi dulu, lalu Admin API menandai email baru
// sudah terverifikasi. Id akun selalu dari sesi, dan hanya pemilik kata sandi yang bisa mengganti.
export async function changeEmail(_p: { error?: string } | null, fd: FormData): Promise<{ error?: string } | null> {
  const parsed = emailForm.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Isian tidak valid.' };
  const ctx = await requireActionContext();
  const oldEmail = ctx?.user.email;
  if (!ctx || !oldEmail) return { error: 'Sesi ini sudah berakhir. Masuk kembali.' };
  if (oldEmail.toLowerCase() === parsed.data.email) return { error: 'Email itu sudah menjadi email akunmu.' };
  if ((await ctx.supabase.auth.signInWithPassword({ email: oldEmail, password: parsed.data.current })).error)
    return { error: 'Kata sandi salah.' };
  const { error } = await createAdminClient().auth.admin.updateUserById(ctx.user.id, {
    email: parsed.data.email, email_confirm: true,
  });
  if (error) {
    console.error('changeEmail', error.code ?? error.status);
    const unusable = error.code === 'email_exists' || error.code === 'email_address_invalid' || error.code === 'email_address_not_authorized';
    return { error: unusable ? 'Email ini tidak bisa dipakai. Coba alamat lain.' : 'Email belum bisa diganti. Coba lagi.' };
  }
  // Email adalah identitas login: sesi di perangkat lain tidak perlu bertahan setelahnya.
  await ctx.supabase.auth.signOut({ scope: 'others' });
  redirect(withFlash('/settings/account', 'email'));
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
