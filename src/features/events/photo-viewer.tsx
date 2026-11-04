'use client';
import { useActionState, useEffect, useId, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { listEventPhotos, type PhotoViewerState } from './actions';

// Popup foto dari kartu event: gambar ukuran besar berjejer horizontal dengan
// scroll-snap, dimuat saat tombol ditekan agar daftar event tidak menandatangani
// ratusan URL sekaligus.
export function EventPhotoViewer({ eventId, count }: { eventId: string; count: number }) {
  const [state, act, pending] = useActionState<PhotoViewerState, FormData>(listEventPhotos, null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const photos = state?.ok ? state.photos : null;

  useEffect(() => {
    if (photos && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [photos]);

  return (
    <>
      <form action={act}>
        <input type="hidden" name="event_id" value={eventId} />
        <button type="submit" className="btn btn--secondary btn--sm" disabled={pending} aria-busy={pending}>
          {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="image" size={16} />}
          {pending ? 'Memuat…' : `Lihat foto (${count})`}
        </button>
      </form>
      <dialog ref={dialog} aria-labelledby={titleId} className="photo-viewer"
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="photo-viewer__head">
          <h2 id={titleId} className="card__title"><Icon name="image" size={20} />Foto event</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => dialog.current?.close()}>
            <Icon name="x" size={18} />Tutup
          </button>
        </div>
        {photos ? (
          <div className="photo-strip">
            {photos.map((photo, index) => (
              <img key={photo.id} src={photo.url} alt={`Foto ${index + 1} dari ${photos.length}`}
                width={1200} height={800} loading="lazy" />
            ))}
          </div>
        ) : state && !state.ok ? (
          <div className="photo-viewer__body"><Notice tone="error" role="alert">{state.error}</Notice></div>
        ) : null}
      </dialog>
    </>
  );
}
