import type { Metadata } from 'next';
import { ManageEdit } from '@/components/manage-pages';
import { updateSchedule, deleteSchedule } from '@/features/schedule/actions';
import { scheduleFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Ubah jadwal' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ManageEdit perm="schedule.manage" next={`/schedule/${id}/edit`} id={id} table="schedules" icon="calendar" title="Ubah jadwal"
      parent={{ label: 'Jadwal', href: '/schedule' }} deleteTitle="Hapus jadwal ini?" consequence="Jadwal ini akan hilang dari semua anggota."
      action={updateSchedule} remove={deleteSchedule} fieldsFor={scheduleFields} />
  );
}
