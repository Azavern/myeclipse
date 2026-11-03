import { apiJson, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = 'id,actor_id,action,entity_type,entity_id,created_at';

export async function GET(request: Request) {
  return withApi(request, { resource: 'activity', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    const { data, error, count } = await principal.admin.from('class_activity')
      .select(FIELDS, { count: 'exact' }).eq('class_id', principal.classId)
      .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}
