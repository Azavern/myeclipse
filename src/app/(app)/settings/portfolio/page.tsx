import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, LinkButton, PageHeader, Tile } from '@/components/ui/primitives';
import { KIND_ICON, KIND_LABEL } from '@/features/fields';
import { createClient } from '@/lib/supabase/server';
import { formatDateOnly } from '@/lib/time';
import { AUDIENCE_LABEL } from '@/lib/visibility/audiences';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Portofolio saya' };

type Item = { id: string; title: string; kind: string; occurred_on: string; visibility: string | null };
const vis = (v: string | null) => (v ? AUDIENCE_LABEL[v] ?? v : 'Ikuti pengaturan bagian');

export default async function PortfolioSettings() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fportfolio');
  if (viewer.status !== 'active') return <NoAccess />;
  const { data } = await (await createClient()).from('portfolio_items')
    .select('id,title,kind,occurred_on,visibility').eq('user_id', viewer.user.id)
    .order('occurred_on', { ascending: false }).limit(50);
  const items = (data ?? []) as Item[];
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
                  <Tile icon={KIND_ICON[i.kind] ?? 'folder'} tone="accent" size="sm" />
                  <div className="row__body">
                    <span className="row__title">{i.title}</span>
                    <div className="meta"><span>{KIND_LABEL[i.kind] ?? i.kind}</span><span>{formatDateOnly(i.occurred_on)}</span><Chip icon="eye">{vis(i.visibility)}</Chip></div>
                  </div>
                  <Link href={`/settings/portfolio/${i.id}/edit`} className="btn btn--secondary btn--sm"><Icon name="pencil" size={16} />Ubah</Link>
                </li>))}
            </ul>
          </section>
        )}
    </>
  );
}
