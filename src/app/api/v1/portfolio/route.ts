import { searchTerm } from '@/lib/api/fields';
import { apiJson, bodyOf, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { PORTFOLIO_FIELDS, portfolioCreateSchema } from '@/lib/api/portfolio';
import { readScope, requireSelfWrite, withApi } from '@/lib/api/server';
import { canViewAsAdmin, visibilityContext } from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: 'portfolio', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const scope = readScope(principal, 'portfolio');
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));
    const requestedUser = url.searchParams.get('user_id');

    if (scope === 'selected' && principal.memberIds.length === 0) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, 0) });
    }
    if (requestedUser && scope === 'self' && requestedUser !== principal.ownerId) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, 0) });
    }
    if (requestedUser && scope === 'selected' && !principal.memberIds.includes(requestedUser)) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, 0) });
    }

    // all/selected: ambil kandidat lalu buang baris yang efektif `self` milik
    // anggota lain. Batas 1000 menjaga query tetap berbatas; kelas Eclipse kecil.
    if (scope === 'all' || scope === 'selected') {
      const visibility = await visibilityContext(principal.admin, principal.classId);
      let candidate = principal.admin.from('portfolio_items').select(PORTFOLIO_FIELDS)
        .eq('class_id', principal.classId);
      if (scope === 'selected') candidate = candidate.in('user_id', principal.memberIds);
      if (requestedUser) candidate = candidate.eq('user_id', requestedUser);
      if (q) candidate = candidate.ilike('title', `%${q}%`);

      const { data, error } = await candidate.order('occurred_on', { ascending: false }).limit(1000);
      if (error) dbFailure(error);
      const visible = (data ?? []).filter((row) => {
        const item = row as { user_id: string; visibility: string | null };
        return canViewAsAdmin(visibility, 'item.portfolio', item.user_id, item.visibility, principal.ownerId);
      });
      return apiJson({
        data: visible.slice(offset, offset + limit),
        pagination: pageMeta(limit, offset, visible.length),
      });
    }

    let query = principal.admin.from('portfolio_items')
      .select(PORTFOLIO_FIELDS, { count: 'exact' }).eq('class_id', principal.classId);
    if (scope === 'public') query = query.eq('visibility', 'public');
    else query = query.eq('user_id', principal.ownerId);
    if (requestedUser) query = query.eq('user_id', requestedUser);
    if (q) query = query.ilike('title', `%${q}%`);

    const { data, error, count } = await query.order('occurred_on', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'portfolio', action: 'create' }, async ({ principal }) => {
    const ownerId = requireSelfWrite(principal, 'portfolio');
    const input = await bodyOf(request, portfolioCreateSchema);
    const { data, error } = await principal.admin.from('portfolio_items').insert({
      class_id: principal.classId,
      user_id: ownerId,
      kind: input.kind ?? 'project',
      title: input.title,
      description: input.description ?? null,
      occurred_on: input.occurred_on,
      url: input.url ?? null,
      visibility: input.visibility ?? null,
    }).select(PORTFOLIO_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
