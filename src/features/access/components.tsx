'use client';
import { useActionState, useEffect, useId, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice, btnClass } from '@/components/ui/primitives';
import { decideRoleChange, requestRoleChange, toggleRoleAccess, type AccessState } from './actions';

const errorOf = (s: AccessState) => (s && !s.ok ? s.error.message : null);

// Satu baris checklist = satu form. Mencentang langsung mengirim aksi, tanpa
// tombol simpan; bila gagal, centang dikembalikan ke nilai dari server.
export function AccessToggle({ roleId, permissionKey, label, hint, checked }: {
  roleId: string; permissionKey: string; label: string; hint: string; checked: boolean;
}) {
  const [state, act, pending] = useActionState(toggleRoleAccess, null);
  const [on, setOn] = useState(checked);
  const id = useId();
  const error = errorOf(state);

  useEffect(() => setOn(checked), [checked]);
  useEffect(() => { if (state && !state.ok) setOn(checked); }, [state, checked]);

  return (
    <li className="checklist__item">
      <form action={act} aria-busy={pending}>
        <input type="hidden" name="role_id" value={roleId} />
        <input type="hidden" name="permission" value={permissionKey} />
        <label className="checklist__label" htmlFor={id}>
          <input id={id} type="checkbox" name="enabled" value="1" checked={on} disabled={pending}
            onChange={(e) => { setOn(e.currentTarget.checked); e.currentTarget.form?.requestSubmit(); }} />
          <span className="checklist__text">
            <span className="checklist__title">
              {label}
              {pending && <><Icon name="loader" size={14} className="spin" /><span className="sr-only">Menyimpan</span></>}
            </span>
            <span className="checklist__hint">{hint}</span>
          </span>
        </label>
        {error && <Notice tone="error" role="alert">{error}</Notice>}
      </form>
    </li>
  );
}

// Dua form berbagi state yang sama supaya tombol mana pun mengirim keputusan
// yang jelas lewat input tersembunyi, tanpa bergantung pada submitter.
export function RoleDecision({ id }: { id: string }) {
  const [state, act, pending] = useActionState(decideRoleChange, null);
  const error = errorOf(state);
  return (
    <div className="inline-form">
      <div className="cluster">
        <form action={act} aria-busy={pending}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="approve" value="1" />
          <button type="submit" className={btnClass({ size: 'sm' })} disabled={pending}>
            {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="check" size={16} />}
            {pending ? 'Memproses…' : 'Setujui'}
          </button>
        </form>
        <form action={act} aria-busy={pending}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="approve" value="0" />
          <button type="submit" className={btnClass({ variant: 'danger-soft', size: 'sm' })} disabled={pending}>
            <Icon name="x" size={16} />Tolak
          </button>
        </form>
      </div>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
    </div>
  );
}

// Formulir pengajuan pada daftar anggota untuk pemegang `members.request`.
// Setelah berhasil, baris diganti penanda menunggu sampai Ketua memutuskan.
export function RoleChangeRequest({ targetId, targetName, currentRoleId, options }: {
  targetId: string; targetName: string; currentRoleId: string;
  options: { id: string; key: string; name: string }[];
}) {
  const [state, act, pending] = useActionState(requestRoleChange, null);
  const id = useId();
  const error = errorOf(state);

  if (state?.ok) return <Chip tone="warning" icon="hourglass">Menunggu persetujuan</Chip>;

  return (
    <div className="inline-form">
      <form action={act} className="role-request" aria-busy={pending}>
        <input type="hidden" name="target_id" value={targetId} />
        <label className="sr-only" htmlFor={id}>Jabatan baru untuk {targetName}</label>
        <select id={id} name="role_id" defaultValue="" required disabled={pending}>
          <option value="" disabled>Pilih jabatan</option>
          {options.filter((o) => o.id !== currentRoleId)
            .map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <button type="submit" className={btnClass({ variant: 'secondary', size: 'sm' })} disabled={pending}>
          {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="arrow-right" size={16} />}
          {pending ? 'Mengirim…' : 'Ajukan'}
        </button>
      </form>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
    </div>
  );
}
