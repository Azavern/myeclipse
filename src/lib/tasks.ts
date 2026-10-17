export const DUE_SOON_HOURS = 72;
export type TaskDisplayStatus = 'completed' | 'archived' | 'overdue' | 'due_soon' | 'active';

// Fungsi murni: `now` disuntikkan agar bisa dites (blueprint §19, A-09).
export function taskDisplayStatus(
  t: { status: 'active' | 'completed' | 'archived'; deadline: Date }, now: Date,
): TaskDisplayStatus {
  if (t.status === 'completed') return 'completed';
  if (t.status === 'archived') return 'archived';
  if (t.deadline < now) return 'overdue';
  if (t.deadline.getTime() - now.getTime() <= DUE_SOON_HOURS * 3_600_000) return 'due_soon';
  return 'active';
}
export const TASK_LABEL: Record<TaskDisplayStatus, string> = {
  completed: 'Selesai', archived: 'Diarsipkan', overdue: 'Lewat tenggat', due_soon: 'Segera berakhir', active: 'Aktif',
};
