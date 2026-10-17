import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { TASK_UI, TaskStatusChip, Tile } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { taskDisplayStatus } from '@/lib/tasks';
import { formatWhen, relativeTime } from '@/lib/time';

export type TaskItem = { id: string; title: string; deadline: string; course: string | null; status?: 'active' | 'completed' | 'archived' };

// Satu baris tugas: ikon status, judul (seluruh baris bisa diklik), mata kuliah, tenggat, dan chip status.
// Status dihitung dari `now` yang disuntikkan, jadi baris ini murni dan bisa dites.
export function TaskRow({ t, tz, now, editable }: { t: TaskItem; tz: string; now: Date; editable?: boolean }) {
  const d = taskDisplayStatus({ status: t.status ?? 'active', deadline: new Date(t.deadline) }, now);
  const ui = TASK_UI[d];
  const open = d === 'active' || d === 'due_soon' || d === 'overdue';
  return (
    <li className={cx('task', (d === 'overdue' || d === 'due_soon') && `task--${d}`)}>
      <Tile icon={ui.icon} tone={ui.tone} size="sm" />
      <div className="row__body">
        <Link href={`/tasks/${t.id}`} className="row__title stretch">{t.title}</Link>
        <div className="meta">
          <span><Icon name="book" size={14} />{t.course ?? 'Tanpa mata kuliah'}</span>
          <span><Icon name="clock" size={14} />{formatWhen(t.deadline, tz)}</span>
        </div>
      </div>
      <div className="task__side">
        <TaskStatusChip status={d} />
        {open && <span className="muted nums">{relativeTime(t.deadline, now)}</span>}
        {editable && <Link href={`/tasks/${t.id}/edit`} className="btn btn--ghost btn--sm above"><Icon name="pencil" size={16} />Ubah</Link>}
      </div>
    </li>
  );
}
