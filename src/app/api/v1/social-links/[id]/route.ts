import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { SOCIAL_LINK_FIELDS, socialLinkPatchSchema, socialLinkSchema } from '@/lib/api/social-links';
import { requireSelfWrite, withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const missing = () => new ApiFailure(404, 'not_found', 'Tautan sosial tidak ditemukan.');

export async function PATCH(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'social_links', action: 'update' }, async ({ principal }) => {
    const { id } = await params;
    const ownerId = requireSelfWrite(principal, 'social_links');
    const input = await bodyOf(request, socialLinkPatchSchema);
    if (Object.keys(input).length === 0) throw new ApiFailure(400, 'validation', 'Tidak ada perubahan yang dikirim.');

    const { data: existing, error: readError } = await principal.admin.from('social_links')
      .select('platform,label,url,visibility')
      .eq('id', id).eq('class_id', principal.classId).eq('user_id', ownerId).maybeSingle();
    if (readError) dbFailure(readError);
    if (!existing) throw missing();

    const merged = socialLinkSchema.safeParse({ ...existing, ...input });
    if (!merged.success) throw new ApiFailure(400, 'validation', merged.error.issues[0]?.message ?? 'Isian tidak valid.');

    const { data, error } = await principal.admin.from('social_links').update({
      platform: merged.data.platform, label: merged.data.label ?? null,
      url: merged.data.url, visibility: merged.data.visibility ?? null,
    }).eq('id', id).eq('class_id', principal.classId).eq('user_id', ownerId)
      .select(SOCIAL_LINK_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'social_links', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const ownerId = requireSelfWrite(principal, 'social_links');
    const { data, error } = await principal.admin.from('social_links')
      .delete().eq('id', id).eq('class_id', principal.classId).eq('user_id', ownerId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw missing();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
