import type { Metadata } from 'next';
import { ManageEdit } from '@/components/manage-pages';
import { updateTask, deleteTask } from '@/features/tasks/actions';
import { taskFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Ubah tugas' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ManageEdit perm="tasks.manage" next={`/tasks/${id}/edit`} id={id} table="tasks" icon="tasks" title="Ubah tugas"
      parent={{ label: 'Tugas', href: '/tasks' }} deleteTitle="Hapus tugas ini?" consequence="Tugas ini akan hilang dari semua anggota."
      action={updateTask} remove={deleteTask} fieldsFor={taskFields} />
  );
}
