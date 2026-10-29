import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Avatar, Chip, EmptyState, LinkButton, PageHeader, Section } from '@/components/ui/primitives';
import { RoleChangeRequest } from '@/features/access/components';
import { CreateMemberForm, IssueLinkForm, IssueResetForm } from '@/features/members/components';
import { MemberStatusChip } from '@/features/members/member-card';
import { formatWhen } from '@/lib/time';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

type M = {
  user_id: string; username: string; full_name: string;
  role_id: string; role_name: string; status: string; avatar_path: string | null;
};
type Req = { id: string; email: string; created_at: string };
type RoleOption = { id: string; key: string; name: string };

// Dua tingkat akses: `members.manage` (Ketua) mengelola penuh; `members.request`
// (jabatan lain yang diizinkan) hanya bisa mengajukan perubahan jabatan dan
// menunggu persetujuan Ketua.
export default async function ManageMembersPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fmembers');
  const meId = viewer.user.id;
  const canManage = viewer.can('members.manage');
  const canRequest = viewer.can('members.request');
  if (!canManage && !canRequest) return <NoAccess />;

  const supabase = await createClient();
  const [m, cls] = await Promise.all([
    supabase.from('member_profile_v')
      .select('user_id,username,full_name,role_id,role_name,status,avatar_path')
      .order('full_name').limit(100),
    getClass(),
  ]);
  const rows = (m.data ?? []) as M[];

  let roles: { id: string; name: string }[] = [];
  let pendingReset: Req[] = [];
  if (canManage) {
    const [r, q] = await Promise.all([
      supabase.from('roles').select('id,name').order('name'),
      supabase.from('password_reset_requests')
        .select('id,email,created_at').eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(50),
    ]);
    roles = (r.data ?? []) as { id: string; name: string }[];
    pendingReset = (q.data ?? []) as Req[];
  }

  let options: RoleOption[] = [];
  let waiting = new Set<string>();
  if (!canManage) {
    const [o, p] = await Promise.all([
      supabase.rpc('get_role_change_options'),
      supabase.from('role_change_requests').select('target_user_id').eq('status', 'pending'),
    ]);
    options = (o.data ?? []) as RoleOption[];
    waiting = new Set(((p.data ?? []) as { target_user_id: string }[]).map((x) => x.target_user_id));
  }

  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const avatars = await signMany(supabase, 'member-media', rows.flatMap((x) => (x.avatar_path ? [x.avatar_path] : [])));

  return (
    <>
      <PageHeader icon="users" title={canManage ? 'Kelola anggota' : 'Anggota'}
        description={canManage
          ? 'Tambah anggota, atur role dan status, serta terbitkan tautan akses saat ada yang lupa kata sandi.'
          : 'Ajukan promosi atau demosi jabatan anggota. Setiap pengajuan baru berlaku setelah disetujui Ketua.'} />

      {canManage && pendingReset.length > 0 && (
        <Section id="reset-title" title="Permintaan tautan akses" icon="key" action={<Chip tone="warning">{pendingReset.length} menunggu</Chip>}>
          <div className="card card--flush">
            <ul className="rows">
              {pendingReset.map((x) => (
                <li key={x.id} className="row row--wrap">
                  <div className="row__body">
                    <span className="row__title">{x.email}</span>
                    <span className="muted">Diminta {formatWhen(x.created_at, tz)}</span>
                  </div>
                  <div className="row__actions"><IssueResetForm requestId={x.id} /></div>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {canManage && (
        <Section id="add-title" title="Tambah anggota" icon="user-plus">
          <div className="card">
            <CreateMemberForm roles={roles} />
          </div>
        </Section>
      )}

      <Section id="list-title" title="Daftar anggota" icon="users" action={<Chip tone="outline">{rows.length} orang</Chip>}>
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState icon="users" title="Belum ada anggota" compact>
              {canManage ? 'Tambahkan anggota pertama lewat formulir di atas.' : 'Anggota aktif akan muncul di sini.'}
            </EmptyState>
          </div>
        ) : (
          <div className="card card--flush">
            <ul className="rows">
              {rows.map((x) => (
                <li key={x.user_id} className="row row--wrap">
                  <Avatar name={x.full_name} src={x.avatar_path ? avatars.get(x.avatar_path) : undefined} />
                  <div className="row__body">
                    <span className="row__title">{x.full_name}</span>
                    <span className="muted">@{x.username} · {x.role_name}</span>
                  </div>
                  {canManage && <MemberStatusChip status={x.status} />}
                  <div className="row__actions">
                    {canManage ? (
                      <>
                        <LinkButton href={`/settings/members/${x.user_id}`} variant="secondary" size="sm" icon="pencil">Kelola</LinkButton>
                        <IssueLinkForm userId={x.user_id} size="sm" />
                      </>
                    ) : x.user_id !== meId && x.role_name !== 'Ketua' ? (
                      waiting.has(x.user_id) ? (
                        <Chip tone="warning" icon="hourglass">Menunggu persetujuan</Chip>
                      ) : (
                        <RoleChangeRequest targetId={x.user_id} targetName={x.full_name}
                          currentRoleId={x.role_id} options={options} />
                      )
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}
