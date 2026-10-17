import type { Metadata } from 'next';
import { NoAccess } from '@/components/states';
import { EmptyState, LinkButton, PageHeader, Segmented } from '@/components/ui/primitives';
import { TaskRow } from '@/features/tasks/task-row';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { getViewer, requireView } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Tugas' };

type Status = 'active' | 'completed' | 'archived';
type Row = { id: string; title: string; deadline: string; status: Status; course: string | null };
const TABS: [Status, string][] = [['active', 'Aktif'], ['completed', 'Selesai'], ['archived', 'Arsip']];
const EMPTY: Record<Status, string> = { active: 'Tidak ada tugas aktif', completed: 'Belum ada tugas yang selesai', archived: 'Arsip tugas kosong' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await requireView('page.tasks', '/tasks'))) return <NoAccess />;
  const canManage = (await getViewer()).can('tasks.manage');
  const raw = (await searchParams).status;
  const status: Status = raw === 'completed' || raw === 'archived' ? raw : 'active';
  const supabase = await createClient();
  const [cls, res] = await Promise.all([getClass(), supabase.from('tasks')
    .select('id,title,deadline,status,course').eq('status', status)
    .order('deadline', { ascending: status === 'active' }).limit(100)]);
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const now = new Date();
  const rows = (res.data ?? []) as Row[];
  const add = canManage && <LinkButton href="/tasks/new" icon="plus">Tambah tugas</LinkButton>;
  return (
    <>
      <PageHeader icon="tasks" title="Tugas" description="Tugas dan tenggat kelas, diurutkan dari yang paling dekat." actions={add} />
      <div className="toolbar">
        <Segmented label="Filter tugas" items={TABS.map(([s, label]) => ({ href: `/tasks?status=${s}`, label, active: s === status }))} />
      </div>
      {rows.length === 0
        ? <EmptyState icon="tasks" title={EMPTY[status]} action={status === 'active' ? add : undefined}>Tugas baru akan muncul di sini.</EmptyState>
        : <div className="card card--flush"><ul className="rows">{rows.map((t) => <TaskRow key={t.id} t={t} tz={tz} now={now} editable={canManage} />)}</ul></div>}
    </>
  );
}
