'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { LIBRARY_COOLDOWN_TEXT } from '@/lib/library/view';

// Ditampilkan saat pembatas menolak pengambilan. Hitungan mundur dihitung dari
// sisa waktu server, bukan dari waktu muat halaman, lalu halaman dimuat ulang
// sekali ketika jeda selesai.
export function LibraryCooldown({ retryAfterMs, detail }: { retryAfterMs: number; detail?: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(retryAfterMs / 1000)));

  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearTimeout(timer);
  }, [left]);

  useEffect(() => {
    if (retryAfterMs <= 0 || left > 0) return;
    const timer = window.setTimeout(() => router.refresh(), 800);
    return () => window.clearTimeout(timer);
  }, [left, retryAfterMs, router]);

  return (
    <div className="library-cooldown" role="status" aria-live="polite">
      <p className="library-cooldown__title"><Icon name="clock" size={18} />{LIBRARY_COOLDOWN_TEXT}</p>
      <p className="library-cooldown__time nums">{left > 0 ? `${left} detik` : 'Siap dipakai'}</p>
      <p className="field__hint">
        {detail ?? 'Daftar file diambil ulang dari Google Drive setiap kali halaman dimuat atau popup dibuka, jadi ada batasnya. Halaman mencoba lagi sendiri setelah jeda selesai.'}
      </p>
    </div>
  );
}
