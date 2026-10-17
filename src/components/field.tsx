'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import type { Field } from '@/features/fields';
import { cx } from '@/lib/cx';

// Satu isian formulir lengkap: label (tanda wajib terbaca pembaca layar), kontrol, petunjuk, pesan galat, dan penghitung karakter.
// Dipakai EntityForm dan formulir khusus (login, kata sandi) agar semua form tampil dan berperilaku sama.
export function FieldControl({ field: f, error, value, idPrefix = 'f' }: { field: Field; error?: string; value?: string; idPrefix?: string }) {
  const id = `${idPrefix}-${f.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const initial = value ?? f.value ?? '';
  const [len, setLen] = useState(initial.length);
  const [shown, setShown] = useState(false);
  const describedBy = [f.hint && `${id}-h`, error && `${id}-e`].filter(Boolean).join(' ') || undefined;
  const common = {
    id, name: f.name, required: f.required, 'aria-invalid': error ? (true as const) : undefined, 'aria-describedby': describedBy,
  };
  const counted = f.max !== undefined && (f.type === 'text' || f.type === 'textarea' || f.type === 'url');
  const track = counted ? { onInput: (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => setLen(e.currentTarget.value.length) } : {};

  let control: React.ReactNode;
  if (f.type === 'textarea') {
    control = <textarea {...common} {...track} rows={4} maxLength={f.max} placeholder={f.placeholder} defaultValue={initial} />;
  } else if (f.type === 'select') {
    control = <select {...common} defaultValue={initial}>{f.options?.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}</select>;
  } else if (f.type === 'password') {
    control = (
      <div className="password">
        <input {...common} type={shown ? 'text' : 'password'} maxLength={f.max} minLength={f.min} autoComplete={f.autoComplete} defaultValue={initial} />
        <button type="button" className="btn btn--ghost btn--icon password__toggle" aria-pressed={shown}
          aria-label={shown ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShown((v) => !v)}>
          <Icon name={shown ? 'eye-off' : 'eye'} size={20} />
        </button>
      </div>
    );
  } else {
    control = (
      <input {...common} {...track} type={f.type === 'datetime' ? 'datetime-local' : f.type} maxLength={f.max} minLength={f.min}
        placeholder={f.placeholder} autoComplete={f.autoComplete} defaultValue={initial} />
    );
  }

  return (
    <div className={cx('field', (f.full || f.type === 'textarea') && 'field--full')}>
      <label className="field__label" htmlFor={id}>
        {f.label}
        {f.required && <><span className="req" aria-hidden="true">*</span><span className="sr-only"> (wajib diisi)</span></>}
      </label>
      {control}
      {f.hint && <p id={`${id}-h`} className="field__hint">{f.hint}</p>}
      {error && <p id={`${id}-e`} className="field__error"><Icon name="alert-circle" size={16} /><span>{error}</span></p>}
      {counted && <span className="field__count" aria-hidden="true">{len}/{f.max}</span>}
    </div>
  );
}
