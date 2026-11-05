'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaPending } from '@/lib/auth/mfa';
import { createClient } from '@/lib/supabase/server';
import { safeRedirect } from '@/lib/safe-redirect';

export type LoginState = { error: string; email: string } | null;
const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(72),
  next: z.string().optional(),
});

export async function signIn(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get('email') ?? '');
  const generic = { error: 'Email atau kata sandi salah.', email };
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return generic;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return generic; // pesan generik: tidak membedakan akun ada/tidak
  const target = safeRedirect(parsed.data.next);
  // Akun dengan faktor terverifikasi baru mendapat sesi aal1; tahan di tantangan
  // TOTP sebelum halaman aplikasi mana pun dibuka.
  if (await mfaPending(supabase)) redirect(`/login/2fa?next=${encodeURIComponent(target)}`);
  redirect(target); // redirect() melempar; di luar try/catch
}
