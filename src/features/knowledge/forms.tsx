'use client';
import { useActionState, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import type { FormState } from '@/lib/form-state';
import { KB_VISIBILITY_HINT, KB_VISIBILITY_LABEL, KB_VISIBILITY_OPTIONS } from '@/lib/knowledge/labels';

type Action = (p: FormState, fd: FormData) => Promise<FormState>;

export function VisibilityForm({ action, entryId, current, back, allowReason = false }: {
  action: Action; entryId: string; current: string; back: string; allowReason?: boolean;
}) {
  const [state, act, pending] = useActionState(action, null);
  const [value, setValue] = useState(current);
  const fieldId = `kb-visibility-${entryId}`;
  return (
    <form action={act} className="inline-form kb-visibility">
      <input type="hidden" name="id" value={entryId} />
      <input type="hidden" name="back" value={back} />
      <div className="field">
        <label className="field__label" htmlFor={fieldId}>Siapa yang boleh membaca</label>
        <select id={fieldId} name="visibility" value={value} onChange={(e) => setValue(e.currentTarget.value)}>
          {KB_VISIBILITY_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <p className="field__hint">{KB_VISIBILITY_HINT[value] ?? KB_VISIBILITY_LABEL[value]}</p>
      </div>
      {allowReason && (
        <div className="field">
          <label className="field__label" htmlFor={`${fieldId}-reason`}>Alasan (opsional)</label>
          <input id={`${fieldId}-reason`} name="reason" maxLength={300} placeholder="Mis. permintaan penyembunyian data pribadi" />
          <p className="field__hint">Dicatat pada jejak audit, maksimal 300 karakter.</p>
        </div>
      )}
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
      <button type="submit" className="btn btn--secondary btn--sm" disabled={pending} aria-busy={pending}>
        {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="eye" size={16} />}
        {pending ? 'Menyimpan…' : 'Simpan visibilitas'}
      </button>
    </form>
  );
}

export function DecisionForm({ action, requestId, mode }: { action: Action; requestId: string; mode: 'author' | 'leader' }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <form action={act} className="inline-form">
      <input type="hidden" name="id" value={requestId} />
      <div className="cluster">
        <button type="submit" name="decision" value="approve" className="btn btn--sm" disabled={pending} aria-busy={pending}>
          {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="check" size={16} />}
          {mode === 'leader' ? 'Setujui (7 hari)' : 'Setujui'}
        </button>
        <button type="submit" name="decision" value="reject" className="btn btn--secondary btn--sm" disabled={pending}>
          <Icon name="x" size={16} />Tolak
        </button>
      </div>
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </form>
  );
}

export function EscalateForm({ action, requestId }: { action: Action; requestId: string }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <details className="kb-escalate">
      <summary className="link-btn">Penulis tidak merespons — teruskan ke Ketua</summary>
      <form action={act} className="stack stack--sm">
        <input type="hidden" name="id" value={requestId} />
        <div className="field">
          <label className="field__label" htmlFor={`esc-${requestId}`}>Alasan eskalasi</label>
          <textarea id={`esc-${requestId}`} name="reason" required minLength={5} maxLength={500} rows={3}
            placeholder="Jelaskan mengapa permintaan perlu ditinjau Ketua." />
          <p className="field__hint">5–500 karakter. Alasan dicatat pada jejak audit.</p>
        </div>
        {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
        <button type="submit" className="btn btn--secondary btn--sm" disabled={pending} aria-busy={pending}>
          {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="key" size={16} />}
          {pending ? 'Mengirim…' : 'Teruskan ke Ketua'}
        </button>
      </form>
    </details>
  );
}

export function ArchiveForm({ action, entryId }: { action: Action; entryId: string }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <form action={act} className="inline-form">
      <input type="hidden" name="id" value={entryId} />
      <button type="submit" className="btn btn--secondary btn--sm" disabled={pending} aria-busy={pending}>
        {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="archive" size={16} />}
        {pending ? 'Mengarsipkan…' : 'Arsipkan entri'}
      </button>
      <p className="field__hint">Entri hilang dari penjelajah. Kamu dapat menerbitkannya lagi kapan saja.</p>
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </form>
  );
}

export function RevokeForm({ action, entryId, userId }: { action: Action; entryId: string; userId: string }) {
  const [state, act, pending] = useActionState(action, null);
  return (
    <form action={act} className="inline-form">
      <input type="hidden" name="entry" value={entryId} />
      <input type="hidden" name="user" value={userId} />
      <button type="submit" className="btn btn--danger-soft btn--sm" disabled={pending} aria-busy={pending}>
        {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="x" size={16} />}
        {pending ? 'Mencabut…' : 'Cabut akses'}
      </button>
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </form>
  );
}
