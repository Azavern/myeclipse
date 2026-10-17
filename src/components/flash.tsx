'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { FLASH, isFlashKey } from '@/lib/flash';

// Toast setelah redirect dari Server Action. Wadah selalu ada di DOM agar pembaca layar mengumumkan pesan yang muncul belakangan.
export function FlashToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const [msg, setMsg] = useState<string | null>(null);
  const key = params.get('flash');

  useEffect(() => {
    if (!isFlashKey(key)) return;
    setMsg(FLASH[key]);
    const next = new URLSearchParams(window.location.search);
    next.delete('flash');
    const qs = next.toString();
    window.history.replaceState(window.history.state, '', `${pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, [key, pathname]);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 5000);
    return () => window.clearTimeout(t);
  }, [msg]);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {msg && (
        <div className="toast">
          <Icon name="check-circle" size={20} />
          <span>{msg}</span>
          <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Tutup pesan" onClick={() => setMsg(null)}><Icon name="x" size={16} /></button>
        </div>
      )}
    </div>
  );
}
