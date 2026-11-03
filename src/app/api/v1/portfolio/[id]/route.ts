import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { PORTFOLIO_FIELDS, portfolioCreateSchema, portfolioPatchSchema } from '@/lib/api/portfolio';
import { readScope, requireSelfWrite, withApi } from '@/lib/api/server';
import { canViewAsAdmin, visibilityContext } from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
const missing = () => new ApiFailure(404, 'not_found', 'Item portofolio tidak ditemukan.');

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'portfolio', action: 'read' }, async ({ principal }) => {
    const { id } = await params;
    const scope = readScope(principal, 'portfolio');
    if (scope === 'selected' && principal.memberIds.length === 0) throw missing();

    let query = principal.admin.from('portfolio_items').select(PORTFOLIO_FIELDS)
      .eq('id', id).eq('class_id', principal.classId);
    if (scope === 'public') query = query.eq('visibility', 'public');
    else if (scope === 'self') query = query.eq('user_id', principal.ownerId);
    else if (scope === 'selected') query = query.in('user_id', principal.memberIds);

    const { data, error } = await query.maybeSingle();
    if (error) dbFailure(error);
    if (!data) throw missing();

    if (scope === 'all' || scope === 'selected') {
      const row = data as { user_id: string; visibility: string | null };
      const visibility = await visibilityContext(principal.admin, principal.classId);
      if (!canViewAsAdmin(visibility, 'item.portfolio', row.user_id, row.visibility, principal.ownerId)) {
        throw missing();
      }
    }
    return apiJson({ data });
  });
}

export async function PATCH(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'portfolio', action: 'update' }, async ({ principal }) => {
    const { id } = await params;
    const ownerId = requireSelfWrite(principal, 'portfolio');
    const input = await bodyOf(request, portfolioPatchSchema);
    if (Object.keys(input).length === 0) throw new ApiFailure(400, 'validation', 'Tidak ada perubahan yang dikirim.');

    const { data: existing, error: readError } = await principal.admin.from('portfolio_items')
      .select('kind,title,description,occurred_on,url,visibility')
      .eq('id', id).eq('class_id', principal.classId).eq('user_id', ownerId).maybeSingle();
    if (readError) dbFailure(readError);
    if (!existing) throw missing();

    const merged = portfolioCreateSchema.safeParse({ ...existing, ...input });
    if (!merged.success) throw new ApiFailure(400, 'validation', merged.error.issues[0]?.message ?? 'Isian tidak valid.');

    const { data, error } = await principal.admin.from('portfolio_items').update({
      kind: merged.data.kind, title: merged.data.title,
      description: merged.data.description ?? null, occurred_on: merged.data.occurred_on,
      url: merged.data.url ?? null, visibility: merged.data.visibility ?? null,
    }).eq('id', id).eq('class_id', principal.classId).eq('user_id', ownerId)
      .select(PORTFOLIO_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data });
  });
}

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'portfolio', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const ownerId = requireSelfWrite(principal, 'portfolio');
    const { data, error } = await principal.admin.from('portfolio_items')
      .delete().eq('id', id).eq('class_id', principal.classId).eq('user_id', ownerId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw missing();
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
