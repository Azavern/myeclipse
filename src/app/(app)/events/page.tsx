import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, DateBadge, EmptyState, LinkButton, PageHeader, Segmented, StorageImage } from '@/components/ui/primitives';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatClock, zoneLabel } from '@/lib/time';
import { getViewer, requireView } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Event' };

type Row = { id: string; title: string; description: string | null; start_at: string; end_at: string; location: string | null; organizer: string | null; cover_path: string | null };
const COLS = 'id,title,description,start_at,end_at,location,organizer,cover_path';

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ when?: string }> }) {
  if (!(await requireView('page.events', '/events'))) return <NoAccess />;
  const canManage = (await getViewer()).can('events.manage');
  const past = (await searchParams).when === 'past';
  const supabase = await createClient();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const [cls, res] = await Promise.all([
    getClass(),
    past
      ? supabase.from('events').select(COLS).lt('end_at', now).order('start_at', { ascending: false }).limit(50)
      : supabase.from('events').select(COLS).gte('end_at', now).order('start_at', { ascending: true }).limit(50),
  ]);
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const rows = (res.data ?? []) as Row[];
  const covers = await signMany(supabase, 'class-media', rows.map((r) => r.cover_path));
  const add = canManage && <LinkButton href="/events/new" icon="plus">Tambah event</LinkButton>;
  return (
    <>
      <PageHeader icon="calendar-days" title="Event" description="Kegiatan, lomba, dan acara kelas." actions={add} />
      <div className="toolbar">
        <Segmented label="Filter event" items={[
          { href: '/events', label: 'Mendatang', active: !past },
          { href: '/events?when=past', label: 'Sudah lewat', active: past },
        ]} />
      </div>
      {rows.length === 0
        ? <EmptyState icon="calendar-days" title={past ? 'Belum ada event yang lewat' : 'Belum ada event mendatang'} action={past ? undefined : add}>Kegiatan kelas akan muncul di sini.</EmptyState>
        : (
          <ul className="event-grid">
            {rows.map((e) => {
              const live = e.start_at <= now && now <= e.end_at;
              return (
                <li key={e.id}>
                  <article className="card card--flush event-card">
                    <StorageImage src={e.cover_path ? covers.get(e.cover_path) : undefined} alt={`Sampul ${e.title}`} width={640} height={360} icon="calendar-days" />
                    <div className="event-card__body">
                      <div className="event-card__row">
                        <DateBadge iso={e.start_at} tz={tz} past={past} />
                        <div className="row__body">
                          <h2 className="h-card"><Link href={`/events/${e.id}`} className="row__title stretch">{e.title}</Link></h2>
                          <div className="meta">
                            <span><Icon name="clock" size={14} />{formatClock(e.start_at, tz)}–{formatClock(e.end_at, tz)} {zoneLabel(tz)}</span>
                            {e.location && <span><Icon name="map-pin" size={14} />{e.location}</span>}
                          </div>
                        </div>
                      </div>
                      {live && <div><Chip tone="success" icon="sparkles">Sedang berlangsung</Chip></div>}
                      {e.description && <p className="muted clamp-2">{e.description}</p>}
                      {canManage && <Link href={`/events/${e.id}/edit`} className="btn btn--ghost btn--sm above event-card__edit"><Icon name="pencil" size={16} />Ubah</Link>}
                    </div>
                  </article>
                </li>);
            })}
          </ul>)}
    </>
  );
}
