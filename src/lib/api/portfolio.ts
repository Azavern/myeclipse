import { z } from 'zod';
import { AUDIENCES } from '@/lib/visibility/audiences';
import { httpsUrl, optionalText } from './fields';

export const PORTFOLIO_FIELDS = 'id,user_id,kind,title,description,occurred_on,url,visibility,created_at,updated_at';

export const PORTFOLIO_KINDS = [
  'project', 'achievement', 'organization', 'competition',
  'creative_work', 'certificate', 'experience',
] as const;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Tanggal tidak valid.');

const base = z.object({
  kind: z.enum(PORTFOLIO_KINDS).optional(),
  title: z.string().trim().min(1, 'Judul wajib diisi.').max(100).optional(),
  description: optionalText(1000),
  occurred_on: dateOnly.optional(),
  url: httpsUrl.nullable().optional(),
  visibility: z.enum([...AUDIENCES]).nullable().optional(),
}).strict();

export const portfolioCreateSchema = base.refine(
  (value) => Boolean(value.title && value.occurred_on),
  'Judul dan tanggal wajib diisi.',
);

export const portfolioPatchSchema = base.partial();
