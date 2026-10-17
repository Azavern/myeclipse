'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { FieldControl } from '@/components/field';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import { signIn } from './actions';

const PASSWORD: Field = { name: 'password', label: 'Kata sandi', type: 'password', required: true, max: 72, autoComplete: 'current-password' };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  const email: Field = { name: 'email', label: 'Email', type: 'email', required: true, max: 254, autoComplete: 'username', placeholder: 'nama@email.com', value: state?.email ?? '' };
  return (
    <form action={action} aria-busy={pending} className="form">
      <input type="hidden" name="next" value={next} />
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
      <FieldControl field={email} />
      <FieldControl field={PASSWORD} />
      <button type="submit" className="btn btn--lg btn--block" disabled={pending}>
        {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="log-in" size={18} />}{pending ? 'Memproses…' : 'Masuk'}
      </button>
      <p className="muted">Lupa kata sandi? <Link href="/forgot-password">Minta tautan akses baru</Link></p>
    </form>
  );
}
