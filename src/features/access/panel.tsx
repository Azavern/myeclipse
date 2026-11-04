'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Avatar, Chip } from '@/components/ui/primitives';
import { AccessToggle, MemberAccessToggle } from './components';
import { ACCESS_ITEMS, FULL_MEMBER_ACCESS, MEMBER_ACCESS_ITEMS } from './permissions';

export type AccessRole = { id: string; key: string; name: string; permissions: string[] };
export type AccessMember = { id: string; name: string; username: string };

// Dialog baca-saja untuk akses Ketua. Kartunya tidak lagi duduk di grid jabatan
// supaya halaman hanya menampilkan jabatan yang benar-benar bisa diatur.
export function RootAccessDialog({ role }: { role?: AccessRole }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  if (!role) return null;

  return (
    <>
      <button type="button" className="btn btn--secondary" aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}>
        <Icon name="lock" size={18} />Root Access
      </button>
      <dialog ref={ref} className="dialog--read" aria-labelledby={titleId}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="dialog__body">
          <h2 className="card__title" id={titleId}>
            Akses {role.name}<Chip tone="brand" icon="lock">Tetap</Chip>
          </h2>
          <p className="card__desc">
            Akses Ketua bersifat tetap agar kelas selalu punya pengelola. Tidak ada yang dapat mengubahnya,
            termasuk Ketua sendiri.
          </p>
          <ul className="checklist checklist--locked">
            {ACCESS_ITEMS.map((item) => (
              <li key={item.key} className="checklist__item">
                <label className="checklist__label">
                  <input type="checkbox" checked={role.permissions.includes(item.key)} disabled readOnly />
                  <span className="checklist__text">
                    <span className="checklist__title">{item.label}</span>
                    <span className="checklist__hint">{item.hint}</span>
                  </span>
                </label>
              </li>
            ))}
            <li className="checklist__item">
              <label className="checklist__label">
                <input type="checkbox" checked disabled readOnly />
                <span className="checklist__text">
                  <span className="checklist__title">{FULL_MEMBER_ACCESS.label}</span>
                  <span className="checklist__hint">
                    Tambah anggota, ubah identitas dan status, terbitkan tautan akses, serta ubah jabatan
                    tanpa persetujuan.
                  </span>
                </span>
              </label>
            </li>
          </ul>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Tutup</button>
        </div>
      </dialog>
    </>
  );
}

// Keterangan akses per anggota dikumpulkan di satu tempat ini, bukan diulang di
// setiap kartu anggota.
function MemberAccessGuide() {
  return (
    <>
      <p className="card__desc">
        Beri akses tambahan kepada anggota yang rolenya <strong>member</strong>. Akses berlaku per orang
        dan terpisah dari akses jabatan.
      </p>
      <ul className="checklist">
        {MEMBER_ACCESS_ITEMS.map((item) => (
          <li key={item.key} className="checklist__item">
            <div className="checklist__text">
              <span className="checklist__title">{item.label}</span>
              <span className="checklist__hint">{item.hint}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="card__desc">
        Event hanya dapat diubah untuk event buatannya sendiri; tugas yang ia buat baru tampil ke anggota
        lain setelah disetujui Ketua.
      </p>
    </>
  );
}

export function MemberAccessInfo() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" aria-haspopup="dialog"
        onClick={() => ref.current?.showModal()}>
        <Icon name="info" size={16} />Info akses
      </button>
      <dialog ref={ref} className="dialog--read" aria-labelledby={titleId}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="dialog__body">
          <h2 className="card__title" id={titleId}>Akses khusus anggota</h2>
          <MemberAccessGuide />
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Tutup</button>
        </div>
      </dialog>
    </>
  );
}

// Baris anggota: satu kartu horizontal per orang, ditumpuk ke bawah seperti tabel.
export function MemberAccessList({ members, grants }: { members: AccessMember[]; grants: string[] }) {
  const granted = new Set(grants);
  if (members.length === 0) return <p className="muted">Belum ada anggota dengan role member.</p>;

  return (
    <div className="stack stack--sm">
      {members.map((member) => (
        <div key={member.id} className="card access-row">
          <div className="access-row__who">
            <Avatar name={member.name} size="sm" />
            <span className="access-row__name">
              {member.name}
              <span className="access-row__username">{member.username ? `@${member.username}` : 'role member'}</span>
            </span>
          </div>
          <ul className="checklist access-row__perms" aria-label={`Akses ${member.name}`}>
            {MEMBER_ACCESS_ITEMS.map((item) => (
              <MemberAccessToggle key={item.key} userId={member.id} permissionKey={item.key}
                label={item.label} checked={granted.has(`${member.id}:${item.key}`)} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Di ponsel, tiga kartu jabatan diganti tombol yang membuka dialog; di layar
// lebar kartunya tetap tampil utuh. Satu sumber data, dua cara menampilkan.
export function AccessPanel({ roles, members, grants }: {
  roles: AccessRole[]; members: AccessMember[]; grants: string[];
}) {
  const [openRoleId, setOpenRoleId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const roleRef = useRef<HTMLDialogElement>(null);
  const membersRef = useRef<HTMLDialogElement>(null);
  const roleTitleId = useId();
  const membersTitleId = useId();

  // Izin diambil dari props, bukan dari state, agar nilai centang ikut segar
  // setelah server mengirim ulang halaman.
  const openRole = roles.find((role) => role.id === openRoleId) ?? null;

  useEffect(() => {
    if (openRole && roleRef.current && !roleRef.current.open) roleRef.current.showModal();
  }, [openRole]);
  useEffect(() => {
    if (membersOpen && membersRef.current && !membersRef.current.open) membersRef.current.showModal();
  }, [membersOpen]);

  return (
    <>
      <div className="access-buttons">
        {roles.map((role) => (
          <button key={role.id} type="button" className="btn btn--secondary access-buttons__item"
            aria-haspopup="dialog" onClick={() => setOpenRoleId(role.id)}>
            <span>{role.name}</span>
            <span className="cluster muted">
              {role.permissions.filter((p) => ACCESS_ITEMS.some((item) => item.key === p)).length}/{ACCESS_ITEMS.length}
              <Icon name="chevron-right" size={18} />
            </span>
          </button>
        ))}
        <button type="button" className="btn btn--secondary access-buttons__item"
          aria-haspopup="dialog" onClick={() => setMembersOpen(true)}>
          <span>Akses khusus anggota</span>
          <span className="cluster muted">{members.length}<Icon name="chevron-right" size={18} /></span>
        </button>
      </div>

      <div className="access-grid access-desktop">
        {roles.map((role) => (
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
      </div>

      <dialog ref={roleRef} className="dialog--read" aria-labelledby={roleTitleId}
        onClose={() => setOpenRoleId(null)}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="dialog__body">
          {openRole && (
            <>
              <h2 className="card__title" id={roleTitleId}>Akses {openRole.name}</h2>
              <p className="card__desc">Perubahan tersimpan begitu centang diubah.</p>
              <ul className="checklist">
                {ACCESS_ITEMS.map((item) => (
                  <AccessToggle key={item.key} roleId={openRole.id} permissionKey={item.key}
                    label={item.label} hint={item.hint} checked={openRole.permissions.includes(item.key)} />
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => roleRef.current?.close()}>Tutup</button>
        </div>
      </dialog>

      <dialog ref={membersRef} className="dialog--read" aria-labelledby={membersTitleId}
        onClose={() => setMembersOpen(false)}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <div className="dialog__body">
          <h2 className="card__title" id={membersTitleId}>Akses khusus anggota</h2>
          <MemberAccessGuide />
          {membersOpen && <MemberAccessList members={members} grants={grants} />}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => membersRef.current?.close()}>Tutup</button>
        </div>
      </dialog>
    </>
  );
}
