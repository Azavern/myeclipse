import { notFound, redirect } from 'next/navigation';
import { DeleteButton, EntityForm } from '@/components/entity-form';
import { NoAccess } from '@/components/states';
import { Icon, type IconName } from '@/components/ui/icon';
import { Notice, PageHeader } from '@/components/ui/primitives';
import { memberIdentityFields, memberRoleFields, memberStatusFields, type Row } from '@/features/fields';
import { changeMemberRole, deleteMember, setMemberStatus, updateMemberIdentity } from '@/features/members/actions';
import { IssueLinkForm } from '@/features/members/components';
import { MemberStatusChip } from '@/features/members/member-card';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

function Panel({ id, icon, title, desc, children }: { id: string; icon: IconName; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card" aria-labelledby={id}>
      <div className="card__head">
        <div>
          <h2 id={id} className="card__title"><Icon name={icon} size={20} />{title}</h2>
          {desc && <p className="card__desc">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function ManageMember({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/login?next=${encodeURIComponent(`/settings/members/${id}`)}`);
  if (!viewer.can('members.manage')) return <NoAccess />;
  const supabase = await createClient();
  const [m, r] = await Promise.all([
    supabase.from('member_profile_v').select('user_id,full_name,username,role_id,status').eq('user_id', id).maybeSingle(),
    supabase.from('roles').select('id,name').order('name'),
  ]);
  const p = m.data as Row | null;
  if (m.error || !p) notFound();
  const roles = ((r.data ?? []) as { id: string; name: string }[]).map((x): [string, string] => [x.id, x.name]);
  const self = id === viewer.user.id;
  const status = String(p.status);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Anggota', href: '/settings/members' }, { label: String(p.full_name) }]}
        icon="user"
        title={String(p.full_name)}
        description={`@${String(p.username)}`}
        actions={<MemberStatusChip status={status} />}
      />
      <div className="stack">
        <Panel id="identity-title" icon="pencil" title="Nama dan username" desc="Username menjadi alamat profil anggota.">
          <EntityForm action={updateMemberIdentity} fields={memberIdentityFields(p)} submit="Simpan" hidden={{ id }} />
        </Panel>

        <Panel id="role-title" icon="shield" title="Role" desc="Role menentukan apa yang boleh dikelola anggota ini.">
          <EntityForm action={changeMemberRole} fields={memberRoleFields(p, roles)} submit="Ubah role" hidden={{ id }} columns={1} />
        </Panel>

        {status !== 'invited' && !self && (
          <Panel id="status-title" icon="lock" title="Status akun">
            <EntityForm action={setMemberStatus} fields={memberStatusFields(p)} submit="Ubah status" hidden={{ id }} columns={1} />
          </Panel>
        )}

        <Panel id="access-title-panel" icon="key" title="Tautan akses" desc="Untuk anggota yang baru ditambahkan atau lupa kata sandi. Tautan lama tetap berlaku sampai kedaluwarsa.">
          <IssueLinkForm userId={id} />
        </Panel>

        <section className="card danger-zone" aria-labelledby="danger-title">
          <div className="card__head">
            <h2 id="danger-title" className="card__title"><Icon name="alert-triangle" size={20} />Hapus anggota</h2>
          </div>
          {self ? (
            <Notice tone="info">Akunmu sendiri tidak bisa dinonaktifkan atau dihapus dari sini.</Notice>
          ) : (
            <div className="zone">
              <p className="muted">Profil, portofolio, dan tautan sosial anggota ini akan dihapus permanen.</p>
              <DeleteButton action={deleteMember} id={id} title={`Hapus ${String(p.full_name)}?`} consequence="Profil, portofolio, dan tautan sosial anggota ini akan dihapus permanen." confirmLabel="Hapus anggota" />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
