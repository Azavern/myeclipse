'use client';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { FieldControl } from '@/components/field';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import { signInWithPin } from '@/features/auth/pin-actions';
import { GoogleSignIn } from './google-signin';
import { signIn } from './actions';

const PASSWORD: Field = { name: 'password', label: 'Kata sandi', type: 'password', required: true, max: 72, autoComplete: 'current-password' };

export function LoginForm({ next, googleClientId }: { next: string; googleClientId: string | null }) {
  const [mode, setMode] = useState<'password' | 'pin'>('password');
  const [password, passwordAction, passwordPending] = useActionState(signIn, null);
  const [pin, pinAction, pinPending] = useActionState(signInWithPin, null);
  const active = mode === 'password' ? password : pin;
  const action = mode === 'password' ? passwordAction : pinAction;
  const pending = mode === 'password' ? passwordPending : pinPending;
  const email: Field = {
    name: 'email', label: 'Email', type: 'email', required: true, max: 254,
    autoComplete: 'username', placeholder: 'nama@email.com', value: active?.email ?? '',
  };

  return (
    <form action={action} aria-busy={pending} className="form">
      <input type="hidden" name="next" value={next} />
      <div className="segmented" role="group" aria-label="Cara masuk">
        <button type="button" aria-pressed={mode === 'password'} disabled={pending} onClick={() => setMode('password')}>
          Kata sandi
        </button>
        <button type="button" aria-pressed={mode === 'pin'} disabled={pending} onClick={() => setMode('pin')}>
          PIN
        </button>
      </div>
      {active?.error && <Notice tone="error" role="alert">{active.error}</Notice>}
      <FieldControl key={`${mode}-email-${active?.email ?? ''}`} field={email} />
      {mode === 'password' ? (
        <FieldControl key="password" field={PASSWORD} />
      ) : (
        <div className="field">
          <label className="field__label" htmlFor="login-pin">PIN</label>
          <input id="login-pin" name="pin" type="password" className="otp-input" inputMode="numeric"
            pattern="\d{6}" maxLength={6} autoComplete="off" required autoFocus disabled={pending} />
          <p className="field__hint">6 angka yang kamu atur di Keamanan akun.</p>
        </div>
      )}
      <button type="submit" className="btn btn--lg btn--block" disabled={pending}>
        {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="log-in" size={18} />}
        {pending ? 'Memproses…' : mode === 'password' ? 'Masuk' : 'Masuk dengan PIN'}
      </button>
      {mode === 'password' && googleClientId && (
        <>
          <p className="auth-divider">atau</p>
          <GoogleSignIn clientId={googleClientId} next={next} />
          <p className="field__hint">Masuk dengan Google hanya untuk email akun yang sudah terverifikasi.</p>
        </>
      )}
      {mode === 'password' ? (
        <p className="muted">Lupa kata sandi? <Link href="/forgot-password">Minta tautan akses baru</Link></p>
      ) : (
        <p className="muted">
          Lupa PIN? Masuk dengan kata sandi, lalu atur ulang PIN di <Link href="/settings/account">Keamanan akun</Link>.
        </p>
      )}
    </form>
  );
}
