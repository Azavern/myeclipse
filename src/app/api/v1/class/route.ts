import { z } from 'zod';
import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = 'id,name,code,tagline,description,highlight_text,highlight_url,timezone,theme,created_at,updated_at';
const httpsUrl = z.string().trim().max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.');
    } catch { return false; }
  }, 'Tautan harus berupa URL https yang valid.');

const updateSchema = z.object({
  name: z.string().trim().min(1, 'Nama kelas wajib diisi.').max(60).optional(),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/, 'Kode 2–20 karakter: huruf, angka, atau tanda hubung.')
    .nullable().optional(),
  tagline: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(800).nullable().optional(),
  highlight_text: z.string().trim().max(160).nullable().optional(),
  highlight_url: httpsUrl.nullable().optional(),
  timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan yang dikirim.');

export async function GET(request: Request) {
  return withApi(request, { resource: 'class_profile', action: 'read' }, async ({ principal }) => {
    const { data, error } = await principal.admin.from('classes').select(FIELDS)
      .eq('id', principal.classId).maybeSingle();
    if (error) dbFailure(error);
    if (!data) throw new ApiFailure(404, 'not_found', 'Kelas tidak ditemukan.');
    return apiJson({ data });
  });
}

export async function PATCH(request: Request) {
  return withApi(request, { resource: 'class_profile', action: 'update' }, async ({ principal }) => {
    const input = await bodyOf(request, updateSchema);
    const { data, error } = await principal.admin.from('classes')
      .update(input).eq('id', principal.classId).select(FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}
