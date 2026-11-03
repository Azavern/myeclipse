import { searchTerm } from '@/lib/api/fields';
import { apiJson, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { MEMBER_LIST_FIELDS, MEMBER_PROFILE_FIELDS, shapeMember, type MemberProfileRow } from '@/lib/api/members';
import { readScope, withApi } from '@/lib/api/server';
import { canViewAsAdmin, visibilityContext } from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: 'members', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const scope = readScope(principal, 'members');
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));
    const filter = q ? `full_name.ilike.%${q}%,username.ilike.%${q}%` : null;

    // Cakupan publik memakai view yang sudah menyamarkan field non-publik dan
    // hanya memuat anggota aktif, sama seperti tampilan anonim di UI.
    if (scope === 'public') {
      let query = principal.admin.from('member_profile_v')
        .select(MEMBER_LIST_FIELDS, { count: 'exact' }).eq('status', 'active');
      if (filter) query = query.or(filter);
      const { data, error, count } = await query.order('full_name').range(offset, offset + limit - 1);
      if (error) dbFailure(error);
      return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
    }

    if (scope === 'selected' && principal.memberIds.length === 0) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, 0) });
    }

    let query = principal.admin.from('member_profiles')
      .select(MEMBER_PROFILE_FIELDS, { count: 'exact' }).eq('class_id', principal.classId);
    if (scope === 'self') query = query.eq('user_id', principal.ownerId);
    else if (scope === 'selected') query = query.in('user_id', principal.memberIds);
    if (filter) query = query.or(filter);

    const { data: profiles, error, count } = await query.order('full_name').range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    const profileRows = (profiles ?? []) as MemberProfileRow[];
    if (profileRows.length === 0) return apiJson({ data: [], pagination: pageMeta(limit, offset, count) });

    // Nickname dan bio dapat berstatus `self`; pengelola tidak boleh membacanya
    // untuk anggota lain, jadi field itu dikosongkan bila aturannya self.
    const visibility = await visibilityContext(principal.admin, principal.classId);
    const rows = profileRows.map((row) => ({
      ...row,
      nickname: canViewAsAdmin(visibility, 'field.member.nickname', row.user_id, null, principal.ownerId)
        ? row.nickname : null,
      bio: canViewAsAdmin(visibility, 'field.member.bio', row.user_id, null, principal.ownerId)
        ? row.bio : null,
    }));
    const ids = rows.map((row) => row.user_id);
    const [memberships, roles] = await Promise.all([
      principal.admin.from('memberships').select('user_id,status,role_id,joined_at')
        .eq('class_id', principal.classId).in('user_id', ids),
      principal.admin.from('roles').select('id,name').eq('class_id', principal.classId),
    ]);
    if (memberships.error) dbFailure(memberships.error);
    if (roles.error) dbFailure(roles.error);

    const roleName = new Map((roles.data ?? []).map((role) => {
      const row = role as { id: string; name: string };
      return [row.id, row.name] as const;
    }));
    const meta = new Map((memberships.data ?? []).map((row) => {
      const m = row as { user_id: string; status: string; role_id: string; joined_at: string | null };
      return [m.user_id, {
        status: m.status, role_id: m.role_id,
        role_name: roleName.get(m.role_id) ?? null, joined_at: m.joined_at,
      }] as const;
    }));

    return apiJson({
      data: rows.map((row) => shapeMember(row, meta.get(row.user_id) ?? null)),
      pagination: pageMeta(limit, offset, count),
    });
  });
}
