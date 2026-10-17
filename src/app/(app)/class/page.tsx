import type { Metadata } from 'next';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { EmptyState, LinkButton, PageHeader, StorageImage, Tile } from '@/components/ui/primitives';
import { PLATFORM_ICON, PLATFORM_LABEL } from '@/features/fields';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { zoneLabel } from '@/lib/time';
import { getViewer, requireView } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Kelas' };

export default async function ClassPage() {
  if (!(await requireView('page.class_about', '/class'))) return <NoAccess />;
  const supabase = await createClient();
  const [cls, links, viewer] = await Promise.all([
    getClass(), supabase.from('class_links').select('id,platform,label,url').order('created_at').limit(10), getViewer(),
  ]);
  if (!cls) throw new Error('Identitas kelas tidak terbaca');
  const rows = (links.data ?? []) as { id: string; platform: string; label: string | null; url: string }[];
  const cover = cls.cover_path ? (await signMany(supabase, 'class-media', [cls.cover_path])).get(cls.cover_path) : undefined;
  return (
    <>
      <PageHeader icon="book" title={cls.name} description={cls.tagline}
        actions={viewer.can('class.manage') && <LinkButton href="/settings/class" variant="secondary" icon="settings">Pengaturan kelas</LinkButton>} />
      <div className="stack">
        {cover && <div className="card card--flush"><StorageImage src={cover} alt={`Sampul kelas ${cls.name}`} width={1600} height={900} ratio="wide" priority /></div>}
        <div className="dash">
          <section className="card" aria-labelledby="about">
            <div className="card__head"><h2 id="about" className="card__title"><Icon name="info" size={20} />Tentang kelas</h2></div>
            {cls.description
              ? <p className="pre prose">{cls.description}</p>
              : <EmptyState compact icon="book" title="Belum ada deskripsi">Pengelola kelas bisa menambahkannya di pengaturan.</EmptyState>}
          </section>
          <div className="stack">
            <section className="card" aria-labelledby="facts">
              <div className="card__head"><h2 id="facts" className="card__title"><Icon name="flag" size={20} />Info singkat</h2></div>
              <dl className="facts">
                {cls.code && <div className="fact"><dt className="fact__label"><Icon name="at" size={14} />Kode kelas</dt><dd className="fact__value">{cls.code}</dd></div>}
                <div className="fact"><dt className="fact__label"><Icon name="clock" size={14} />Zona waktu</dt><dd className="fact__value">{zoneLabel(cls.timezone)}</dd></div>
              </dl>
            </section>
            {rows.length > 0 && (
              <section aria-labelledby="links">
                <div className="section__head"><h2 id="links" className="section__title"><Icon name="link" size={20} />Tautan kelas</h2></div>
                <ul className="stack stack--sm">
                  {rows.map((l) => (
                    <li key={l.id}>
                      <ExtLink href={l.url} className="card card--link link-card">
                        <Tile icon={PLATFORM_ICON[l.platform] ?? 'link'} size="sm" /><span className="row__title">{l.label ?? PLATFORM_LABEL[l.platform] ?? l.platform}</span>
                      </ExtLink>
                    </li>))}
                </ul>
              </section>)}
          </div>
        </div>
      </div>
    </>
  );
}
