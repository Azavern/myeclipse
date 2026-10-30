import type { Metadata } from 'next';
import Link from 'next/link';
import { safeRedirect } from '@/lib/safe-redirect';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Masuk' };

// Kunci tetap dari callback OAuth; teks tidak pernah diambil dari query string.
const SSO_ERROR: Record<string, string> = {
  oauth: 'Masuk dengan Google gagal atau dibatalkan. Coba lagi.',
  unverified: 'Email akun Google ini belum terverifikasi di Eclipse. Masuk dengan kata sandi, lalu verifikasi email di Pengaturan → Keamanan akun.',
  member: 'Akun Google ini belum terdaftar sebagai anggota kelas. Minta Ketua kelas mengirim undangan.',
  inactive: 'Akun ini sedang nonaktif. Hubungi Ketua kelas.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <header className="stack stack--sm">
        <h1>Selamat datang kembali</h1>
        <p className="muted">Masuk dengan akun yang diberikan Ketua kelas.</p>
      </header>
      <LoginForm next={safeRedirect(next)} ssoError={error ? (SSO_ERROR[error] ?? null) : null} />
      <p className="muted">
        Punya inv_key inventory?{' '}
        <Link href="/inventory/access">Buka inventory tanpa masuk</Link>.
      </p>
    </>
  );
}
