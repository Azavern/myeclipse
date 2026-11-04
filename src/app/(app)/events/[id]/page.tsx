import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, LinkButton, PageHeader, StorageImage } from '@/components/ui/primitives';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatRange, relativeTime } from '@/lib/time';
import { getViewer, requireView } from '@/lib/visibility/server';

type Row = { title: string; description: string | null; start_at: string; end_at: string;
  location: string | null; organizer: string | null; url: string | null; cover_path: string | null };

export const metadata: Metadata = { title: 'Detail event' };

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireView('page.events', `/events/${id}`))) return <NoAccess />;
  const supabase = await createClient();
  const [cls, res, viewer] = await Promise.all([getClass(), supabase.from('events')
    .select('title,description,start_at,end_at,location,organizer,url,cover_path').eq('id', id).maybeSingle(), getViewer()]);
  const e = res.data as Row | null;
  if (res.error || !e) notFound(); // id tak ada, tak valid, atau tak terlihat: respons sama
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const cover = e.cover_path ? (await signMany(supabase, 'class-media', [e.cover_path])).get(e.cover_path) : undefined;
  const photoResult = await supabase.from('event_photos')
    .select('id,path').eq('event_id', id).order('position').order('created_at');
  const photoRows = (photoResult.data ?? []) as { id: string; path: string }[];
  const photoUrls = await signMany(supabase, 'class-media', photoRows.map((photo) => photo.path));
  const now = new Date();
  const ended = new Date(e.end_at) < now;
  const live = !ended && new Date(e.start_at) <= now;
  return (
    <>
      <PageHeader crumbs={[{ label: 'Event', href: '/events' }, { label: e.title }]} icon="calendar-days" title={e.title}
        description={<span className="cluster">{ended ? <Chip>Sudah lewat</Chip> : live ? <Chip tone="success" icon="sparkles">Sedang berlangsung</Chip> : <Chip tone="brand" icon="clock">{relativeTime(e.start_at, now)}</Chip>}</span>}
        actions={viewer.can('events.manage') && <LinkButton href={`/events/${id}/edit`} variant="secondary" icon="pencil">Ubah</LinkButton>} />
      <div className="stack">
        {cover && <div className="card card--flush"><StorageImage src={cover} alt={`Sampul ${e.title}`} width={1600} height={900} ratio="wide" priority /></div>}
        {photoRows.length > 0 && (
          <section className="card" aria-labelledby="photos">
            <div className="card__head">
              <h2 id="photos" className="card__title"><Icon name="image" size={20} />Foto event</h2>
              <Chip tone="outline">{photoRows.length} foto</Chip>
            </div>
            <ul className="photo-grid">
              {photoRows.map((photo, index) => (
                <li key={photo.id} className="photo-tile">
                  <StorageImage src={photoUrls.get(photo.path)} alt={`Foto ${index + 1} ${e.title}`} width={1200} height={800} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="dash">
          <section className="card" aria-labelledby="desc">
            <div className="card__head"><h2 id="desc" className="card__title"><Icon name="info" size={20} />Tentang event</h2></div>
            {e.description ? <p className="pre prose">{e.description}</p> : <p className="muted">Belum ada deskripsi untuk event ini.</p>}
          </section>
          <section className="card" aria-labelledby="info">
            <div className="card__head"><h2 id="info" className="card__title"><Icon name="calendar-days" size={20} />Detail</h2></div>
            <dl className="stack stack--sm">
              <div className="fact"><dt className="fact__label"><Icon name="clock" size={14} />Waktu</dt><dd className="fact__value">{formatRange(e.start_at, e.end_at, tz)}</dd></div>
              {e.location && <div className="fact"><dt className="fact__label"><Icon name="map-pin" size={14} />Lokasi</dt><dd className="fact__value">{e.location}</dd></div>}
              {e.organizer && <div className="fact"><dt className="fact__label"><Icon name="users" size={14} />Penyelenggara</dt><dd className="fact__value">{e.organizer}</dd></div>}
              {e.url && <div className="fact"><dt className="fact__label"><Icon name="link" size={14} />Tautan</dt><dd className="fact__value"><ExtLink href={e.url}>Buka tautan terkait</ExtLink></dd></div>}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
