'use server';
import { z } from 'zod';
import { runDelete, runSave } from '@/lib/crud';
import { failState, type FormState } from '@/lib/form-state';
import { hhmm, idOf, optText, optUrl, reqText } from '@/lib/zod-fields';

const schema = z.object({
  title: reqText(120, 'Judul'), description: optText(1000),
  day_of_week: z.coerce.number().int().min(1, 'Hari tidak valid.').max(7, 'Hari tidak valid.'),
  start_time: hhmm, end_time: hhmm,
  semester: z.string().regex(/^(\d{4})\/(\d{4}) (Ganjil|Genap)$/, 'Format: 2026/2027 Ganjil')
    .refine((s) => Number(s.slice(5, 9)) === Number(s.slice(0, 4)) + 1, 'Tahun kedua harus tahun pertama + 1.'),
  location: optText(120), type: z.enum(['class', 'activity']), url: optUrl,
}).refine((v) => v.end_time > v.start_time, { message: 'Jam selesai harus setelah jam mulai.', path: ['end_time'] });
const base = { perm: 'schedule.manage', table: 'schedules', schema, paths: ['/schedule', '/'], to: '/schedule', build: (d: z.infer<typeof schema>) => d };

export async function createSchedule(_p: FormState, fd: FormData) { return runSave({ ...base, fd }); }
export async function updateSchedule(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  return id ? runSave({ ...base, fd, id }) : failState('Data tidak ditemukan.', fd);
}
export async function deleteSchedule(_p: FormState, fd: FormData) {
  return runDelete({ fd, id: idOf(fd), perm: base.perm, table: base.table, paths: base.paths, to: base.to });
}
