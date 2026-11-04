import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ManageEdit } from '@/components/manage-pages';
import { NoAccess } from '@/components/states';
import { deleteEvent, updateEvent } from '@/features/events/actions';
import { EventPhotos } from '@/features/events/photo-manager';
import { eventFields } from '@/features/fields';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Ubah event' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const viewer = await getViewer();
  const [eventResult, roleAccess] = await Promise.all([
    supabase.from('events').select('created_by').eq('id', id).maybeSingle(),
    supabase.rpc('has_role_access', { p_permission: 'events.manage' }),
  ]);
  if (!eventResult.data) notFound();

  // Akses per anggota hanya untuk event buatannya sendiri; Ketua dan jabatan
  // yang diberi events.manage boleh mengubah event siapa pun. RLS menegakkan
  // aturan yang sama, jadi pemeriksaan ini hanya menjaga tampilan.
  const owner = (eventResult.data as { created_by: string | null }).created_by;
  if (owner !== viewer.user?.id && roleAccess.data !== true) return <NoAccess />;

  return (
    <ManageEdit perm="events.manage" next={`/events/${id}/edit`} id={id} table="events" icon="calendar-days" title="Ubah event"
      parent={{ label: 'Event', href: '/events' }} deleteTitle="Hapus event ini?" consequence="Event, seluruh fotonya, dan thumbnail-nya akan dihapus."
      action={updateEvent} remove={deleteEvent} fieldsFor={eventFields} extraCols={['cover_path']}
      after={async (row) => {
        const { data } = await supabase.from('event_photos')
          .select('id,path').eq('event_id', id).order('position').order('created_at');
        const photos = (data ?? []) as { id: string; path: string }[];
        const urls = await signMany(supabase, 'class-media', photos.map((photo) => photo.path));
        const coverPath = typeof row.cover_path === 'string' ? row.cover_path : null;
        return (
          <EventPhotos eventId={id} coverUrl={coverPath ? urls.get(coverPath) ?? null : null}
            photos={photos.map((photo) => ({ id: photo.id, url: urls.get(photo.path) ?? '' }))
              .filter((photo) => photo.url.length > 0)} />
        );
      }} />
  );
}
