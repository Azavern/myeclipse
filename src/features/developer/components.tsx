'use client';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { keyFileName } from '@/lib/api/key-file';
import { scopeFor, type ApiPermissions, type ApiScope } from '@/lib/api/permissions';
import {
  API_ACTIONS, API_RESOURCES, SCOPE_LABEL, SCOPED_RESOURCES,
  type ApiAction,
} from '@/lib/api/resources';
import {
  createApiKey, deleteApiKey, revokeApiKey, rotateApiKey, setApiKeyStatus, updateApiKey,
  type KeyActionState, type KeyFormState,
} from './actions';

const ACTION_LABEL: Record<ApiAction, string> = {
  read: 'Baca', create: 'Buat', update: 'Ubah', delete: 'Hapus',
};

export type MemberOption = { id: string; name: string };

export function ApiKeyForm({ mode, id, defaults, members, disabled }: {
  mode: 'create' | 'update';
  id?: string;
  defaults?: { name: string; permissions: ApiPermissions; scope: ApiScope; memberIds: string[] };
  members: MemberOption[];
  disabled?: boolean;
}) {
  const action = mode === 'create' ? createApiKey : updateApiKey;
  const [state, act, pending] = useActionState<KeyFormState, FormData>(action, null);
  const error = state && !state.ok ? state.error.message : null;
  const secret = state?.ok ? state.data.secret : null;
  const [revealed, setRevealed] = useState(true);

  useEffect(() => {
    if (secret) setRevealed(true);
  }, [secret]);

  const permissions = defaults?.permissions ?? {};
  const scope = defaults?.scope ?? {};
  const memberIds = new Set(defaults?.memberIds ?? []);
  const busy = pending || disabled;

  return (
    <form className="form" action={act} aria-busy={pending}>
      {id && <input type="hidden" name="id" value={id} />}
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {state?.ok && !secret && <Notice tone="success" role="status">Perubahan API key tersimpan.</Notice>}

      {secret && revealed && (
        <div className="api-secret" role="status">
          <Notice tone="success">
            API key dibuat. Salin sekarang — secret hanya ditampilkan sekali dan tidak bisa dilihat lagi.
          </Notice>
          <div className="copy-row">
            <input readOnly value={secret} className="key-code" aria-label="Secret API key"
              onFocus={(event) => event.currentTarget.select()} />
            <CopyButton text={secret} label="Salin key" />
          </div>
          <button type="button" className="link-btn" onClick={() => setRevealed(false)}>Sembunyikan secret</button>
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="api-key-name">
          Nama API key<span className="req" aria-hidden="true">*</span>
          <span className="sr-only"> (wajib diisi)</span>
        </label>
        <input id="api-key-name" name="name" required maxLength={60} defaultValue={defaults?.name ?? ''}
          placeholder="Misalnya: Bot pengingat tugas" autoComplete="off" disabled={busy} />
        <p className="field__hint">Hanya untuk membedakan key di daftar. Tidak memengaruhi izin.</p>
      </div>

      <section className="stack stack--sm" aria-labelledby="api-permissions-title">
        <div>
          <h3 id="api-permissions-title">Izin operasi</h3>
          <p className="muted">Centang operasi yang boleh dilakukan key ini. Tanpa centang berarti ditolak.</p>
        </div>
        <div className="api-matrix-wrap">
          <table className="api-matrix">
            <thead>
              <tr>
                <th scope="col">Resource</th>
                {API_ACTIONS.map((action) => <th key={action} scope="col">{ACTION_LABEL[action]}</th>)}
              </tr>
            </thead>
            <tbody>
              {API_RESOURCES.map((resource) => (
                <tr key={resource.key}>
                  <th scope="row">
                    {resource.label}
                    <span className="api-matrix__scope">{resource.description}</span>
                  </th>
                  {API_ACTIONS.map((action) => {
                    const supported = resource.actions.includes(action);
                    return (
                      <td key={action}>
                        {supported ? (
                          <input type="checkbox" name={`p:${resource.key}:${action}`} value="1"
                            defaultChecked={permissions[resource.key]?.[action] === true}
                            aria-label={`${ACTION_LABEL[action]} ${resource.label}`} disabled={busy} />
                        ) : (
                          <span className="muted" aria-hidden="true">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack stack--sm" aria-labelledby="api-scope-title">
        <div>
          <h3 id="api-scope-title">Cakupan data</h3>
          <p className="muted">
            Cakupan menentukan baris siapa yang boleh dibaca. Penulisan portfolio, tautan sosial, dan inventory
            hanya berlaku untuk data pemilik key.
          </p>
        </div>
        <div className="api-scopes">
          {SCOPED_RESOURCES.map((resource) => {
            const selectId = `scope-${resource.key}`;
            return (
              <div className="field" key={resource.key}>
                <label className="field__label" htmlFor={selectId}>{resource.label}</label>
                <select id={selectId} name={`s:${resource.key}`} defaultValue={scopeFor(scope, resource.key)}
                  disabled={busy}>
                  {resource.scopeOptions.map((value) => (
                    <option key={value} value={value}>{SCOPE_LABEL[value]}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </section>

      <details className="card" open={memberIds.size > 0}>
        <summary className="card__title">Anggota tertentu ({memberIds.size} dipilih)</summary>
        <p className="card__desc">
          Dipakai bila cakupan anggota, profil, portofolio, tautan sosial, atau inventory diset ke
          “Anggota tertentu”. Hanya anggota aktif yang ditampilkan.
        </p>
        {members.length === 0 ? (
          <p className="muted">Belum ada anggota aktif.</p>
        ) : (
          <div className="api-members" role="group" aria-label="Anggota dalam cakupan">
            {members.map((member) => (
              <label className="checklist__label" key={member.id}>
                <input type="checkbox" name="member_ids" value={member.id}
                  defaultChecked={memberIds.has(member.id)} disabled={busy} />
                <span className="checklist__text"><span className="checklist__title">{member.name}</span></span>
              </label>
            ))}
          </div>
        )}
      </details>

      <div className="form__actions">
        <button type="submit" className="btn" disabled={busy}>
          {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
          {pending ? 'Menyimpan…' : mode === 'create' ? 'Buat API key' : 'Simpan perubahan'}
        </button>
      </div>
    </form>
  );
}

const failure = (state: KeyActionState) => (state && !state.ok ? state.error.message : null);

export function KeyLifecycle({ id, status }: { id: string; status: string }) {
  const [statusState, statusAct, statusPending] = useActionState<KeyActionState, FormData>(setApiKeyStatus, null);
  const [revokeState, revokeAct, revokePending] = useActionState<KeyActionState, FormData>(revokeApiKey, null);
  const [deleteState, deleteAct, deletePending] = useActionState<KeyActionState, FormData>(deleteApiKey, null);
  const revokeDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const revokeTitle = useId();
  const deleteTitle = useId();
  const error = failure(statusState) ?? failure(revokeState) ?? failure(deleteState);

  useEffect(() => {
    if (revokeState?.ok) revokeDialog.current?.close();
  }, [revokeState]);

  if (status === 'revoked') {
    return (
      <div className="card danger-zone">
        <div className="card__head">
          <div>
            <h2 className="card__title">API key sudah dicabut</h2>
            <p className="card__desc">Key ini tidak bisa diaktifkan kembali. Hapus barisnya bila sudah tidak diperlukan.</p>
          </div>
        </div>
        {error && <Notice tone="error" role="alert">{error}</Notice>}
        <div className="form__actions">
          <button type="button" className="btn btn--danger-soft" onClick={() => deleteDialog.current?.showModal()}>
            <Icon name="trash" size={18} />Hapus key
          </button>
        </div>
        <dialog ref={deleteDialog} aria-labelledby={deleteTitle}
          onClick={(event) => { if (event.target === event.currentTarget && !deletePending) deleteDialog.current?.close(); }}>
          <form action={deleteAct} aria-busy={deletePending}>
            <input type="hidden" name="id" value={id} />
            <div className="dialog__body">
              <span className="tile tile--error" aria-hidden="true"><Icon name="alert-triangle" size={22} /></span>
              <h2 id={deleteTitle}>Hapus API key ini?</h2>
              <p className="muted">Riwayat audit tetap disimpan, tetapi key dan cakupannya dihapus permanen.</p>
            </div>
            <div className="dialog__actions">
              <button type="button" className="btn btn--secondary" disabled={deletePending}
                onClick={() => deleteDialog.current?.close()}>Batal</button>
              <button type="submit" className="btn btn--danger" disabled={deletePending}>
                {deletePending && <Icon name="loader" size={18} className="spin" />}
                {deletePending ? 'Menghapus…' : 'Hapus permanen'}
              </button>
            </div>
          </form>
        </dialog>
      </div>
    );
  }

  return (
    <div className="card danger-zone">
      <div className="card__head">
        <div>
          <h2 className="card__title">Status dan pencabutan</h2>
          <p className="card__desc">Menonaktifkan key berlaku segera. Pencabutan tidak dapat dibatalkan.</p>
        </div>
      </div>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      <div className="cluster">
        <form action={statusAct} aria-busy={statusPending}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={status === 'active' ? 'disabled' : 'active'} />
          <button type="submit" className="btn btn--secondary" disabled={statusPending}>
            {statusPending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="lock" size={18} />}
            {status === 'active' ? 'Nonaktifkan' : 'Aktifkan kembali'}
          </button>
        </form>
        <button type="button" className="btn btn--danger-soft" onClick={() => revokeDialog.current?.showModal()}>
          <Icon name="x" size={18} />Cabut permanen
        </button>
      </div>
      <dialog ref={revokeDialog} aria-labelledby={revokeTitle}
        onClick={(event) => { if (event.target === event.currentTarget && !revokePending) revokeDialog.current?.close(); }}>
        <form action={revokeAct} aria-busy={revokePending}>
          <input type="hidden" name="id" value={id} />
          <div className="dialog__body">
            <span className="tile tile--error" aria-hidden="true"><Icon name="alert-triangle" size={22} /></span>
            <h2 id={revokeTitle}>Cabut API key ini?</h2>
            <p className="muted">
              Semua aplikasi yang memakai key ini langsung kehilangan akses. Tindakan ini tidak dapat dibatalkan;
              buat key baru bila perlu.
            </p>
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={revokePending}
              onClick={() => revokeDialog.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={revokePending}>
              {revokePending && <Icon name="loader" size={18} className="spin" />}
              {revokePending ? 'Mencabut…' : 'Cabut key'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

// Rotasi kredensial: satu dialog dua keadaan — konfirmasi, lalu secret baru.
// Secret hanya hidup di state klien setelah rotasi; menutup dialog membuangnya
// dari tampilan sehingga tidak bisa dibuka lagi.
export function KeyRefresh({ id, name, author }: { id: string; name: string; author: string }) {
  const [state, act, pending] = useActionState<KeyFormState, FormData>(rotateApiKey, null);
  const [closedState, setClosedState] = useState<KeyFormState>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const secret = state?.ok && state !== closedState ? state.data.secret : null;
  const error = state && !state.ok ? state.error.message : null;

  useEffect(() => {
    if (secret && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [secret]);

  function download() {
    if (!secret) return;
    const payload = {
      name,
      key: secret,
      prefix: secret.slice(4, 16),
      author,
      generated_at: new Date().toISOString(),
      note: 'Secret ini hanya ditampilkan sekali oleh Eclipse. Simpan di tempat aman.',
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = keyFileName(name, author, new Date());
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h2 className="card__title">Refresh key</h2>
          <p className="card__desc">
            Buat prefix dan secret baru untuk key ini. Nama, izin, dan cakupan tetap; secret lama langsung tidak berlaku.
          </p>
        </div>
      </div>
      <div className="form__actions">
        <button type="button" className="btn btn--secondary" onClick={() => dialog.current?.showModal()}>
          <Icon name="refresh" size={18} />Refresh key
        </button>
      </div>
      <dialog ref={dialog} aria-labelledby={titleId}
        onClose={() => setClosedState(state)}
        onClick={(event) => { if (event.target === event.currentTarget && !pending) dialog.current?.close(); }}>
        {secret ? (
          <div className="dialog__body">
            <span className="tile tile--success" aria-hidden="true"><Icon name="key" size={22} /></span>
            <h2 id={titleId}>API key baru</h2>
            <p className="muted">
              Salin atau unduh sekarang. Secret hanya ditampilkan sekali dan tidak bisa dilihat lagi setelah popup ditutup.
            </p>
            <div className="copy-row">
              <input readOnly value={secret} className="key-code" aria-label="Secret API key"
                onFocus={(event) => event.currentTarget.select()} autoFocus />
            </div>
          </div>
        ) : (
          <form action={act} aria-busy={pending}>
            <input type="hidden" name="id" value={id} />
            <div className="dialog__body">
              <span className="tile" aria-hidden="true"><Icon name="refresh" size={22} /></span>
              <h2 id={titleId}>Buat key baru?</h2>
              <p className="muted">
                Aplikasi yang masih memakai key lama langsung gagal terautentikasi. Secret baru hanya tampil sekali,
                jadi salin atau unduh sebelum menutup popup ini.
              </p>
              {error && <Notice tone="error" role="alert">{error}</Notice>}
            </div>
            <div className="dialog__actions">
              <button type="button" className="btn btn--secondary" disabled={pending}
                onClick={() => dialog.current?.close()}>Batal</button>
              <button type="submit" className="btn" disabled={pending}>
                {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="refresh" size={18} />}
                {pending ? 'Membuat…' : 'Buat key baru'}
              </button>
            </div>
          </form>
        )}
        {secret && (
          <div className="dialog__actions">
            <CopyButton text={secret} label="Salin key" />
            <button type="button" className="btn btn--secondary" onClick={download}>
              <Icon name="download" size={18} />Unduh JSON
            </button>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>
              <Icon name="check" size={18} />Selesai
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
