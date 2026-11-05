'use client';
import { useActionState, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import type { FormState } from '@/lib/form-state';
import type { LibraryPickerItem } from './data';

type Action = (p: FormState, fd: FormData) => Promise<FormState>;

// Pemilih satu gambar dari Library untuk dipakai di form lain. Pilihan ditandai
// radio + bingkai, dan server menyalin objeknya sehingga item Library tetap utuh.
export function LibraryPicker({ items, action, hidden, title = 'Gunakan dari Library', description = 'Pilih gambar yang sudah pernah kamu unggah. Gambar disalin ke form ini; item Library tetap bisa dipakai lagi.', trigger = 'Pilih dari Library' }: {
  items: LibraryPickerItem[]; action: Action; hidden?: Record<string, string>;
  title?: string; description?: string; trigger?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [state, act, pending] = useActionState(action, null);

  return (
    <>
      <button type="button" className="btn btn--secondary" onClick={() => ref.current?.showModal()}>
        <Icon name="image" size={18} />{trigger}
      </button>
      <dialog ref={ref} aria-labelledby="library-pick-title"
        onClick={(event) => { if (event.target === event.currentTarget && !pending) ref.current?.close(); }}>
        <form action={act} aria-busy={pending}>
          <div className="dialog__body">
            <h2 id="library-pick-title">{title}</h2>
            <p className="muted">{description}</p>
            {hidden && Object.entries(hidden).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <input type="hidden" name="library_id" value={selected ?? ''} />
            {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}

            {items.length === 0 ? (
              <p className="muted">Library-mu masih kosong. Unggah gambar lebih dulu di halaman Library.</p>
            ) : (
              <ul className="library-picker" aria-label="Gambar di Library">
                {items.map((item) => (
                  <li key={item.id}>
                    <label className={cx('library-picker__item', selected === item.id && 'is-selected')}>
                      <input type="radio" name="library_choice" value={item.id}
                        checked={selected === item.id} onChange={() => setSelected(item.id)} />
                      <span className="library-picker__thumb">
                        {item.url
                          ? <img src={item.url} alt="" width={160} height={120} loading="lazy" decoding="async" />
                          : <Icon name="image" size={20} />}
                      </span>
                      <span className="library-picker__text">
                        <span className="library-picker__title">{item.title}</span>
                        <span className="muted">{item.hd ? 'HD tersedia' : 'Hanya versi kompresi'}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending}
              onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn" disabled={pending || !selected} aria-busy={pending}>
              {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
              {pending ? 'Memakai…' : 'Pakai gambar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
