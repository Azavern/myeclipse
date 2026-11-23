import { searchTerm } from '@/lib/api/fields';
import { apiJson, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { MEMBER_PROFILE_FIELDS, shapeMember, type MemberProfileRow } from '@/lib/api/members';
import { readScope, withApi } from '@/lib/api/server';
import {
  audienceRank, canViewAsAdmin, canViewAsPublic, effectiveAudience, visibilityContext,
} from '@/lib/api/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Kelas tunggal berukuran kecil. Batas ini hanya pengaman agar query tidak
// pernah tak terbatas; penyaringan status aktif dilakukan sebelum paginasi.
const MAX_ROWS = 1000;

type MembershipRow = {
  user_id: string; status: string; role_id: string; joined_at: string | null;
};

export async function GET(request: Request) {
  return withApi(request, { resource: 'members', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const scope = readScope(principal, 'members');
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));
    const filter = q ? `full_name.ilike.%${q}%,username.ilike.%${q}%` : null;

    if (scope === 'selected' && principal.memberIds.length === 0) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, 0) });
    }

    const visibility = await visibilityContext(principal.admin, principal.classId);

    // Direktori anggota tidak pernah lebih luas dari `class_member`; bila Ketua
    // mempersempit halaman ke pengelola, cakupan publik ikut kosong.
    if (scope === 'public'
      && audienceRank(effectiveAudience(visibility, 'page.members', null)) > audienceRank('class_member')) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, 0) });
    }

    // `member_profile_v` tidak dipakai di sini: view mengevaluasi app.can_view
    // dengan auth.uid(), sedangkan request API berjalan sebagai service role
    // tanpa sesi. Akibatnya `page.members` (paling luas `class_member`) selalu
    // false dan cakupan publik tidak pernah mengembalikan baris. Audiens
    // dihitung dari katalog yang sama lewat src/lib/api/visibility.ts.
    let query = principal.admin.from('member_profiles')
      .select(MEMBER_PROFILE_FIELDS, { count: 'exact' }).eq('class_id', principal.classId);
    if (scope === 'self') query = query.eq('user_id', principal.ownerId);
    else if (scope === 'selected') query = query.in('user_id', principal.memberIds);
    if (filter) query = query.or(filter);

    const { data: profiles, error, count } = scope === 'public'
      ? await query.order('full_name').limit(MAX_ROWS)
      : await query.order('full_name').range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    if (!profiles || profiles.length === 0) {
      return apiJson({ data: [], pagination: pageMeta(limit, offset, scope === 'public' ? 0 : count) });
    }

    const [memberships, roles] = await Promise.all([
      principal.admin.from('memberships').select('user_id,status,role_id,joined_at')
        .eq('class_id', principal.classId),
      principal.admin.from('roles').select('id,name').eq('class_id', principal.classId),
    ]);
    if (memberships.error) dbFailure(memberships.error);
    if (roles.error) dbFailure(roles.error);

    const roleName = new Map((roles.data ?? []).map((role) => {
      const row = role as { id: string; name: string };
      return [row.id, row.name] as const;
    }));
    const meta = new Map((memberships.data ?? []).map((row) => {
      const m = row as MembershipRow;
      return [m.user_id, {
        status: m.status, role_id: m.role_id,
        role_name: roleName.get(m.role_id) ?? null, joined_at: m.joined_at,
      }] as const;
    }));

    // Cakupan `public` mewakili pembaca tanpa sesi: hanya field beraudiens
    // publik yang lolos. `all`/`selected`/`self` memakai sudut pandang pemilik
    // key, jadi hanya `self` milik anggota lain yang dikosongkan.
    const canSee = (key: string, ownerId: string) => scope === 'public'
      ? canViewAsPublic(visibility, key, ownerId)
      : canViewAsAdmin(visibility, key, ownerId, null, principal.ownerId);
    const shapeRow = (row: MemberProfileRow) => shapeMember({
      ...row,
      nickname: canSee('field.member.nickname', row.user_id) ? row.nickname : null,
      bio: canSee('field.member.bio', row.user_id) ? row.bio : null,
    }, meta.get(row.user_id) ?? null);

    if (scope === 'public') {
      const active = (profiles as MemberProfileRow[])
        .filter((row) => meta.get(row.user_id)?.status === 'active');
      return apiJson({
        data: active.slice(offset, offset + limit).map(shapeRow),
        pagination: pageMeta(limit, offset, active.length),
      });
    }

    return apiJson({
      data: (profiles as MemberProfileRow[]).map(shapeRow),
      pagination: pageMeta(limit, offset, count),
    });
  });
}
