import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Avatar, Chip, EmptyState, LinkButton, PageHeader, Section } from '@/components/ui/primitives';
import { CreateMemberForm, IssueLinkForm, IssueResetForm } from '@/features/members/components';
import { MemberStatusChip } from '@/features/members/member-card';
import { formatWhen } from '@/lib/time';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

type M = { user_id: string; username: string; full_name: string; role_name: string; status: string; avatar_path: string | null };
type Req = { id: string; email: string; created_at: string };

export default async function ManageMembersPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fmembers');
  if (!viewer.can('members.manage')) return <NoAccess />;
  const supabase = await createClient();
  const [m, r, q, cls] = await Promise.all([
    supabase.from('member_profile_v').select('user_id,username,full_name,role_name,status,avatar_path').order('full_name').limit(100),
    supabase.from('roles').select('id,name').order('name'),
    supabase.from('password_reset_requests').select('id,email,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(50),
    getClass(),
  ]);
  const rows = (m.data ?? []) as M[];
  const pending = (q.data ?? []) as Req[];
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const avatars = await signMany(supabase, 'member-media', rows.flatMap((x) => (x.avatar_path ? [x.avatar_path] : [])));

  return (
    <>
      <PageHeader icon="users" title="Kelola anggota" description="Tambah anggota, atur role dan status, serta terbitkan tautan akses saat ada yang lupa kata sandi." />

      {pending.length > 0 && (
        <Section id="reset-title" title="Permintaan tautan akses" icon="key" action={<Chip tone="warning">{pending.length} menunggu</Chip>}>
          <div className="card card--flush">
            <ul className="rows">
              {pending.map((x) => (
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

      <Section id="add-title" title="Tambah anggota" icon="user-plus">
        <div className="card">
          <CreateMemberForm roles={(r.data ?? []) as { id: string; name: string }[]} />
        </div>
      </Section>

      <Section id="list-title" title="Daftar anggota" icon="users" action={<Chip tone="outline">{rows.length} orang</Chip>}>
        {rows.length === 0 ? (
          <div className="card"><EmptyState icon="users" title="Belum ada anggota" compact>Tambahkan anggota pertama lewat formulir di atas.</EmptyState></div>
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
                  <MemberStatusChip status={x.status} />
                  <div className="row__actions">
                    <LinkButton href={`/settings/members/${x.user_id}`} variant="secondary" size="sm" icon="pencil">Kelola</LinkButton>
                    <IssueLinkForm userId={x.user_id} size="sm" />
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
