import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';
import { CLASS_LINK_FIELDS, classLinkPatchSchema, classLinkSchema } from '@/lib/api/class-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'class_links', action: 'update' }, async ({ principal }) => {
    const { id } = await params;
    const input = await bodyOf(request, classLinkPatchSchema);
    if (Object.keys(input).length === 0) throw new ApiFailure(400, 'validation', 'Tidak ada perubahan yang dikirim.');

    const { data: existing, error: readError } = await principal.admin.from('class_links')
      .select('platform,label,url').eq('id', id).eq('class_id', principal.classId).maybeSingle();
    if (readError) dbFailure(readError);
    if (!existing) throw new ApiFailure(404, 'not_found', 'Tautan tidak ditemukan.');

    const merged = classLinkSchema.safeParse({ ...existing, ...input });
    if (!merged.success) throw new ApiFailure(400, 'validation', merged.error.issues[0]?.message ?? 'Isian tidak valid.');

    const { data, error } = await principal.admin.from('class_links')
      .update({ platform: merged.data.platform, label: merged.data.label ?? null, url: merged.data.url })
      .eq('id', id).eq('class_id', principal.classId).select(CLASS_LINK_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'class_links', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const { data, error } = await principal.admin.from('class_links')
      .delete().eq('id', id).eq('class_id', principal.classId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw new ApiFailure(404, 'not_found', 'Tautan tidak ditemukan.');
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
