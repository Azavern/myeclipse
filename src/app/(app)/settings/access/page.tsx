import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Avatar, Chip, EmptyState, LinkButton, PageHeader, Section } from '@/components/ui/primitives';
import { AccessToggle, RoleDecision } from '@/features/access/components';
import { ACCESS_ITEMS, FULL_MEMBER_ACCESS } from '@/features/access/permissions';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/time';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Akses role' };

type Role = { id: string; key: string; name: string; permissions: string[] };
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

  const roles = ((rolesResult.data ?? []) as Role[])
    .filter((r) => ROLE_ORDER.includes(r.key))
    .sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key));
  const ketua = roles.find((r) => r.key === 'ketua');
  const others = roles.filter((r) => r.key !== 'ketua');
  const requests = (requestsResult.data ?? []) as Request[];

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
        actions={<LinkButton href="/settings/members" variant="secondary" icon="users">Daftar anggota</LinkButton>}
      />

      <Section id="access-title" title="Akses jabatan" icon="shield">
        <div className="access-grid">
          {others.map((role) => (
            <div key={role.id} className="card">
              <div className="card__head">
                <div>
                  <h3 className="card__title">{role.name}</h3>
                  <p className="card__desc">Perubahan tersimpan begitu centang diubah.</p>
                </div>
              </div>
              <ul className="checklist">
                {ACCESS_ITEMS.map((item) => (
                  <AccessToggle key={item.key} roleId={role.id} permissionKey={item.key}
                    label={item.label} hint={item.hint} checked={role.permissions.includes(item.key)} />
                ))}
              </ul>
            </div>
          ))}

          {ketua && (
            <div className="card card--tint">
              <div className="card__head">
                <div>
                  <h3 className="card__title">{ketua.name}</h3>
                  <p className="card__desc">Akses Ketua bersifat tetap agar kelas selalu punya pengelola.</p>
                </div>
                <Chip tone="brand" icon="lock">Tetap</Chip>
              </div>
              <ul className="checklist checklist--locked">
                {ACCESS_ITEMS.map((item) => (
                  <li key={item.key} className="checklist__item">
                    <span className="checklist__label">
                      <input type="checkbox" checked={ketua.permissions.includes(item.key)} disabled readOnly />
                      <span className="checklist__text">
                        <span className="checklist__title">{item.label}</span>
                        <span className="checklist__hint">{item.hint}</span>
                      </span>
                    </span>
                  </li>
                ))}
                <li className="checklist__item">
                  <span className="checklist__label">
                    <input type="checkbox" checked disabled readOnly />
                    <span className="checklist__text">
                      <span className="checklist__title">{FULL_MEMBER_ACCESS.label}</span>
                      <span className="checklist__hint">Tambah anggota, ubah identitas dan status, terbitkan tautan akses, serta ubah jabatan tanpa persetujuan.</span>
                    </span>
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>
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
