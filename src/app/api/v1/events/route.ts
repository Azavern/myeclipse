import { searchTerm } from '@/lib/api/fields';
import { apiJson, bodyOf, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { EVENT_FIELDS, eventCreateSchema } from '@/lib/api/events';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: 'events', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));
    const upcoming = url.searchParams.get('upcoming') === '1';

    let query = principal.admin.from('events')
      .select(EVENT_FIELDS, { count: 'exact' }).eq('class_id', principal.classId);
    if (upcoming) query = query.gte('end_at', new Date().toISOString());
    if (q) query = query.ilike('title', `%${q}%`);

    const { data, error, count } = await query.order('start_at').range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'events', action: 'create' }, async ({ principal }) => {
    const input = await bodyOf(request, eventCreateSchema);
    const { data, error } = await principal.admin.from('events').insert({
      class_id: principal.classId,
      title: input.title,
      description: input.description ?? null,
      start_at: input.start_at,
      end_at: input.end_at,
      location: input.location ?? null,
      organizer: input.organizer ?? null,
      url: input.url ?? null,
      created_by: principal.ownerId,
    }).select(EVENT_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
