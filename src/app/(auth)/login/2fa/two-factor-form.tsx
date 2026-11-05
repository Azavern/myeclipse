'use client';
import { useActionState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { cancelMfaLogin, verifyLoginTotp } from '@/features/auth/mfa-actions';

export function TwoFactorLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyLoginTotp, null);
  return (
    <form action={action} aria-busy={pending} className="form">
      <input type="hidden" name="next" value={next} />
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
      <div className="field">
        <label className="field__label" htmlFor="totp-code">Kode 6 angka</label>
        <input id="totp-code" name="code" className="otp-input" inputMode="numeric" autoComplete="one-time-code"
          pattern="\d{6}" maxLength={6} required autoFocus disabled={pending} />
        <p className="field__hint">Kode berlaku sekitar 30 detik. Bila ditolak, tunggu kode berikutnya lalu coba lagi.</p>
      </div>
      <button type="submit" className="btn btn--lg btn--block" disabled={pending}>
        {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="shield" size={18} />}
        {pending ? 'Memeriksa…' : 'Verifikasi dan masuk'}
      </button>
      <button type="submit" formAction={cancelMfaLogin} className="btn btn--ghost btn--block" disabled={pending}>
        <Icon name="log-out" size={18} />Batal dan keluar
      </button>
    </form>
  );
}
