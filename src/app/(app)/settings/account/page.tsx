import type { Metadata } from 'next';
import Link from 'next/link';
import { EntityForm } from '@/components/entity-form';
import { ManageNew } from '@/components/manage-pages';
import { Icon } from '@/components/ui/icon';
import { changePassword } from '@/features/auth/actions';
import { EmailChange } from '@/features/auth/email-change';
import { accountFields, visibilityFields } from '@/features/fields';
import { saveMyVisibility } from '@/features/profile/actions';
import { getPendingEmailChange } from '@/lib/email-change';
import { createClient } from '@/lib/supabase/server';
import { MEMBER_KEYS } from '@/lib/visibility/audiences';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Keamanan' };

export default async function Page() {
  const viewer = await getViewer();
  const email = viewer.user?.email ?? null;
  const pendingEmail = viewer.user ? await getPendingEmailChange(viewer.user.id) : null;
  // Visibilitas pribadi diatur di sini, bersama kata sandi dan email akun.
  let current: Record<string, string> = {};
  if (viewer.user && viewer.status === 'active') {
    const { data } = await (await createClient()).from('visibility_rules').select('key,audience').eq('owner_id', viewer.user.id);
    current = Object.fromEntries(((data ?? []) as { key: string; audience: string }[]).map((r) => [r.key, r.audience]));
  }
  return (
    <ManageNew perm={null} next="/settings/account" icon="lock" title="Keamanan akun" description="Kelola kata sandi, email yang dipakai untuk masuk, dan siapa yang boleh melihat data profilmu."
      parent={{ label: 'Pengaturan', href: '/settings/profile' }} action={changePassword} fields={accountFields()} columns={1} submit="Ganti kata sandi"
      tips={['Minimal 10 karakter; makin panjang makin aman.', 'Setelah diganti, perangkat lain akan otomatis keluar.', 'Jangan pakai kata sandi yang sama dengan akun lain.']}
      after={(
        <>
          <EmailChange current={email} verified={Boolean(viewer.user?.email_confirmed_at)} pending={pendingEmail} />
          <section className="card" aria-labelledby="h-vis">
            <div className="card__head">
              <div>
                <h2 id="h-vis" className="card__title"><Icon name="eye" size={20} />Siapa yang boleh melihat</h2>
                <p className="card__desc">Pilihanmu tidak pernah lebih terbuka dari halaman Anggota. Awalnya hanya anggota kelas yang melihat datamu.</p>
              </div>
            </div>
            <EntityForm action={saveMyVisibility} fields={visibilityFields(MEMBER_KEYS, current)} submit="Simpan visibilitas" />
          </section>
          <p className="muted">
            Ketentuan dan privasi: <Link href="/terms">Syarat Layanan</Link> ·{' '}
            <Link href="/privacy">Kebijakan Privasi</Link>.
          </p>
        </>
      )} />
  );
}
