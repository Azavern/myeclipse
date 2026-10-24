'use client';
import { useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

// Menyembunyikan penanda suntingan hanya secara visual; konten tersimpan tidak berubah.
export function HighlightToggle({ children, count }: { children: ReactNode; count: number }) {
  const [hidden, setHidden] = useState(false);
  return (
    <>
      {count > 0 && (
        <div className="toolbar kb-highlight-bar">
          <p className="muted">
            {count} bagian ditandai sebagai perubahan pada suntingan terakhir. Teks yang dihapus tidak ditampilkan.
          </p>
          <button type="button" className="btn btn--ghost btn--sm" aria-pressed={hidden}
            onClick={() => setHidden((v) => !v)}>
            {hidden ? 'Tampilkan penanda' : 'Sembunyikan penanda'}
          </button>
        </div>
      )}
      <div className={cx('kb-body', hidden && 'kb-hide-marks')}>{children}</div>
    </>
  );
}
