import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Avatar, Chip, Crumbs, EmptyState, StorageImage } from '@/components/ui/primitives';
import { KIND_ICON, KIND_LABEL, PLATFORM_ICON, PLATFORM_LABEL } from '@/features/fields';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatDateOnly } from '@/lib/time';
import { getViewer, requireView } from '@/lib/visibility/server';

type Profile = { user_id: string; full_name: string; nickname: string | null; bio: string | null; role_name: string; avatar_path: string | null };
type Item = { id: string; title: string; description: string | null; occurred_on: string; url: string | null; kind: string; media_path: string | null };
type Social = { id: string; platform: string; label: string | null; url: string };

export const metadata: Metadata = { title: 'Profil anggota' };

export default async function MemberPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!(await requireView('page.members', `/members/${username}`))) return <NoAccess />;
  const supabase = await createClient();
  const [res, viewer] = await Promise.all([supabase.from('member_profile_v')
    .select('user_id,full_name,nickname,bio,role_name,avatar_path').eq('username', username).maybeSingle(), getViewer()]);
  const p = res.data as Profile | null;
  if (res.error || !p) notFound(); // seragam untuk tak ada / tak terlihat
  // RLS pada kedua tabel ini sudah menyaring item yang tak boleh dilihat viewer.
  const [pf, so] = await Promise.all([
    supabase.from('portfolio_items').select('id,title,description,occurred_on,url,kind,media_path').eq('user_id', p.user_id)
      .order('occurred_on', { ascending: false }).limit(50),
    supabase.from('social_links').select('id,platform,label,url').eq('user_id', p.user_id).limit(10),
  ]);
  const items = (pf.data ?? []) as Item[];
  const socials = (so.data ?? []) as Social[];
  const media = await signMany(supabase, 'member-media', [p.avatar_path, ...items.map((i) => i.media_path)]);
  return (
    <>
      <Crumbs items={[{ label: 'Anggota', href: '/members' }, { label: p.full_name }]} />
      <div className="stack">
        <section className="card profile" aria-labelledby="member-name">
          <div className="profile__band">
            <div className="profile__identity">
              <Chip className="chip--onhero" icon="user">{p.role_name}</Chip>
              {p.nickname && <Chip className="chip--onhero" icon="at">{p.nickname}</Chip>}
            </div>
          </div>
          <div className="profile__body">
            <Avatar name={p.full_name} src={p.avatar_path ? media.get(p.avatar_path) : undefined} size="xl" className="profile__avatar" />
            <div className="stack stack--sm">
              <h1 id="member-name" className="profile__name">{p.full_name}</h1>
            </div>
            {p.bio && <p className="pre prose">{p.bio}</p>}
            {socials.length > 0 && (
              <ul className="cluster" aria-label="Tautan sosial">
                {socials.map((s) => (
                  <li key={s.id}>
                    <ExtLink href={s.url} className="chip chip--outline"><Icon name={PLATFORM_ICON[s.platform] ?? 'link'} size={14} />{s.label ?? PLATFORM_LABEL[s.platform] ?? s.platform}</ExtLink>
                  </li>))}
              </ul>)}
            {viewer.user?.id === p.user_id && <div><Link href="/settings/profile" className="btn btn--secondary btn--sm"><Icon name="pencil" size={16} />Ubah profilku</Link></div>}
          </div>
        </section>
        <section aria-labelledby="portfolio">
          <div className="section__head"><h2 id="portfolio" className="section__title"><Icon name="briefcase" size={20} />Portofolio</h2></div>
          {items.length === 0
            ? <EmptyState compact icon="briefcase" title="Belum ada portofolio yang ditampilkan">Proyek dan pencapaian akan muncul di sini.</EmptyState>
            : (
              <ul className="portfolio-grid">
                {items.map((i) => (
                  <li key={i.id}>
                    <article className="card card--flush portfolio-card">
                      <StorageImage src={i.media_path ? media.get(i.media_path) : undefined} alt={`Gambar ${i.title}`} width={640} height={360} icon={KIND_ICON[i.kind] ?? 'folder'} />
                      <div className="portfolio-card__body">
                        <div className="cluster">
                          <Chip tone="accent" icon={KIND_ICON[i.kind] ?? 'folder'}>{KIND_LABEL[i.kind] ?? i.kind}</Chip>
                          <span className="muted nums">{formatDateOnly(i.occurred_on)}</span>
                        </div>
                        <h3>{i.title}</h3>
                        {i.description && <p className="muted pre clamp-3">{i.description}</p>}
                        {i.url && <p><ExtLink href={i.url}>Lihat karya</ExtLink></p>}
                      </div>
                    </article>
                  </li>))}
              </ul>)}
        </section>
      </div>
    </>
  );
}
