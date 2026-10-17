import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { changePassword } from '@/features/auth/actions';
import { accountFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Keamanan' };

export default function Page() {
  return (
    <ManageNew perm={null} next="/settings/account" icon="lock" title="Ganti kata sandi" description="Gunakan kata sandi yang kuat dan hanya kamu yang tahu."
      parent={{ label: 'Pengaturan', href: '/settings/profile' }} action={changePassword} fields={accountFields()} columns={1} submit="Ganti kata sandi"
      tips={['Minimal 10 karakter; makin panjang makin aman.', 'Setelah diganti, perangkat lain akan otomatis keluar.', 'Jangan pakai kata sandi yang sama dengan akun lain.']} />
  );
}
