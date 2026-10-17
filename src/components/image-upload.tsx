'use client';
import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/icon';

type Status = { tone: 'idle' | 'busy' | 'ok' | 'error'; text: string };

// Resize/crop di klien (UX saja); server tetap memvalidasi tipe, ukuran, dan isi berkas (blueprint §13.4).
export function ImageUploadField({ name, label, maxSide, crop }: { name: string; label: string; maxSide?: number; crop?: [number, number] }) {
  const [status, setStatus] = useState<Status>({ tone: 'idle', text: 'JPEG, PNG, atau WebP. Gambar diperkecil otomatis sebelum diunggah.' });
  const [preview, setPreview] = useState<string | null>(null);
  const uid = useId(); // beberapa unggahan dapat berada di satu halaman; id harus unik
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    setPreview(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 10 * 1024 * 1024) {
      input.value = '';
      setStatus({ tone: 'error', text: 'Gambar harus JPEG, PNG, atau WebP dan maksimal 10 MB sebelum diperkecil.' });
      return;
    }
    input.setCustomValidity('Gambar sedang diproses.'); // memblokir submit selama resize
    setStatus({ tone: 'busy', text: 'Memproses gambar…' });
    try {
      const bmp = await createImageBitmap(f);
      let [sx, sy, sw, sh, dw, dh] = [0, 0, bmp.width, bmp.height, 0, 0];
      if (crop) {
        [dw, dh] = crop;
        const r = dw / dh;
        if (sw / sh > r) { const nw = sh * r; sx = (sw - nw) / 2; sw = nw; } else { const nh = sw / r; sy = (sh - nh) / 2; sh = nh; }
      } else { const s = Math.min(1, (maxSide ?? 1600) / Math.max(sw, sh)); dw = Math.round(sw * s); dh = Math.round(sh * s); }
      const canvas = document.createElement('canvas');
      canvas.width = dw; canvas.height = dh;
      canvas.getContext('2d')?.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85));
      if (!blob) throw new Error('toBlob');
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'gambar.webp', { type: blob.type }));
      input.files = dt.files;
      setPreview(URL.createObjectURL(blob));
      setStatus({ tone: 'ok', text: `Siap diunggah (${Math.round(blob.size / 1024)} KB).` });
    } catch {
      input.value = '';
      setStatus({ tone: 'error', text: 'Gambar tidak bisa diproses. Coba file lain.' });
    } finally { input.setCustomValidity(''); }
  }

  const icon = status.tone === 'error' ? 'alert-circle' : status.tone === 'ok' ? 'check-circle' : status.tone === 'busy' ? 'loader' : 'info';
  return (
    <div className="field">
      <label className="field__label" htmlFor={`${uid}-input`}>{label}<span className="req" aria-hidden="true">*</span><span className="sr-only"> (wajib diisi)</span></label>
      <div className="dropzone">
        <input id={`${uid}-input`} name={name} type="file" accept="image/jpeg,image/png,image/webp" required onChange={onChange} aria-describedby={`${uid}-msg`} aria-invalid={status.tone === 'error' ? true : undefined} />
        {preview && <img className="dropzone__preview" src={preview} alt="Pratinjau gambar yang akan diunggah" width={96} height={96} />}
      </div>
      <p id={`${uid}-msg`} role="status" className={status.tone === 'error' ? 'field__error' : 'field__hint'}>
        <Icon name={icon} size={16} className={status.tone === 'busy' ? 'spin' : undefined} />{status.text}
      </p>
    </div>
  );
}
