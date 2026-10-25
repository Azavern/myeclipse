import type { Metadata } from 'next';
import { EntityForm } from '@/components/entity-form';
import { ManageNew } from '@/components/manage-pages';
import { Icon } from '@/components/ui/icon';
import { changeEmail, changePassword } from '@/features/auth/actions';
import { accountEmailFields, accountFields } from '@/features/fields';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Keamanan' };

export default async function Page() {
  const email = (await getViewer()).user?.email ?? null;
  return (
    <ManageNew perm={null} next="/settings/account" icon="lock" title="Keamanan akun" description="Kelola kata sandi dan email yang dipakai untuk masuk."
      parent={{ label: 'Pengaturan', href: '/settings/profile' }} action={changePassword} fields={accountFields()} columns={1} submit="Ganti kata sandi"
      tips={['Minimal 10 karakter; makin panjang makin aman.', 'Setelah diganti, perangkat lain akan otomatis keluar.', 'Jangan pakai kata sandi yang sama dengan akun lain.']}
      after={(
        <section className="card" aria-labelledby="email-title">
          <div className="card__head">
            <div>
              <h2 id="email-title" className="card__title"><Icon name="at" size={20} />Email akun</h2>
              <p className="card__desc">
                {email
                  ? <>Saat ini <strong>{email}</strong>. Setelah diganti, masuk dengan email baru; email lama tidak bisa dipakai lagi.</>
                  : 'Email akunmu belum terbaca. Muat ulang halaman.'}
              </p>
            </div>
          </div>
          <EntityForm action={changeEmail} fields={accountEmailFields()} submit="Ganti email" columns={1} />
        </section>
      )} />
  );
}
