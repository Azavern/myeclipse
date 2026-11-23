import { apiJson, dbFailure, ApiFailure } from '@/lib/api/http';
import { MEMBER_PROFILE_FIELDS, shapeMember, type MemberProfileRow } from '@/lib/api/members';
import { readScope, withApi } from '@/lib/api/server';
import {
  audienceRank, canViewAsAdmin, canViewAsPublic, effectiveAudience, visibilityContext,
} from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };
type MembershipRow = { status: string; role_id: string; joined_at: string | null };

const missing = () => new ApiFailure(404, 'not_found', 'Anggota tidak ditemukan.');

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'members', action: 'read' }, async ({ principal }) => {
    const { id } = await params;
    const scope = readScope(principal, 'members');

    if (scope === 'selected' && !principal.memberIds.includes(id)) throw missing();
    if (scope === 'self' && id !== principal.ownerId) throw missing();

    if (scope === 'public') {
      const visibility = await visibilityContext(principal.admin, principal.classId);
      // Sama seperti daftar: direktori tidak pernah lebih luas dari class_member,
      // dan pembatas halaman dari Ketua tetap dihormati.
      if (audienceRank(effectiveAudience(visibility, 'page.members', null)) > audienceRank('class_member')) {
        throw missing();
      }

      const [profile, membership, roles] = await Promise.all([
        principal.admin.from('member_profiles').select(MEMBER_PROFILE_FIELDS)
          .eq('class_id', principal.classId).eq('user_id', id).maybeSingle(),
        principal.admin.from('memberships').select('status,role_id,joined_at')
          .eq('class_id', principal.classId).eq('user_id', id).maybeSingle(),
        principal.admin.from('roles').select('id,name').eq('class_id', principal.classId),
      ]);
      if (profile.error) dbFailure(profile.error);
      if (membership.error) dbFailure(membership.error);
      if (roles.error) dbFailure(roles.error);

      const meta = membership.data as MembershipRow | null;
      // Profil nonaktif/invited tidak muncul di cakupan publik.
      if (!profile.data || meta?.status !== 'active') throw missing();
      const role = (roles.data ?? [])
        .find((row) => (row as { id: string }).id === meta.role_id) as { name: string } | undefined;

      const row = profile.data as MemberProfileRow;
      return apiJson({
        data: shapeMember({
          ...row,
          nickname: canViewAsPublic(visibility, 'field.member.nickname', row.user_id) ? row.nickname : null,
          bio: canViewAsPublic(visibility, 'field.member.bio', row.user_id) ? row.bio : null,
        }, {
          status: meta.status, role_id: meta.role_id, role_name: role?.name ?? null, joined_at: meta.joined_at,
        }),
      });
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
    const meta = membership.data as MembershipRow | null;
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
