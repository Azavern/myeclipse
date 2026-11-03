import { z } from 'zod';
import { httpsUrl, optionalText } from './fields';

export const SCHEDULE_FIELDS = 'id,title,description,day_of_week,start_time,end_time,semester,location,type,url,created_by,created_at,updated_at';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam harus berformat HH:mm.');
const semester = z.string().regex(/^\d{4}\/\d{4} (Ganjil|Genap)$/, 'Format semester: 2026/2027 Ganjil.')
  .refine((value) => Number(value.slice(5, 9)) === Number(value.slice(0, 4)) + 1,
    'Tahun kedua harus tahun pertama + 1.');

export const scheduleCreateSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  description: optionalText(1000),
  day_of_week: z.number().int().min(1, 'Hari tidak valid.').max(7, 'Hari tidak valid.'),
  start_time: time,
  end_time: time,
  semester,
  location: optionalText(120),
  type: z.enum(['class', 'activity']),
  url: httpsUrl.nullable().optional(),
}).strict().refine((value) => value.end_time > value.start_time, {
  message: 'Jam selesai harus setelah jam mulai.', path: ['end_time'],
});

export const schedulePatchSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  description: optionalText(1000),
  day_of_week: z.number().int().min(1).max(7),
  start_time: time,
  end_time: time,
  semester,
  location: optionalText(120),
  type: z.enum(['class', 'activity']),
  url: httpsUrl.nullable().optional(),
}).strict().partial();
