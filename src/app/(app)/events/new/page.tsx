import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { createEvent } from '@/features/events/actions';
import { eventFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Tambah event' };

export default function Page() {
  return (
    <ManageNew perm="events.manage" next="/events/new" icon="calendar-days" title="Tambah event" parent={{ label: 'Event', href: '/events' }}
      action={createEvent} fields={eventFields(null, 'Asia/Jakarta')}
      tips={['Sampul bisa ditambahkan setelah event tersimpan, lewat halaman Ubah.', 'Waktu mengikuti zona waktu kelas.', 'Event tampil di Beranda sampai waktu selesainya lewat.']} />
  );
}
