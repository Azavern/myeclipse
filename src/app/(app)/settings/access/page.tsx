import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Avatar, Chip, EmptyState, LinkButton, PageHeader, Section } from '@/components/ui/primitives';
import { RoleDecision } from '@/features/access/components';
import { AccessPanel, MemberAccessInfo, MemberAccessList, RootAccessDialog } from '@/features/access/panel';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/time';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Akses role' };

type Role = { id: string; key: string; name: string; permissions: string[] };
type Member = { user_id: string; full_name: string; username: string };
type Request = {
  id: string; requested_by: string; target_user_id: string;
  from_role_id: string; to_role_id: string; created_at: string;
};

const ROLE_ORDER = ['ketua', 'wakil', 'sekretaris', 'bendahara'];

// Halaman khusus Ketua: checklist akses tiap jabatan + antrean pengajuan
// perubahan jabatan. Hanya pemegang members.manage yang boleh masuk; role lain
// tidak dapat mengubah aksesnya sendiri.
export default async function AccessPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Faccess');
  if (!viewer.can('members.manage')) return <NoAccess />;

  const supabase = await createClient();
  const [rolesResult, requestsResult, cls] = await Promise.all([
    supabase.from('roles').select('id,key,name,permissions'),
    supabase.from('role_change_requests')
      .select('id,requested_by,target_user_id,from_role_id,to_role_id,created_at')
      .eq('status', 'pending').order('created_at'),
    getClass(),
  ]);

  // `roles` hanya memuat jabatan, sedangkan role `member` dipakai di bawah untuk
  // mencari anggota yang bisa diberi akses tambahan.
  const allRoles = (rolesResult.data ?? []) as Role[];
  const roles = allRoles
    .filter((r) => ROLE_ORDER.includes(r.key))
    .sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key));
  const ketua = roles.find((r) => r.key === 'ketua');
  const others = roles.filter((r) => r.key !== 'ketua');
  const requests = (requestsResult.data ?? []) as Request[];

  // Anggota dengan role `member` yang bisa diberi akses event/tugas.
  const memberRoleId = allRoles.find((r) => r.key === 'member')?.id ?? null;
  const memberRows = memberRoleId
    ? ((await supabase.from('memberships').select('user_id')
        .eq('role_id', memberRoleId).eq('status', 'active')).data ?? []) as { user_id: string }[]
    : [];
  const memberIds = memberRows.map((row) => row.user_id);
  const [grantResult, memberProfileResult] = await Promise.all([
    supabase.from('member_access').select('user_id,permission'),
    memberIds.length
      ? supabase.from('member_profile_v').select('user_id,full_name,username').in('user_id', memberIds)
      : Promise.resolve({ data: [] as Member[] }),
  ]);
  const accessMembers = ((memberProfileResult.data ?? []) as Member[])
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((row) => ({ id: row.user_id, name: row.full_name, username: row.username ?? '' }));
  const grants = [...new Set(((grantResult.data ?? []) as { user_id: string; permission: string }[])
    .map((row) => `${row.user_id}:${row.permission}`))];

  const peopleIds = [...new Set(requests.flatMap((r) => [r.requested_by, r.target_user_id]))];
  const people = peopleIds.length
    ? ((await supabase.from('member_profile_v').select('user_id,full_name').in('user_id', peopleIds)).data ?? []) as { user_id: string; full_name: string }[]
    : [];
  const nameOf = new Map(people.map((p) => [p.user_id, p.full_name]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const tz = cls?.timezone ?? 'Asia/Jakarta';

  return (
    <>
      <PageHeader
        icon="shield"
        title="Akses role"
        description="Tentukan apa yang boleh dilakukan tiap jabatan di bawah Ketua. Centang untuk mengaktifkan, hapus centang untuk mematikan. Akses langsung berlaku pada jabatan tersebut."
        actions={
          <div className="cluster">
            <RootAccessDialog role={ketua} />
            <LinkButton href="/settings/members" variant="secondary" icon="users">Daftar anggota</LinkButton>
          </div>
        }
      />

      <Section id="access-title" title="Akses jabatan" icon="shield">
        <AccessPanel roles={others} members={accessMembers} grants={grants} />
      </Section>

      <Section id="member-access" title="Akses khusus anggota" icon="user-plus" className="access-desktop"
        action={
          <div className="cluster">
            <Chip tone="outline">{accessMembers.length} anggota</Chip>
            <MemberAccessInfo />
          </div>
        }>
        <MemberAccessList members={accessMembers} grants={grants} />
      </Section>

      <Section id="requests-title" title="Menunggu persetujuan" icon="hourglass"
        action={<Chip tone={requests.length > 0 ? 'warning' : 'outline'}>{requests.length} pengajuan</Chip>}>
        {requests.length === 0 ? (
          <div className="card">
            <EmptyState icon="check-circle" title="Tidak ada pengajuan" compact>
              Pengajuan promosi atau demosi jabatan dari Wakil Ketua, Sekretaris, atau Bendahara akan muncul di sini.
            </EmptyState>
          </div>
        ) : (
          <div className="card card--flush">
            <ul className="rows">
              {requests.map((r) => {
                const target = nameOf.get(r.target_user_id) ?? 'Anggota';
                return (
                  <li key={r.id} className="row row--wrap">
                    <Avatar name={target} />
                    <div className="row__body">
                      <span className="row__title">{target}</span>
                      <span className="muted">
                        {roleName.get(r.from_role_id) ?? '—'} → {roleName.get(r.to_role_id) ?? '—'}
                        {' · '}diajukan oleh {nameOf.get(r.requested_by) ?? 'anggota lain'} · {formatWhen(r.created_at, tz)}
                      </span>
                    </div>
                    <div className="row__actions"><RoleDecision id={r.id} /></div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}
