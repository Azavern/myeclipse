'use client';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { FieldControl } from '@/components/field';
import { Icon } from '@/components/ui/icon';
import { Notice, btnClass } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import { createMember, issueAccessLink, issueResetLink, type LinkState } from './actions';

type Copy = 'idle' | 'ok' | 'fail';

// Tautan akses adalah kredensial: tampil sekali di dialog, tidak disimpan, dan hilang dari memori klien saat dialog ditutup.
function AccessDialog({ url, title, onClose }: { url: string | null; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<Copy>('idle');
  const uid = useId();

  useEffect(() => {
    const d = ref.current;
    if (url && d && !d.open) d.showModal();
  }, [url]);

  async function copyUrl() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopy('ok'); }
    catch { input.current?.select(); setCopy('fail'); } // izin papan klip ditolak: pilih teks agar bisa disalin manual
  }

  return (
    <dialog ref={ref} aria-labelledby={`${uid}-t`} onClose={() => { setCopy('idle'); onClose(); }}>
      {url && (
        <>
          <div className="dialog__body">
            <span className="tile tile--success" aria-hidden="true"><Icon name="key" size={22} /></span>
            <h2 id={`${uid}-t`}>{title}</h2>
            <Notice tone="warning">
              Tautan ini berlaku 24 jam, hanya tampil sekali, dan siapa pun yang memegangnya bisa masuk sebagai anggota ini.
              Kirim langsung ke orangnya, jangan ke grup.
            </Notice>
            <div className="field">
              <label className="field__label" htmlFor={`${uid}-u`}>Tautan akses</label>
              <div className="copy-row">
                <input id={`${uid}-u`} ref={input} readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn--secondary" onClick={copyUrl}>
                  <Icon name={copy === 'ok' ? 'check' : 'copy'} size={18} />{copy === 'ok' ? 'Tersalin' : 'Salin'}
                </button>
              </div>
            </div>
            <p className="sr-only" role="status">
              {copy === 'ok' ? 'Tautan disalin ke papan klip.' : copy === 'fail' ? 'Tidak bisa menyalin otomatis. Tautan sudah dipilih, salin secara manual.' : ''}
            </p>
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={() => ref.current?.close()}>Selesai</button>
          </div>
        </>
      )}
    </dialog>
  );
}

// Menyimpan URL hasil aksi hanya selama dialog terbuka. `state` baru (aksi baru) menggantikan URL lama.
// `gen` bertambah tiap aksi berhasil, dipakai untuk memasang ulang isian agar penghitung karakternya ikut kosong.
function useIssuedUrl(state: LinkState) {
  const [seen, setSeen] = useState<LinkState>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  if (state !== seen) { setSeen(state); setUrl(state?.ok ? state.data.url : null); if (state?.ok) setGen((g) => g + 1); }
  return [url, () => setUrl(null), gen] as const;
}

const failure = (s: LinkState) => (s && !s.ok ? s.error.message : null);

function LinkIssuer({ action, name, value, label, size, variant }: {
  action: typeof issueAccessLink; name: string; value: string; label: string; size?: 'sm'; variant?: 'secondary' | 'ghost';
}) {
  const [state, act, pending] = useActionState(action, null);
  const [url, clear] = useIssuedUrl(state);
  const error = failure(state);
  return (
    <div className="inline-form">
      <form action={act} aria-busy={pending}>
        <input type="hidden" name={name} value={value} />
        <button type="submit" className={btnClass({ variant: variant ?? 'secondary', size })} disabled={pending}>
          {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="key" size={18} />}
          {pending ? 'Menerbitkan…' : label}
        </button>
      </form>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      <AccessDialog url={url} title="Tautan akses siap dibagikan" onClose={clear} />
    </div>
  );
}

export function IssueLinkForm({ userId, size }: { userId: string; size?: 'sm' }) {
  return <LinkIssuer action={issueAccessLink} name="user_id" value={userId} label={size === 'sm' ? 'Tautan akses' : 'Terbitkan tautan akses'} size={size} />;
}

export function IssueResetForm({ requestId }: { requestId: string }) {
  return <LinkIssuer action={issueResetLink} name="id" value={requestId} label="Terbitkan tautan" size="sm" variant="secondary" />;
}

export function CreateMemberForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, act, pending] = useActionState(createMember, null);
  const [url, clear, gen] = useIssuedUrl(state);
  const [kept, setKept] = useState<Record<string, string>>({});
  const error = failure(state);
  const values = error ? kept : {}; // isian dipertahankan saat gagal, dikosongkan saat berhasil
  const fields: Field[] = [
    { name: 'full_name', label: 'Nama lengkap', type: 'text', required: true, max: 80, autoComplete: 'off' },
    { name: 'email', label: 'Email', type: 'email', required: true, max: 254, autoComplete: 'off', hint: 'Dipakai untuk masuk. Anggota menentukan kata sandinya sendiri lewat tautan akses.' },
    { name: 'role_id', label: 'Role', type: 'select', required: true, options: roles.map((r): [string, string] => [r.id, r.name]),
      value: (roles.find((r) => /^(member|anggota)$/i.test(r.name)) ?? roles[0])?.id ?? '', full: true },
  ];
  return (
    <>
      <form
        className="form"
        aria-busy={pending}
        action={(fd: FormData) => {
          setKept({ full_name: String(fd.get('full_name') ?? ''), email: String(fd.get('email') ?? ''), role_id: String(fd.get('role_id') ?? '') });
          act(fd);
        }}
      >
        {error && <Notice tone="error" role="alert">{error}</Notice>}
        <div className="form__grid form__grid--2">
          {fields.map((f) => <FieldControl key={`${f.name}-${gen}`} field={f} value={values[f.name]} idPrefix="new-member" />)}
        </div>
        <div className="form__actions">
          <button type="submit" className="btn" disabled={pending || roles.length === 0}>
            {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="user-plus" size={18} />}
            {pending ? 'Membuat…' : 'Tambah anggota'}
          </button>
        </div>
      </form>
      <AccessDialog url={url} title="Anggota ditambahkan" onClose={clear} />
    </>
  );
}
