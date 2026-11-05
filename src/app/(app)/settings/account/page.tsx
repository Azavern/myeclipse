import type { Metadata } from 'next';
import Link from 'next/link';
import { EntityForm } from '@/components/entity-form';
import { ManageNew } from '@/components/manage-pages';
import { Icon } from '@/components/ui/icon';
import { changePassword } from '@/features/auth/actions';
import { EmailChange } from '@/features/auth/email-change';
import { PinSettings } from '@/features/auth/pin-settings';
import { TwoFactor } from '@/features/auth/two-factor';
import { accountFields, visibilityFields } from '@/features/fields';
import { saveMyVisibility } from '@/features/profile/actions';
import { getPendingEmailChange } from '@/lib/email-change';
import { createClient } from '@/lib/supabase/server';
import { MEMBER_KEYS } from '@/lib/visibility/audiences';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Keamanan' };

export default async function Page() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const email = viewer.user?.email ?? null;
  const pendingEmail = viewer.user ? await getPendingEmailChange(viewer.user.id) : null;
  // Visibilitas pribadi diatur di sini, bersama kata sandi, email, dan 2FA.
  let current: Record<string, string> = {};
  if (viewer.user && viewer.status === 'active') {
    const { data } = await supabase.from('visibility_rules').select('key,audience').eq('owner_id', viewer.user.id);
    current = Object.fromEntries(((data ?? []) as { key: string; audience: string }[]).map((r) => [r.key, r.audience]));
  }
  const factors = viewer.user ? await supabase.auth.mfa.listFactors() : null;
  const twoFactorEnabled = (factors?.data?.totp ?? []).some((f) => f.status === 'verified');
  const pinStatus = viewer.user ? await supabase.rpc('pin_status') : null;
  const hasPin = pinStatus?.data === true;
  return (
    <ManageNew perm={null} next="/settings/account" icon="lock" title="Keamanan akun" description="Kelola kata sandi, PIN, email yang dipakai untuk masuk, dan siapa yang boleh melihat data profilmu."
      parent={{ label: 'Pengaturan', href: '/settings/profile' }} action={changePassword} fields={accountFields(hasPin)} columns={1} submit="Ganti kata sandi"
      tips={['Minimal 10 karakter; makin panjang makin aman.', 'PIN adalah alternatif kata sandi saat masuk; jangan pakai angka yang mudah ditebak.', 'Setelah kata sandi diganti, perangkat lain akan otomatis keluar.']}
      after={(
        <>
          <TwoFactor enabled={twoFactorEnabled} hasPin={hasPin} />
          <PinSettings enabled={hasPin} />
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
