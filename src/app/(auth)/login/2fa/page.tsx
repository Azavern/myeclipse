import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { mfaPending } from '@/lib/auth/mfa';
import { safeRedirect } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';
import { TwoFactorLoginForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Verifikasi dua langkah' };

// Sesi aal1 hanya boleh memakai halaman ini: tidak ada data kelas yang dibaca
// dan satu-satunya aksi adalah membuat tantangan TOTP untuk sesi tersebut.
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirect((await searchParams).next);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!(await mfaPending(supabase))) redirect(next);
  return (
    <>
      <header className="stack stack--sm">
        <h1>Verifikasi dua langkah</h1>
        <p className="muted">
          Masuk sebagai <strong className="pre">{user.email ?? 'akunmu'}</strong>. Buka aplikasi authenticator
          yang kamu daftarkan, lalu masukkan kode 6 angka yang tampil.
        </p>
      </header>
      <TwoFactorLoginForm next={next} />
    </>
  );
}
