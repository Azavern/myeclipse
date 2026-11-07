'use client';
import { useActionState } from 'react';
import { DeleteButton } from '@/components/entity-form';
import { ImageUploadField } from '@/components/image-upload';
import { Icon } from '@/components/ui/icon';
import { Avatar, Notice, StorageImage } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import type { FormState } from '@/lib/form-state';

type Action = (p: FormState, fd: FormData) => Promise<FormState>;

// Kartu unggah gambar tunggal (logo, sampul, foto profil, gambar portofolio/event): pratinjau, unggah, dan hapus dengan konfirmasi.
export function ImageForm({ id, title, description, url, variant, name, uploadAction, removeAction, hidden, spec, removeConsequence }: {
  id: string; title: string; description: string; url?: string; variant: 'avatar' | 'logo' | 'wide' | 'cover'; name?: string;
  uploadAction: Action; removeAction: Action; hidden?: Record<string, string>; spec: { maxSide?: number; crop?: [number, number] };
  removeConsequence: string;
}) {
  const [state, act, pending] = useActionState(uploadAction, null);
  return (
    <section data-ui="panel" className="card" aria-labelledby={`img-${id}`}>
      <div className="card__head">
        <div>
          <h2 id={`img-${id}`} className="card__title"><Icon name="image" size={20} />{title}</h2>
          <p className="card__desc">{description}</p>
        </div>
      </div>
      <div className="upload-row">
        <div className={cx('upload-preview', `upload-preview--${variant}`)}>
          {variant === 'avatar'
            ? <Avatar name={name ?? title} src={url} size="xl" />
            : variant === 'cover'
              ? <StorageImage src={url} alt={`${title} saat ini`} width={1600} height={500} ratio="hero" />
              : <StorageImage src={url} alt={`${title} saat ini`} width={variant === 'logo' ? 96 : 320} height={variant === 'logo' ? 96 : 180} ratio={variant === 'logo' ? 'sq' : 'wide'} />}
        </div>
        <div className="stack stack--sm">
          <form action={act} aria-busy={pending} className="form">
            {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}
            <ImageUploadField name="file" label={url ? 'Ganti dengan gambar baru' : 'Pilih gambar'} {...spec} previewRatio={variant === 'cover' ? 'hero' : undefined} />
            <div>
              <button data-ui="button" type="submit" className="btn" disabled={pending} aria-busy={pending}>
                {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="upload" size={18} />}{pending ? 'Mengunggah…' : 'Unggah'}
              </button>
            </div>
          </form>
          {/* Di luar <form> unggah: dialog hapus punya form sendiri dan form tidak boleh bersarang. */}
          {url && <div><DeleteButton action={removeAction} hidden={hidden} label="Hapus gambar" title={`Hapus ${title.toLowerCase()}?`} consequence={removeConsequence} confirmLabel="Hapus gambar" permanent={false} /></div>}
        </div>
      </div>
    </section>
  );
}
