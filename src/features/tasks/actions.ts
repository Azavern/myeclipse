'use server';
import { z } from 'zod';
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
