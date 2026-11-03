import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { EVENT_FIELDS, eventCreateSchema, eventPatchSchema } from '@/lib/api/events';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const missing = () => new ApiFailure(404, 'not_found', 'Event tidak ditemukan.');

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'events', action: 'read' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('events').select(EVENT_FIELDS)
      .eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (error) dbFailure(error);
    if (!data) throw missing();
    return apiJson({ data });
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'events', action: 'update' }, async ({ principal }) => {
    const { id } = await params;
    const input = await bodyOf(request, eventPatchSchema);
    if (Object.keys(input).length === 0) throw new ApiFailure(400, 'validation', 'Tidak ada perubahan yang dikirim.');

    const { data: existing, error: readError } = await principal.admin.from('events')
      .select('title,description,start_at,end_at,location,organizer,url')
      .eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (readError) dbFailure(readError);
    if (!existing) throw missing();

    const merged = eventCreateSchema.safeParse({ ...existing, ...input });
    if (!merged.success) throw new ApiFailure(400, 'validation', merged.error.issues[0]?.message ?? 'Isian tidak valid.');

    const { data, error } = await principal.admin.from('events').update({
      title: merged.data.title, description: merged.data.description ?? null,
      start_at: merged.data.start_at, end_at: merged.data.end_at,
      location: merged.data.location ?? null, organizer: merged.data.organizer ?? null,
      url: merged.data.url ?? null,
    }).eq('id', id).eq('class_id', principal.classId).select(EVENT_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'events', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('events')
      .delete().eq('id', id).eq('class_id', principal.classId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw missing();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
