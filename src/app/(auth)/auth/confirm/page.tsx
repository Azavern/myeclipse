import type { Metadata } from 'next';
import { ConfirmAccessForm } from '@/features/auth/forms';

export const metadata: Metadata = { title: 'Buka akses akun' };

export default function ConfirmPage() {
  return (
    <>
      <header className="stack stack--sm">
        <h1>Buka akses akun</h1>
        <p className="muted">Tekan tombol di bawah untuk melanjutkan dan membuat kata sandi.</p>
      </header>
      <ConfirmAccessForm />
    </>
  );
}
