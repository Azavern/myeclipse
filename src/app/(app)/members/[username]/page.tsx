import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LinkPreviewMedia } from '@/components/link-preview';
import { PortfolioText } from '@/components/portfolio-text';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Avatar, Chip, Crumbs, EmptyState } from '@/components/ui/primitives';
import { KIND_ICON, KIND_LABEL, PLATFORM_ICON, PLATFORM_LABEL } from '@/features/fields';
import { displayOrigin } from '@/lib/preview/meta';
import { linkPreviews } from '@/lib/preview/server';
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
  // Gambar yang sudah diunggah selalu menang. Pratinjau tautan hanya diambil untuk item yang gambarnya
  // benar-benar tidak tersedia (belum diunggah, atau objeknya gagal ditandatangani), jadi tidak ada
  // permintaan ke situs luar saat gambarnya ada.
  const previews = await linkPreviews(
    items.filter((i) => i.url && !(i.media_path && media.get(i.media_path))).map((i) => i.url),
  );
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
                {items.map((i) => {
                  const own = i.media_path ? media.get(i.media_path) : undefined;
                  const pv = i.url ? previews.get(i.url) : undefined;
                  // Seluruh kartu menjadi tautan lewat judul ber-lapis `.stretch` (tab baru); tombol
                  // "Baca selengkapnya" duduk di atas lapisan itu. Item tanpa `url` tetap kartu biasa.
                  return (
                    <li key={i.id}>
                      <article className="card card--flush portfolio-card">
                        <LinkPreviewMedia src={own ?? pv?.image} icon={KIND_ICON[i.kind] ?? 'folder'}
                          site={pv?.site ?? null} label={i.url ? displayOrigin(i.url) : null}
                          alt={own ? `Gambar ${i.title}` : ''} />
                        <div className="portfolio-card__body">
                          <div className="cluster">
                            <Chip tone="accent" icon={KIND_ICON[i.kind] ?? 'folder'}>{KIND_LABEL[i.kind] ?? i.kind}</Chip>
                            <span className="muted nums">{formatDateOnly(i.occurred_on)}</span>
                          </div>
                          <PortfolioText title={i.title} text={i.description} href={i.url} />
                          {i.url && <p className="portfolio-card__go">Lihat karya<Icon name="external-link" size={14} /><span className="sr-only"> (dibuka di tab baru)</span></p>}
                        </div>
                      </article>
                    </li>);
                })}
              </ul>)}
        </section>
      </div>
    </>
  );
}
