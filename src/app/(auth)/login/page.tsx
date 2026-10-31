import type { Metadata } from 'next';
import Link from 'next/link';
import { env } from '@/lib/env';
import { safeRedirect } from '@/lib/safe-redirect';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <header className="stack stack--sm">
        <h1>Selamat datang kembali</h1>
        <p className="muted">Masuk dengan akun yang diberikan Ketua kelas.</p>
      </header>
      <LoginForm next={safeRedirect(next)} googleClientId={env.GOOGLE_CLIENT_ID ?? null} />
      <p className="muted">
        Punya inv_key inventory?{' '}
        <Link href="/inventory/access">Buka inventory tanpa masuk</Link>.
      </p>
    </>
  );
}
