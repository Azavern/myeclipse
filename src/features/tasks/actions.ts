'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { runDelete, runSave } from '@/lib/crud';
import { failState, type FormState } from '@/lib/form-state';
import { localToUtc } from '@/lib/time';
import { idOf, localDateTime, optText, optUrl, reqText } from '@/lib/zod-fields';

const schema = z.object({
  title: reqText(120, 'Judul'), description: optText(2000), deadline: localDateTime,
  target: reqText(80, 'Target'), course: reqText(80, 'Mata kuliah'), url: optUrl,
  status: z.enum(['active', 'completed', 'archived']).default('active'),
});
type D = z.infer<typeof schema>;
const base = {
  perm: 'tasks.manage', table: 'tasks', schema, paths: ['/tasks', '/schedule', '/'], to: '/tasks',
  build: (d: D, tz: string) => ({ ...d, deadline: localToUtc(d.deadline, tz) }),
};

export async function createTask(_p: FormState, fd: FormData) { return runSave({ ...base, fd }); }
export async function updateTask(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  return id ? runSave({ ...base, fd, id }) : failState('Data tidak ditemukan.', fd);
}
export async function deleteTask(_p: FormState, fd: FormData) {
  return runDelete({ fd, id: idOf(fd), perm: base.perm, table: base.table, paths: base.paths, to: base.to });
}

// Persetujuan tugas hanya oleh Ketua (`class.manage`). Pemberian akses
// `tasks.manage` kepada anggota tidak boleh dipakai menyetujui tugas; trigger
// `app.tasks_approval_guard` menolak perubahan dari selain Ketua.
export async function approveTask(fd: FormData): Promise<void> {
  const id = idOf(fd);
  if (!id) return;
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return;
  const { error } = await ctx.supabase.from('tasks')
    .update({ approval: 'approved', approved_by: ctx.user.id, approved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('approveTask', error.code);
    return;
  }
  revalidatePath('/tasks');
  revalidatePath(`/tasks/${id}`);
  revalidatePath('/');
}
