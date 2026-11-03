import { z } from 'zod';
import { httpsUrl, isoDateTime, optionalText } from './fields';

export const EVENT_FIELDS = 'id,title,description,start_at,end_at,location,organizer,url,created_by,created_at,updated_at';

export const eventCreateSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  description: optionalText(2000),
  start_at: isoDateTime,
  end_at: isoDateTime,
  location: optionalText(120),
  organizer: optionalText(80),
  url: httpsUrl.nullable().optional(),
}).strict().refine((value) => new Date(value.end_at).getTime() >= new Date(value.start_at).getTime(), {
  message: 'Waktu selesai tidak boleh sebelum waktu mulai.', path: ['end_at'],
});

export const eventPatchSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(120),
  description: optionalText(2000),
  start_at: isoDateTime,
  end_at: isoDateTime,
  location: optionalText(120),
  organizer: optionalText(80),
  url: httpsUrl.nullable().optional(),
}).strict().partial();
