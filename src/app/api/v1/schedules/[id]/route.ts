import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { SCHEDULE_FIELDS, scheduleCreateSchema, schedulePatchSchema } from '@/lib/api/schedules';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const missing = () => new ApiFailure(404, 'not_found', 'Jadwal tidak ditemukan.');

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'schedules', action: 'read' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('schedules').select(SCHEDULE_FIELDS)
      .eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (error) dbFailure(error);
    if (!data) throw missing();
    return apiJson({ data });
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'schedules', action: 'update' }, async ({ principal }) => {
    const { id } = await params;
    const input = await bodyOf(request, schedulePatchSchema);
    if (Object.keys(input).length === 0) throw new ApiFailure(400, 'validation', 'Tidak ada perubahan yang dikirim.');

    const { data: existing, error: readError } = await principal.admin.from('schedules')
      .select('title,description,day_of_week,start_time,end_time,semester,location,type,url')
      .eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (readError) dbFailure(readError);
    if (!existing) throw missing();

    // PostgREST mengembalikan `time` sebagai HH:MM:SS; skema API memakai HH:MM.
    const row = existing as typeof existing & { start_time: string; end_time: string };
    const merged = scheduleCreateSchema.safeParse({
      ...row,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
      ...input,
    });
    if (!merged.success) throw new ApiFailure(400, 'validation', merged.error.issues[0]?.message ?? 'Isian tidak valid.');

    const { data, error } = await principal.admin.from('schedules').update({
      title: merged.data.title, description: merged.data.description ?? null,
      day_of_week: merged.data.day_of_week, start_time: merged.data.start_time,
      end_time: merged.data.end_time, semester: merged.data.semester,
      location: merged.data.location ?? null, type: merged.data.type, url: merged.data.url ?? null,
    }).eq('id', id).eq('class_id', principal.classId).select(SCHEDULE_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'schedules', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('schedules')
      .delete().eq('id', id).eq('class_id', principal.classId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw missing();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
