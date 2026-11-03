import { z } from 'zod';
import { httpsUrl, isoDateTime, optionalText } from './fields';

export const TASK_FIELDS = 'id,title,description,deadline,target,course,url,status,created_by,created_at,updated_at';

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  description: optionalText(2000),
  deadline: isoDateTime,
  target: z.string().trim().min(1, 'Target wajib diisi.').max(80).optional(),
  course: z.string().trim().min(1, 'Mata kuliah wajib diisi.').max(80),
  url: httpsUrl.nullable().optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
}).strict();

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  description: optionalText(2000),
  deadline: isoDateTime,
  target: z.string().trim().min(1).max(80),
  course: z.string().trim().min(1).max(80),
  url: httpsUrl.nullable().optional(),
  status: z.enum(['active', 'completed', 'archived']),
}).strict().partial();
