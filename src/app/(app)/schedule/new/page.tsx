import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { createSchedule } from '@/features/schedule/actions';
import { scheduleFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Tambah jadwal' };

export default function Page() {
  return (
    <ManageNew perm="schedule.manage" next="/schedule/new" icon="calendar" title="Tambah jadwal" parent={{ label: 'Jadwal', href: '/schedule' }}
      action={createSchedule} fields={scheduleFields(null, 'Asia/Jakarta')}
      tips={['Jadwal berulang setiap pekan sepanjang semester.', 'Format semester: 2026/2027 Ganjil atau Genap.', 'Jam ditulis dalam zona waktu kelas.']} />
  );
}
