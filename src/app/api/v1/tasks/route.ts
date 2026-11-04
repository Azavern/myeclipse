import { searchTerm } from '@/lib/api/fields';
import { apiJson, bodyOf, dbFailure, pageMeta, pagination, ApiFailure } from '@/lib/api/http';
import { TASK_FIELDS, taskCreateSchema } from '@/lib/api/tasks';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['active', 'completed', 'archived']);

export async function GET(request: Request) {
  return withApi(request, { resource: 'tasks', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));
    const status = url.searchParams.get('status');

    if (status && !STATUSES.has(status)) {
      throw new ApiFailure(400, 'validation', 'Status harus active, completed, atau archived.');
    }

    // Tugas yang belum disetujui Ketua tidak pernah tampil lewat API.
    let query = principal.admin.from('tasks')
      .select(TASK_FIELDS, { count: 'exact' }).eq('class_id', principal.classId)
      .eq('approval', 'approved');
    if (status) query = query.eq('status', status);
    if (q) query = query.or(`title.ilike.%${q}%,course.ilike.%${q}%`);

    const { data, error, count } = await query.order('deadline').range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'tasks', action: 'create' }, async ({ principal }) => {
    const input = await bodyOf(request, taskCreateSchema);
    const { data, error } = await principal.admin.from('tasks').insert({
      class_id: principal.classId,
      title: input.title,
      description: input.description ?? null,
      deadline: input.deadline,
      target: input.target ?? 'Seluruh kelas',
      course: input.course,
      url: input.url ?? null,
      status: input.status ?? 'active',
      created_by: principal.ownerId,
      // Service role melewati trigger, jadi persetujuan diisi eksplisit.
      approval: 'approved',
    }).select(TASK_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
