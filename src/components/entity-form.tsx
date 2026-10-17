'use client';
import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { FieldControl } from '@/components/field';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import { cx } from '@/lib/cx';
import type { FormState } from '@/lib/form-state';

type Action = (p: FormState, fd: FormData) => Promise<FormState>;

// Formulir generik berbasis daftar Field: validasi tampil per isian, fokus pindah ke isian pertama yang salah,
// isian tidak hilang saat galat (state.values), tombol terkunci selama menyimpan, dan peringatan bila meninggalkan form yang belum disimpan.
export function EntityForm({ action, fields, submit, hidden, cancelHref, sticky, columns = 2, footer }: {
  action: Action; fields: Field[]; submit: string; hidden?: Record<string, string>;
  cancelHref?: string; sticky?: boolean; columns?: 1 | 2; footer?: ReactNode;
}) {
  const [state, act, pending] = useActionState(action, null);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (bad ?? alertRef.current)?.focus();
  }, [state]);

  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  return (
    <form ref={formRef} action={act} aria-busy={pending} className="form" onInput={() => setDirty(true)}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state?.error && <div ref={alertRef} tabIndex={-1}><Notice tone="error" role="alert">{state.error}</Notice></div>}
      <div className={cx('form__grid', columns === 2 && 'form__grid--2')}>
        {fields.map((f, i) => (
          <FieldGroup key={f.name} field={f} prev={fields[i - 1]}>
            <FieldControl field={f} error={state?.fieldErrors?.[f.name]?.[0]} value={state?.values?.[f.name]} />
          </FieldGroup>
        ))}
      </div>
      {footer}
      <div className={cx('form__actions', sticky && 'form__actions--sticky')}>
        {dirty && !pending && <span className="form__legend">Ada perubahan yang belum disimpan.</span>}
        {cancelHref && <Link href={cancelHref} className="btn btn--secondary">Batal</Link>}
        <button type="submit" className="btn" disabled={pending} aria-busy={pending}>
          {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
          {pending ? 'Menyimpan…' : submit}
        </button>
      </div>
    </form>
  );
}

// Judul kelompok muncul sekali saat `group` berubah.
function FieldGroup({ field, prev, children }: { field: Field; prev?: Field; children: ReactNode }) {
  return (
    <>
      {field.group && field.group !== prev?.group && <h3 className="form__group">{field.group}</h3>}
      {children}
    </>
  );
}

// Penghapusan selalu lewat dialog konfirmasi yang menyebut akibatnya (AGENTS.md §7). showModal() memfokuskan kontrol pertama, yaitu "Batal", sehingga Enter tidak langsung menghapus.
export function DeleteButton({ action, id, hidden, consequence, title = 'Hapus data ini?', label = 'Hapus', confirmLabel = 'Hapus permanen', permanent = true, size }: {
  action: Action; id?: string; hidden?: Record<string, string>; consequence: string; title?: string; label?: string;
  confirmLabel?: string; permanent?: boolean; size?: 'sm';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, act, pending] = useActionState(action, null);
  const titleId = `del-${id ?? label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <>
      <button type="button" className={cx('btn btn--danger-soft', size && `btn--${size}`)} onClick={() => ref.current?.showModal()}>
        <Icon name="trash" size={18} />{label}
      </button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(e) => { if (e.target === e.currentTarget && !pending) ref.current?.close(); }}>
        <form action={act} aria-busy={pending}>
          <div className="dialog__body">
            <span className="tile tile--error" aria-hidden="true"><Icon name="alert-triangle" size={22} /></span>
            <h2 id={titleId}>{title}</h2>
            <p className="muted">{consequence}{permanent && ' Tindakan ini tidak dapat dibatalkan.'}</p>
            {id && <input type="hidden" name="id" value={id} />}
            {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={pending} aria-busy={pending}>
              {pending && <Icon name="loader" size={18} className="spin" />}{pending ? 'Menghapus…' : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
