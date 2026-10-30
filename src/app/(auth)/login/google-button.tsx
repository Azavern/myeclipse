'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';

// Navigasi biasa (bukan Link/prefetch) karena tujuannya route yang langsung
// mengalihkan ke Google; prefetch akan memulai alur OAuth tanpa klik pengguna.
export function GoogleButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a href={`/auth/google?next=${encodeURIComponent(next)}`} className="btn btn--secondary btn--lg btn--block"
      aria-busy={busy} aria-disabled={busy}
      onClick={(e) => {
        if (busy) { e.preventDefault(); return; }
        setBusy(true);
      }}>
      {busy
        ? <Icon name="loader" size={18} className="spin" />
        : <img src="/icons/google.svg" alt="" width={18} height={18} className="google-mark" />}
      {busy ? 'Menghubungkan…' : 'Masuk dengan Google'}
    </a>
  );
}
