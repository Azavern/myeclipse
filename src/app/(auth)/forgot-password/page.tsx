import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { ForgotPasswordForm } from '@/features/auth/forms';

export const metadata: Metadata = { title: 'Lupa kata sandi' };

export default function Page() {
  return (
    <>
      <header className="stack stack--sm">
        <Link href="/login" className="link-btn"><Icon name="arrow-left" size={16} />Kembali masuk</Link>
        <h1>Minta tautan akses baru</h1>
        <p className="muted">Kelas ini tidak mengirim email otomatis. Permintaanmu masuk ke Ketua, yang akan membagikan tautan akses baru.</p>
      </header>
      <ForgotPasswordForm />
    </>
  );
}
