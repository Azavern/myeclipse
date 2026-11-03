import { searchTerm } from '@/lib/api/fields';
import { apiJson, bodyOf, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { SCHEDULE_FIELDS, scheduleCreateSchema } from '@/lib/api/schedules';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: 'schedules', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));
    const semester = url.searchParams.get('semester')?.slice(0, 20);

    let query = principal.admin.from('schedules')
      .select(SCHEDULE_FIELDS, { count: 'exact' }).eq('class_id', principal.classId);
    if (semester) query = query.eq('semester', semester);
    if (q) query = query.ilike('title', `%${q}%`);

    const { data, error, count } = await query
      .order('semester', { ascending: false }).order('day_of_week').order('start_time')
      .range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'schedules', action: 'create' }, async ({ principal }) => {
    const input = await bodyOf(request, scheduleCreateSchema);
    const { data, error } = await principal.admin.from('schedules').insert({
      class_id: principal.classId,
      title: input.title,
      description: input.description ?? null,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      semester: input.semester,
      location: input.location ?? null,
      type: input.type,
      url: input.url ?? null,
      created_by: principal.ownerId,
    }).select(SCHEDULE_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
