import type { Metadata } from 'next';
import { ImageForm } from '@/components/image-form';
import { ManageEdit } from '@/components/manage-pages';
import { removeEventCover, updateEvent, deleteEvent, uploadEventCover } from '@/features/events/actions';
import { eventFields } from '@/features/fields';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Ubah event' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ManageEdit perm="events.manage" next={`/events/${id}/edit`} id={id} table="events" icon="calendar-days" title="Ubah event"
      parent={{ label: 'Event', href: '/events' }} deleteTitle="Hapus event ini?" consequence="Event ini akan hilang dari daftar dan Beranda."
      action={updateEvent} remove={deleteEvent} fieldsFor={eventFields} extraCols={['cover_path']}
      after={async (row) => {
        const path = typeof row.cover_path === 'string' ? row.cover_path : null;
        const url = path ? (await signMany(await createClient(), 'class-media', [path])).get(path) : undefined;
        return (
          <ImageForm id="cover" title="Sampul event" description="Gambar lebar yang tampil di daftar dan halaman event." variant="wide" url={url}
            uploadAction={uploadEventCover} removeAction={removeEventCover} hidden={{ id }} spec={{ crop: [1600, 900] }}
            removeConsequence="Event kembali memakai latar bawaan." />
        );
      }} />
  );
}
