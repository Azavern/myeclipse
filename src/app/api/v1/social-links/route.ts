import { apiJson, bodyOf, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { SOCIAL_LINK_FIELDS, socialLinkSchema } from '@/lib/api/social-links';
import { readScope, requireSelfWrite, withApi } from '@/lib/api/server';
import { canViewAsAdmin, visibilityContext } from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: 'social_links', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const scope = readScope(principal, 'social_links');
    const { limit, offset } = pagination(url);
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

    if (scope === 'all' || scope === 'selected') {
      const visibility = await visibilityContext(principal.admin, principal.classId);
      let candidate = principal.admin.from('social_links').select(SOCIAL_LINK_FIELDS)
        .eq('class_id', principal.classId);
      if (scope === 'selected') candidate = candidate.in('user_id', principal.memberIds);
      if (requestedUser) candidate = candidate.eq('user_id', requestedUser);

      const { data, error } = await candidate.order('created_at').limit(1000);
      if (error) dbFailure(error);
      const visible = (data ?? []).filter((row) => {
        const item = row as { user_id: string; visibility: string | null };
        return canViewAsAdmin(visibility, 'item.social_link', item.user_id, item.visibility, principal.ownerId);
      });
      return apiJson({
        data: visible.slice(offset, offset + limit),
        pagination: pageMeta(limit, offset, visible.length),
      });
    }

    let query = principal.admin.from('social_links')
      .select(SOCIAL_LINK_FIELDS, { count: 'exact' }).eq('class_id', principal.classId);
    if (scope === 'public') query = query.eq('visibility', 'public');
    else query = query.eq('user_id', principal.ownerId);
    if (requestedUser) query = query.eq('user_id', requestedUser);

    const { data, error, count } = await query.order('created_at').range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'social_links', action: 'create' }, async ({ principal }) => {
    const ownerId = requireSelfWrite(principal, 'social_links');
    const input = await bodyOf(request, socialLinkSchema);
    const { data, error } = await principal.admin.from('social_links').insert({
      class_id: principal.classId,
      user_id: ownerId,
      platform: input.platform,
      label: input.label ?? null,
      url: input.url,
      visibility: input.visibility ?? null,
    }).select(SOCIAL_LINK_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
