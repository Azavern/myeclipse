'use client';
import { useActionState } from 'react';
import { DeleteButton } from '@/components/entity-form';
import { ImageUploadField } from '@/components/image-upload';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice, StorageImage } from '@/components/ui/primitives';
import { EVENT_PHOTO_LIMIT } from '@/lib/events';
import type { FormState } from '@/lib/form-state';
import { addEventPhoto, removeEventPhoto, setEventThumbnail } from './actions';

type Photo = { id: string; url: string };

// Satu foto: jadi thumbnail, atau hapus (dialog konfirmasi bawaan DeleteButton).
function PhotoTile({ eventId, photo, isCover }: { eventId: string; photo: Photo; isCover: boolean }) {
  const [state, act, pending] = useActionState<FormState, FormData>(setEventThumbnail, null);
  return (
    <li className="photo-tile">
      <StorageImage src={photo.url} alt="Foto event" width={800} height={600} />
      <div className="photo-tile__actions">
        {isCover ? (
          <Chip tone="success" icon="check">Thumbnail</Chip>
        ) : (
          <form action={act}>
            <input type="hidden" name="event_id" value={eventId} />
            <input type="hidden" name="photo_id" value={photo.id} />
            <button type="submit" className="btn btn--secondary btn--sm" disabled={pending}>
              {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="star" size={16} />}
              {pending ? 'Menyimpan…' : 'Thumbnail'}
            </button>
          </form>
        )}
        <DeleteButton action={removeEventPhoto} hidden={{ event_id: eventId }} id={photo.id}
          label="Hapus" size="sm" title="Hapus foto ini?" confirmLabel="Hapus foto"
          consequence="Foto dihapus dari event dan dari penyimpanan." permanent={false} />
      </div>
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </li>
  );
}

function NoThumbnail({ eventId }: { eventId: string }) {
  const [state, act, pending] = useActionState<FormState, FormData>(setEventThumbnail, null);
  return (
    <div className="inline-form">
      <form action={act}>
        <input type="hidden" name="event_id" value={eventId} />
        <button type="submit" className="btn btn--ghost btn--sm" disabled={pending}>
          {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="eye-off" size={16} />}
          {pending ? 'Menyimpan…' : 'Tanpa thumbnail'}
        </button>
      </form>
      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
    </div>
  );
}

export function EventPhotos({ eventId, photos, coverUrl }: {
  eventId: string; photos: Photo[]; coverUrl: string | null;
}) {
  const [state, act, pending] = useActionState<FormState, FormData>(addEventPhoto, null);
  return (
    <section className="card" aria-labelledby="event-photos">
      <div className="card__head">
        <div>
          <h2 id="event-photos" className="card__title"><Icon name="image" size={20} />Foto event</h2>
          <p className="card__desc">
            Maksimal {EVENT_PHOTO_LIMIT} foto. Gambar diperkecil dan diubah ke WebP sebelum diunggah.
            Foto pertama otomatis menjadi thumbnail; pilih foto lain atau hapus thumbnail kapan saja.
          </p>
        </div>
        <Chip tone="outline">{photos.length}/{EVENT_PHOTO_LIMIT}</Chip>
      </div>

      {photos.length === 0 ? (
        <p className="muted">Belum ada foto.</p>
      ) : (
        <>
          <ul className="photo-grid">
            {photos.map((photo) => (
              <PhotoTile key={photo.id} eventId={eventId} photo={photo}
                isCover={coverUrl !== null && photo.url === coverUrl} />
            ))}
          </ul>
          {coverUrl && <NoThumbnail eventId={eventId} />}
        </>
      )}

      {photos.length < EVENT_PHOTO_LIMIT ? (
        <form action={act} aria-busy={pending} className="form">
          <input type="hidden" name="event_id" value={eventId} />
          {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
          <ImageUploadField name="file" label="Tambah foto" maxSide={1600} />
          <div>
            <button type="submit" className="btn" disabled={pending} aria-busy={pending}>
              {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="upload" size={18} />}
              {pending ? 'Mengunggah…' : 'Unggah foto'}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">Batas {EVENT_PHOTO_LIMIT} foto tercapai. Hapus salah satu untuk menambah foto baru.</p>
      )}
    </section>
  );
}
