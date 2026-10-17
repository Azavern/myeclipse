import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { createTask } from '@/features/tasks/actions';
import { taskFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Tambah tugas' };

export default function Page() {
  return (
    <ManageNew perm="tasks.manage" next="/tasks/new" icon="tasks" title="Tambah tugas" parent={{ label: 'Tugas', href: '/tasks' }}
      action={createTask} fields={taskFields(null, 'Asia/Jakarta')}
      tips={['Tugas dengan tenggat dalam 3 hari otomatis ditandai "Segera berakhir".', 'Tandai Selesai atau Diarsipkan agar tidak muncul di daftar aktif.', 'Tautan hanya boleh berupa alamat https.']} />
  );
}
