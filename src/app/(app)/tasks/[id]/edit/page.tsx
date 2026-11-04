import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ManageEdit } from '@/components/manage-pages';
import { NoAccess } from '@/components/states';
import { updateTask, deleteTask } from '@/features/tasks/actions';
import { taskFields } from '@/features/fields';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Ubah tugas' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [taskResult, roleAccess, viewer] = await Promise.all([
    supabase.from('tasks').select('created_by').eq('id', id).maybeSingle(),
    supabase.rpc('has_role_access', { p_permission: 'tasks.manage' }),
    getViewer(),
  ]);
  if (!taskResult.data) notFound();

  // Akses per anggota hanya untuk tugas buatannya sendiri; jabatan dengan
  // `tasks.manage` boleh mengubah semua tugas. RLS menegakkan aturan yang sama.
  const owner = (taskResult.data as { created_by: string | null }).created_by;
  if (owner !== viewer.user?.id && roleAccess.data !== true) return <NoAccess />;

  return (
    <ManageEdit perm="tasks.manage" next={`/tasks/${id}/edit`} id={id} table="tasks" icon="tasks" title="Ubah tugas"
      parent={{ label: 'Tugas', href: '/tasks' }} deleteTitle="Hapus tugas ini?" consequence="Tugas ini akan hilang dari semua anggota."
      action={updateTask} remove={deleteTask} fieldsFor={taskFields} />
  );
}
