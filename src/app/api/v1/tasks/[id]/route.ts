import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { TASK_FIELDS, taskPatchSchema } from '@/lib/api/tasks';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const missing = () => new ApiFailure(404, 'not_found', 'Tugas tidak ditemukan.');

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'tasks', action: 'read' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('tasks').select(TASK_FIELDS)
      .eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (error) dbFailure(error);
    if (!data) throw missing();
    return apiJson({ data });
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'tasks', action: 'update' }, async ({ principal }) => {
    const { id } = await params;
    const input = await bodyOf(request, taskPatchSchema);
    if (Object.keys(input).length === 0) throw new ApiFailure(400, 'validation', 'Tidak ada perubahan yang dikirim.');

    const { data: existing, error: readError } = await principal.admin.from('tasks')
      .select('title,description,deadline,target,course,url,status')
      .eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (readError) dbFailure(readError);
    if (!existing) throw missing();

    // Tidak ada aturan lintas-field pada tugas, jadi cukup field yang dikirim.
    // Ini juga menjaga tugas lama tanpa `course` tetap bisa diubah statusnya.
    const update: Record<string, unknown> = {};
    for (const key of ['title', 'description', 'deadline', 'target', 'course', 'url', 'status'] as const) {
      if (key in input) update[key] = input[key];
    }

    const { data, error } = await principal.admin.from('tasks').update(update)
      .eq('id', id).eq('class_id', principal.classId).select(TASK_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'tasks', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('tasks')
      .delete().eq('id', id).eq('class_id', principal.classId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw missing();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
