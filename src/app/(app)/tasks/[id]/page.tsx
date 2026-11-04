import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { btnClass, LinkButton, Notice, PageHeader, TaskStatusChip } from '@/components/ui/primitives';
import { approveTask } from '@/features/tasks/actions';
import { getClass } from '@/lib/class';
import { taskDisplayStatus } from '@/lib/tasks';
import { createClient } from '@/lib/supabase/server';
import { formatWhen, relativeTime } from '@/lib/time';
import { getViewer, requireView } from '@/lib/visibility/server';

type Row = { title: string; description: string | null; deadline: string; target: string; url: string | null; status: 'active' | 'completed' | 'archived'; course: string | null; approval: 'pending' | 'approved'; created_by: string | null };

export const metadata: Metadata = { title: 'Detail tugas' };

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireView('page.tasks', `/tasks/${id}`))) return <NoAccess />;
  const supabase = await createClient();
  const [cls, res, viewer, roleAccess] = await Promise.all([getClass(), supabase.from('tasks')
    .select('title,description,deadline,target,url,status,course,approval,created_by').eq('id', id).maybeSingle(), getViewer(),
    supabase.rpc('has_role_access', { p_permission: 'tasks.manage' })]);
  const t = res.data as Row | null;
  if (res.error || !t) notFound(); // id tak ada, tak valid, atau tak terlihat: respons sama
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const now = new Date();
  // Persetujuan hanya untuk Ketua; akses `tasks.manage` per anggota tidak
  // memberi wewenang menyetujui tugas anggota lain.
  const canApprove = viewer.can('class.manage');
  const canEdit = roleAccess.data === true || (viewer.can('tasks.manage') && t.created_by === viewer.user?.id);
  const d = taskDisplayStatus({ status: t.status, deadline: new Date(t.deadline) }, now);
  return (
    <>
      <PageHeader crumbs={[{ label: 'Tugas', href: '/tasks' }, { label: t.title }]} icon="tasks" title={t.title} description={t.course ?? 'Tanpa mata kuliah'}
        actions={(canApprove || canEdit) ? (
          <>
            {canApprove && t.approval === 'pending' && (
              <form action={approveTask}>
                <input type="hidden" name="id" value={id} />
                <button type="submit" className={btnClass({ variant: 'primary' })}>Setujui</button>
              </form>
            )}
            {canEdit && <LinkButton href={`/tasks/${id}/edit`} variant="secondary" icon="pencil">Ubah</LinkButton>}
          </>
        ) : undefined} />
      {t.approval === 'pending' && (
        <Notice tone="warning">
          Tugas ini menunggu persetujuan Ketua. Anggota lain baru bisa melihatnya setelah disetujui.
        </Notice>
      )}
      <div className="stack">
        <section className="card" aria-label="Ringkasan tugas">
          <dl className="facts">
            <div className="fact"><dt className="fact__label"><Icon name="flag" size={14} />Status</dt><dd className="fact__value"><TaskStatusChip status={d} /></dd></div>
            <div className="fact"><dt className="fact__label"><Icon name="clock" size={14} />Tenggat</dt>
              <dd className="fact__value">{formatWhen(t.deadline, tz)}{(d === 'active' || d === 'due_soon' || d === 'overdue') && <span className="muted"> · {relativeTime(t.deadline, now)}</span>}</dd></div>
            <div className="fact"><dt className="fact__label"><Icon name="book" size={14} />Mata kuliah</dt><dd className="fact__value">{t.course ?? '—'}</dd></div>
            <div className="fact"><dt className="fact__label"><Icon name="users" size={14} />Untuk</dt><dd className="fact__value">{t.target}</dd></div>
          </dl>
        </section>
        {t.description && (
          <section className="card" aria-labelledby="desc">
            <div className="card__head"><h2 id="desc" className="card__title"><Icon name="info" size={20} />Keterangan</h2></div>
            <p className="pre prose">{t.description}</p>
          </section>)}
        {t.url && (
          <section className="card" aria-labelledby="ref">
            <div className="card__head"><h2 id="ref" className="card__title"><Icon name="link" size={20} />Tautan terkait</h2></div>
            <ExtLink href={t.url} className="btn btn--secondary">Buka tautan</ExtLink>
          </section>)}
      </div>
    </>
  );
}
