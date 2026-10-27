import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PreviewThumb } from '@/components/link-preview';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, LinkButton, PageHeader } from '@/components/ui/primitives';
import { KIND_ICON, KIND_LABEL } from '@/features/fields';
import { previewUrl } from '@/lib/preview/meta';
import { linkPreviews } from '@/lib/preview/server';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatDateOnly } from '@/lib/time';
import { AUDIENCE_LABEL } from '@/lib/visibility/audiences';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Portofolio saya' };

type Item = { id: string; title: string; kind: string; occurred_on: string; visibility: string | null; url: string | null; media_path: string | null };
const vis = (v: string | null) => (v ? AUDIENCE_LABEL[v] ?? v : 'Ikuti pengaturan bagian');

export default async function PortfolioSettings() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fportfolio');
  if (viewer.status !== 'active') return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase.from('portfolio_items')
    .select('id,title,kind,occurred_on,visibility,url,media_path').eq('user_id', viewer.user.id)
    .order('occurred_on', { ascending: false }).limit(50);
  const items = (data ?? []) as Item[];
  // Thumbnail = gambar unggahan sendiri, selain itu pratinjau tautan (hanya item tanpa gambar yang diambil).
  const [media, previews] = await Promise.all([
    signMany(supabase, 'member-media', items.map((i) => i.media_path)),
    linkPreviews(items.filter((i) => !i.media_path).map((i) => i.url)),
  ]);
  return (
    <>
      <PageHeader icon="briefcase" title="Portofolio saya" description="Proyek, prestasi, dan karya yang tampil di profilmu."
        actions={<LinkButton href="/settings/portfolio/new" icon="plus">Tambah</LinkButton>} />
      {items.length === 0
        ? <EmptyState compact icon="briefcase" title="Belum ada portofolio"
          action={<LinkButton href="/settings/portfolio/new" variant="secondary" icon="plus">Tambah item pertama</LinkButton>}>
          Tambahkan proyek atau pencapaian agar temanmu bisa mengenalmu.
        </EmptyState>
        : (
          <section className="card card--flush" aria-labelledby="h-pf">
            <div className="card__head card__head--pad">
              <h2 id="h-pf" className="card__title"><Icon name="briefcase" size={20} />Daftar portofolio</h2>
              <span className="muted">{items.length} item</span>
            </div>
            <ul className="rows">
              {items.map((i) => (
                <li key={i.id} className="row">
                  <PreviewThumb icon={KIND_ICON[i.kind] ?? 'folder'}
                    src={i.media_path ? media.get(i.media_path) : i.url ? previews.get(i.url)?.image : null} />
                  <div className="row__body">
                    <span className="row__title">{i.title}</span>
                    <div className="meta"><span>{KIND_LABEL[i.kind] ?? i.kind}</span><span>{formatDateOnly(i.occurred_on)}</span><Chip icon="eye">{vis(i.visibility)}</Chip>
                      {i.url && <span><Icon name="globe" size={14} />{previews.get(i.url)?.site ?? previewUrl(i.url)?.host}</span>}</div>
                  </div>
                  <Link href={`/settings/portfolio/${i.id}/edit`} className="btn btn--secondary btn--sm"><Icon name="pencil" size={16} />Ubah</Link>
                </li>))}
            </ul>
          </section>
        )}
    </>
  );
}
