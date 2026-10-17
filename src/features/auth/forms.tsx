'use client';
import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { FieldControl } from '@/components/field';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import { confirmAccessLink, requestPasswordReset, setPassword } from './actions';

const SubmitLabel = ({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) => (
  <>{pending && <Icon name="loader" size={18} className="spin" />}{pending ? busy : idle}</>
);

export function ConfirmAccessForm() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [state, action, pending] = useActionState(confirmAccessLink, null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get('token_hash');
    // Strict Mode menjalankan efek dua kali; putaran kedua melihat hash kosong
    // dan tidak boleh menimpa token yang sudah terbaca.
    if (t) {
      setToken(t);
      history.replaceState(null, '', window.location.pathname);
    }
    setChecked(true);
  }, []);

  return (
    <form action={action} aria-busy={pending} className="form">
      <input type="hidden" name="token_hash" value={token ?? ''} />
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
      {checked && !token && !state && (
        <Notice tone="warning" role="alert">Tautan ini tidak lengkap. Minta Ketua membuat tautan baru.</Notice>
      )}
      <button type="submit" className="btn btn--lg btn--block" disabled={pending || !token}>
        <SubmitLabel pending={pending} idle="Lanjutkan" busy="Memproses…" />
      </button>
    </form>
  );
}

const PASSWORD_FIELDS: Field[] = [
  { name: 'password', label: 'Kata sandi baru', type: 'password', required: true, min: 10, max: 72, hint: 'Minimal 10 karakter.', autoComplete: 'new-password' },
  { name: 'confirm', label: 'Ulangi kata sandi', type: 'password', required: true, max: 72, autoComplete: 'new-password' },
];
export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, null);
  return (
    <form action={action} aria-busy={pending} className="form">
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
      {PASSWORD_FIELDS.map((f) => <FieldControl key={f.name} field={f} />)}
      <button type="submit" className="btn btn--lg btn--block" disabled={pending}>
        <SubmitLabel pending={pending} idle="Simpan kata sandi" busy="Menyimpan…" />
      </button>
    </form>
  );
}

const EMAIL_FIELD: Field = { name: 'email', label: 'Email akunmu', type: 'email', required: true, max: 254, autoComplete: 'username', placeholder: 'nama@email.com' };
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  if (state?.message) {
    return (
      <div className="stack">
        <Notice tone="success" role="status">{state.message}</Notice>
        <Link href="/login" className="btn btn--secondary btn--block"><Icon name="arrow-left" size={18} />Kembali ke halaman masuk</Link>
      </div>
    );
  }
  return (
    <form action={action} aria-busy={pending} className="form">
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
      <FieldControl field={EMAIL_FIELD} />
      <button type="submit" className="btn btn--lg btn--block" disabled={pending}>
        <SubmitLabel pending={pending} idle="Kirim permintaan ke Ketua" busy="Mengirim…" />
      </button>
    </form>
  );
}
