import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PWD_COOKIE } from '@/lib/auth-flags';
import { createClient } from '@/lib/supabase/server';
import { SetPasswordForm } from '@/features/auth/forms';

export const metadata: Metadata = { title: 'Buat kata sandi' };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (await cookies()).get(PWD_COOKIE)?.value !== user.id) redirect('/login');
  return (
    <>
      <header className="stack stack--sm">
        <h1>Buat kata sandi</h1>
        <p className="muted">Pilih kata sandi yang hanya kamu yang tahu. Setelah ini kamu bisa masuk seperti biasa.</p>
      </header>
      <SetPasswordForm />
    </>
  );
}
