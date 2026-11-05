'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { mfaPending } from '@/lib/auth/mfa';
import { burnPinWork, hashPin, PIN_RE, verifyPin } from '@/lib/auth/pin-hash';
import { withFlash } from '@/lib/flash';
import { createRateLimiter } from '@/lib/rate-limit';
import { safeRedirect } from '@/lib/safe-redirect';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export type PinLoginState = { error: string; email: string } | null;
export type PinState = { error?: string } | null;

const EXPIRED = 'Sesi ini sudah berakhir. Masuk kembali.';
const GENERIC_LOGIN = 'Email atau PIN salah.';
const GENERIC_SAVE = 'PIN belum bisa disimpan. Coba lagi.';
const MEMBER = 'Akun ini belum terdaftar sebagai anggota aktif. Hubungi Ketua kelas.';

// Best-effort per alamat; batas keras ada di DB (5 percobaan / 15 menit).
const allowPinAttempt = createRateLimiter(10, 10 * 60 * 1000);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  pin: z.string().regex(PIN_RE),
  next: z.string().optional(),
});

export async function signInWithPin(_prev: PinLoginState, fd: FormData): Promise<PinLoginState> {
  const emailRaw = String(fd.get('email') ?? '');
  const generic = { error: GENERIC_LOGIN, email: emailRaw };
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return generic;
  const { email, pin } = parsed.data;
  if (!allowPinAttempt(email)) return { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.', email };

  const admin = createAdminClient();
  const begin = await admin.rpc('pin_begin_by_email', { p_email: email });
  if (begin.error) {
    console.error('pin login begin', begin.error.code);
    return generic;
  }
  const row = (Array.isArray(begin.data) ? begin.data[0] : begin.data) as
    { user_id?: string; pin_hash?: string | null; allowed?: boolean } | null;
  if (!row?.user_id) {
    await burnPinWork(pin); // samakan biaya dengan akun yang punya PIN
    return generic;
  }
  if (!row.allowed || typeof row.pin_hash !== 'string') return generic;

  let ok = false;
  try {
    ok = await verifyPin(pin, row.pin_hash);
  } catch {
    ok = false;
  }
  const finish = await admin.rpc('pin_finish', { p_user_id: row.user_id, p_success: ok });
  if (finish.error) console.error('pin login finish', finish.error.code);
  if (!ok) return generic;

  // PIN benar, tetapi sesi baru dibuat lewat magic-link sekali pakai yang
  // ditukar di server. Token tidak pernah dikirim ke peramban.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token) {
    console.error('pin login link', link.error?.code);
    return generic;
  }
  const supabase = await createClient();
  const verified = await supabase.auth.verifyOtp({ token_hash: token, type: 'magiclink' });
  if (verified.error) {
    console.error('pin login verify', verified.error.code);
    return generic;
  }

  const ctx = await supabase.rpc('get_viewer_context');
  const status = ((ctx.data ?? []) as { status: string | null }[])[0]?.status ?? null;
  if (status !== 'active') {
    await supabase.auth.signOut();
    return { error: MEMBER, email };
  }

  const target = safeRedirect(parsed.data.next);
  if (await mfaPending(supabase)) redirect(`/login/2fa?next=${encodeURIComponent(target)}`);
  redirect(target);
}

const saveSchema = z.object({
  current: z.string().min(1, 'Kata sandi saat ini wajib diisi.').max(72),
  pin: z.string().regex(PIN_RE, 'PIN tepat 6 angka.'),
  confirm: z.string(),
}).refine((v) => v.pin === v.confirm, { message: 'Ulangan PIN tidak sama.', path: ['confirm'] });

export async function setPin(_prev: PinState, fd: FormData): Promise<PinState> {
  const parsed = saveSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Isian PIN tidak valid.' };
  const ctx = await requireActionContext();
  if (!ctx) return { error: EXPIRED };
  if (!ctx.user.email) return { error: EXPIRED };
  if ((await ctx.supabase.auth.signInWithPassword({
    email: ctx.user.email, password: parsed.data.current,
  })).error) return { error: 'Kata sandi saat ini salah.' };

  const pinHash = await hashPin(parsed.data.pin);
  const admin = createAdminClient();
  const { error } = await admin.rpc('pin_set', { p_user_id: ctx.user.id, p_pin_hash: pinHash });
  if (error) {
    console.error('pin set', error.code);
    return { error: error.code === 'EC081' ? MEMBER : GENERIC_SAVE };
  }
  redirect(withFlash('/settings/account', 'pinSet'));
}

export async function removePin(_prev: PinState, fd: FormData): Promise<PinState> {
  const parsed = z.object({ current: z.string().min(1).max(72) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: 'Kata sandi saat ini wajib diisi.' };
  const ctx = await requireActionContext();
  if (!ctx) return { error: EXPIRED };
  if (!ctx.user.email) return { error: EXPIRED };
  if ((await ctx.supabase.auth.signInWithPassword({
    email: ctx.user.email, password: parsed.data.current,
  })).error) return { error: 'Kata sandi saat ini salah.' };

  const { error } = await createAdminClient().rpc('pin_remove', { p_user_id: ctx.user.id });
  if (error) {
    console.error('pin remove', error.code);
    return { error: 'PIN belum bisa dihapus. Coba lagi.' };
  }
  redirect(withFlash('/settings/account', 'pinRemoved'));
}
