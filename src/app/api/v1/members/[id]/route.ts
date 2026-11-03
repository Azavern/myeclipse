import { apiJson, dbFailure, ApiFailure } from '@/lib/api/http';
import { MEMBER_LIST_FIELDS, MEMBER_PROFILE_FIELDS, shapeMember, type MemberProfileRow } from '@/lib/api/members';
import { readScope, withApi } from '@/lib/api/server';
import { canViewAsAdmin, visibilityContext } from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const missing = () => new ApiFailure(404, 'not_found', 'Anggota tidak ditemukan.');

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'members', action: 'read' }, async ({ principal }) => {
    const { id } = await params;
    const scope = readScope(principal, 'members');

    if (scope === 'selected' && !principal.memberIds.includes(id)) throw missing();
    if (scope === 'self' && id !== principal.ownerId) throw missing();

    if (scope === 'public') {
      const { data, error } = await principal.admin.from('member_profile_v')
        .select(MEMBER_LIST_FIELDS).eq('user_id', id).eq('status', 'active').maybeSingle();
      if (error) dbFailure(error);
      if (!data) throw missing();
      return apiJson({ data });
    }

    const { data: profile, error } = await principal.admin.from('member_profiles')
      .select(MEMBER_PROFILE_FIELDS).eq('class_id', principal.classId).eq('user_id', id).maybeSingle();
    if (error) dbFailure(error);
    if (!profile) throw missing();

    const [membership, roles] = await Promise.all([
      principal.admin.from('memberships').select('status,role_id,joined_at')
        .eq('class_id', principal.classId).eq('user_id', id).maybeSingle(),
      principal.admin.from('roles').select('id,name').eq('class_id', principal.classId),
    ]);
    if (membership.error) dbFailure(membership.error);
    if (roles.error) dbFailure(roles.error);
    const meta = membership.data as { status: string; role_id: string; joined_at: string | null } | null;
    const role = (roles.data ?? []).find((row) => (row as { id: string }).id === meta?.role_id) as { name: string } | undefined;

    const row = profile as MemberProfileRow;
    const visibility = await visibilityContext(principal.admin, principal.classId);
    const safeProfile: MemberProfileRow = {
      ...row,
      nickname: canViewAsAdmin(visibility, 'field.member.nickname', row.user_id, null, principal.ownerId)
        ? row.nickname : null,
      bio: canViewAsAdmin(visibility, 'field.member.bio', row.user_id, null, principal.ownerId)
        ? row.bio : null,
    };

    return apiJson({
      data: shapeMember(safeProfile, meta ? {
        status: meta.status, role_id: meta.role_id, role_name: role?.name ?? null, joined_at: meta.joined_at,
      } : null),
    });
  });
}
