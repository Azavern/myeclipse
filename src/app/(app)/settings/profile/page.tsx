import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EntityForm } from '@/components/entity-form';
import { ImageForm } from '@/components/image-form';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, LinkButton, Notice, PageHeader, Tile } from '@/components/ui/primitives';
import { KIND_ICON, KIND_LABEL, PLATFORM_ICON, PLATFORM_LABEL, profileFields, visibilityFields, type Row } from '@/features/fields';
import { removeAvatar, saveMyVisibility, updateProfile, uploadAvatar } from '@/features/profile/actions';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatDateOnly } from '@/lib/time';
import { AUDIENCE_LABEL, MEMBER_KEYS } from '@/lib/visibility/audiences';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Profil saya' };

type Item = { id: string; title: string; kind: string; occurred_on: string; visibility: string | null };
type Soc = { id: string; platform: string; label: string | null; visibility: string | null };
type Me = { username: string; role_name: string; avatar_path: string | null };
const vis = (v: string | null) => (v ? AUDIENCE_LABEL[v] ?? v : 'Ikuti pengaturan bagian');

export default async function ProfileSettings({ searchParams }: { searchParams: Promise<{ onboarding?: string }> }) {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fprofile');
  if (viewer.status !== 'active') return <NoAccess />;
  const supabase = await createClient();
  const me = viewer.user.id;
  const [prof, rules, pf, so, v, sp] = await Promise.all([
    supabase.from('member_profiles').select('full_name,nickname,bio').eq('user_id', me).maybeSingle(),
    supabase.from('visibility_rules').select('key,audience').eq('owner_id', me),
    supabase.from('portfolio_items').select('id,title,kind,occurred_on,visibility').eq('user_id', me).order('occurred_on', { ascending: false }).limit(50),
    supabase.from('social_links').select('id,platform,label,visibility').eq('user_id', me).limit(10),
    supabase.from('member_profile_v').select('username,role_name,avatar_path').eq('user_id', me).maybeSingle(),
    searchParams,
  ]);
  const current = Object.fromEntries(((rules.data ?? []) as { key: string; audience: string }[]).map((r) => [r.key, r.audience]));
  const items = (pf.data ?? []) as Item[];
  const socials = (so.data ?? []) as Soc[];
  const mine = v.data as Me | null;
  const avatar = mine?.avatar_path ? (await signMany(supabase, 'member-media', [mine.avatar_path])).get(mine.avatar_path) : undefined;
  const fullName = String((prof.data as Row | null)?.full_name ?? 'Profil');
  return (
    <>
      <PageHeader icon="user" title="Profil saya" description="Atur bagaimana kamu tampil di kelas."
        actions={mine && <LinkButton href={`/members/${mine.username}`} variant="secondary" icon="eye">Lihat profilku</LinkButton>} />
      <div className="stack">
        {sp.onboarding === '1' && <Notice tone="success" role="status">Selamat datang! Lengkapi profilmu di bawah. Semua bagian opsional.</Notice>}
        <ImageForm id="avatar" title="Foto profil" description="Tampil di daftar anggota dan profilmu." variant="avatar" name={fullName} url={avatar}
          uploadAction={uploadAvatar} removeAction={removeAvatar} spec={{ crop: [512, 512] }} removeConsequence="Fotomu diganti dengan inisial namamu." />
        <section className="card" aria-labelledby="h-data">
          <div className="card__head"><h2 id="h-data" className="card__title"><Icon name="user" size={20} />Data diri</h2></div>
          <EntityForm action={updateProfile} fields={profileFields(prof.data as Row | null)} submit="Simpan profil" />
        </section>
        <section className="card" aria-labelledby="h-vis">
          <div className="card__head">
            <div>
              <h2 id="h-vis" className="card__title"><Icon name="eye" size={20} />Siapa yang boleh melihat</h2>
              <p className="card__desc">Pilihanmu tidak pernah lebih terbuka dari halaman Anggota. Awalnya hanya anggota kelas yang melihat datamu.</p>
            </div>
          </div>
          <EntityForm action={saveMyVisibility} fields={visibilityFields(MEMBER_KEYS, current)} submit="Simpan visibilitas" />
        </section>
        <section className="card card--flush" aria-labelledby="h-pf">
          <div className="card__head card__head--pad">
            <h2 id="h-pf" className="card__title"><Icon name="briefcase" size={20} />Portofolio</h2>
            <LinkButton href="/settings/portfolio/new" size="sm" icon="plus">Tambah</LinkButton>
          </div>
          {items.length === 0
            ? <EmptyState compact icon="briefcase" title="Belum ada portofolio">Tambahkan proyek atau pencapaian agar temanmu bisa mengenalmu.</EmptyState>
            : (
              <ul className="rows">
                {items.map((i) => (
                  <li key={i.id} className="row">
                    <Tile icon={KIND_ICON[i.kind] ?? 'folder'} tone="accent" size="sm" />
                    <div className="row__body">
                      <span className="row__title">{i.title}</span>
                      <div className="meta"><span>{KIND_LABEL[i.kind] ?? i.kind}</span><span>{formatDateOnly(i.occurred_on)}</span><Chip icon="eye">{vis(i.visibility)}</Chip></div>
                    </div>
                    <Link href={`/settings/portfolio/${i.id}/edit`} className="btn btn--secondary btn--sm"><Icon name="pencil" size={16} />Ubah</Link>
                  </li>))}
              </ul>)}
        </section>
        <section className="card card--flush" aria-labelledby="h-so">
          <div className="card__head card__head--pad">
            <h2 id="h-so" className="card__title"><Icon name="link" size={20} />Tautan sosial</h2>
            <LinkButton href="/settings/social/new" size="sm" icon="plus">Tambah</LinkButton>
          </div>
          {socials.length === 0
            ? <EmptyState compact icon="link" title="Belum ada tautan sosial">Bagikan Instagram, LinkedIn, GitHub, atau situsmu.</EmptyState>
            : (
              <ul className="rows">
                {socials.map((s) => (
                  <li key={s.id} className="row">
                    <Tile icon={PLATFORM_ICON[s.platform] ?? 'link'} size="sm" />
                    <div className="row__body">
                      <span className="row__title">{s.label ?? PLATFORM_LABEL[s.platform] ?? s.platform}</span>
                      <div className="meta"><Chip icon="eye">{vis(s.visibility)}</Chip></div>
                    </div>
                    <Link href={`/settings/social/${s.id}/edit`} className="btn btn--secondary btn--sm"><Icon name="pencil" size={16} />Ubah</Link>
                  </li>))}
              </ul>)}
        </section>
      </div>
    </>
  );
}
