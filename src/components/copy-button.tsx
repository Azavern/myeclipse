'use client';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cx } from '@/lib/cx';

// Menyalin teks ke papan klip. Bila tidak tersedia (mis. konteks tidak aman),
// tampilkan kegagalan alih-alih mengklaim berhasil.
export function CopyButton({ text, label = 'Salin', className }: { text?: string; label?: string; className?: string }) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text ?? window.location.href);
      setStatus('ok');
      window.setTimeout(() => setStatus('idle'), 2200);
    } catch {
      setStatus('fail');
    }
  }
  return (
    <span className={cx('copy-btn', className)}>
      <button type="button" className="btn btn--secondary btn--sm" onClick={copy}>
        <Icon name={status === 'ok' ? 'check' : 'copy'} size={16} />
        {status === 'ok' ? 'Tersalin' : status === 'fail' ? 'Gagal menyalin' : label}
      </button>
      <span className="sr-only" role="status">{status === 'ok' ? 'Teks tersalin ke papan klip.' : status === 'fail' ? 'Teks gagal disalin.' : ''}</span>
    </span>
  );
}
