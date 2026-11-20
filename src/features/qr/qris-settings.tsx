'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice, btnClass } from '@/components/ui/primitives';
import type { FormState } from '@/lib/form-state';
import { removeQrStudioQris, saveQrStudioQris } from './actions';

function ErrorNotice({ state }: { state: FormState }) {
  return state?.error ? <Notice tone="error" role="alert">{state.error}</Notice> : null;
}

export function QrQrisForm({ hasQris }: { hasQris: boolean }) {
  const [state, act, pending] = useActionState(saveQrStudioQris, null);
  const id = useId();
  const [fileError, setFileError] = useState<string | null>(null);
  return (
    <form action={act} className="form kas-form kas-form--compact" aria-busy={pending}>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-file`}>
          {hasQris ? 'Ganti gambar QRIS donasi' : 'Unggah gambar QRIS donasi'}
          <span className="req" aria-hidden="true">*</span>
        </label>
        <input id={`${id}-file`} name="qris" type="file" accept="image/jpeg,image/png,image/webp" required
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) { setFileError(null); return; }
            if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
              event.currentTarget.value = '';
              setFileError('Gambar harus JPEG, PNG, atau WebP maksimal 2 MB.');
              return;
            }
            setFileError(null);
          }} />
        <p id={`${id}-hint`} className={fileError ? 'field__error' : 'field__hint'}>
          {fileError ?? 'JPEG/PNG/WebP, maksimal 2 MB. Hanya ditampilkan setelah tamu memilih donasi.'}
        </p>
      </div>
      <ErrorNotice state={state} />
      <div className="form__actions">
        <button type="submit" className={btnClass({})} disabled={pending} aria-busy={pending}>
          {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
          {pending ? 'Menyimpan…' : hasQris ? 'Ganti QRIS' : 'Simpan QRIS'}
        </button>
      </div>
    </form>
  );
}

export function RemoveQrStudioQrisDialog() {
  const [state, act, pending] = useActionState(removeQrStudioQris, null);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" className={btnClass({ variant: 'ghost', size: 'sm' })}
        onClick={() => ref.current?.showModal()}>
        <Icon name="trash" size={16} />Hapus QRIS donasi
      </button>
      <dialog ref={ref} aria-labelledby={`${id}-title`} onClick={(event) => {
        if (event.target === event.currentTarget && !pending) ref.current?.close();
      }}>
        <form action={act}>
          <div className="dialog__body">
            <h2 id={`${id}-title`}>Hapus QRIS donasi?</h2>
            <p className="muted">Tamu yang memilih donasi akan melihat pesan bahwa QRIS belum tersedia. QR Studio tetap bisa dipakai.</p>
            <ErrorNotice state={state} />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={pending}>
              {pending && <Icon name="loader" size={18} className="spin" />}
              {pending ? 'Menghapus…' : 'Hapus QRIS'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
