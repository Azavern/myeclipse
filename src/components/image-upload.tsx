'use client';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/icon';
import { LibraryImagePicker } from '@/features/library/picker';
import { compressImage } from '@/lib/image-client';
import { LIBRARY_MAX_ORIGINAL_BYTES, libraryTitle } from '@/lib/library/shared';

type Status = { tone: 'idle' | 'busy' | 'ok' | 'error'; text: string };
type Source = 'local' | 'library';

async function saveToLibrary(original: File, preview: Blob): Promise<{ hd: boolean; warning: string | null }> {
  const body = new FormData();
  body.set('original', original);
  body.set('preview', new File([preview], 'gambar.webp', { type: preview.type }));
  body.set('title', libraryTitle(original.name));
  const response = await fetch('/api/library/upload', { method: 'POST', body });
  const json = (await response.json().catch(() => null)) as
    | { ok?: boolean; item?: { hd?: boolean }; warning?: string | null; error?: { message?: string } }
    | null;
  if (!response.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Gambar belum tersimpan di Library.');
  return { hd: json.item?.hd === true, warning: json.warning ?? null };
}

// Resize/crop di klien (UX saja); server tetap memvalidasi tipe, ukuran, dan isi berkas.
// Gambar dari perangkat dikirim juga ke Library: versi ringan untuk tampilan dan versi
// asli (sebelum dikompresi) ke Google Drive. Gambar yang dipilih dari Library tidak
// disalin ulang karena sudah tersimpan di sana. Kegagalan Library tidak memblokir
// unggahan form.
export function ImageUploadField({ name, label, maxSide, crop }: { name: string; label: string; maxSide?: number; crop?: [number, number] }) {
  const [status, setStatus] = useState<Status>({
    tone: 'idle',
    text: 'JPEG, PNG, atau WebP. Gambar diperkecil otomatis; versi asli ikut disimpan ke Library. Bisa juga memakai gambar dari Library.',
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const uid = useId(); // beberapa unggahan dapat berada di satu halaman; id harus unik
  const inputRef = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function applyFile(file: File, source: Source) {
    const input = inputRef.current;
    if (!input) return;
    const current = ++run.current;
    input.setCustomValidity('Gambar sedang diproses.'); // memblokir submit selama resize dan penyimpanan Library
    setStatus({ tone: 'busy', text: 'Memproses gambar…' });
    try {
      const blob = await compressImage(file, { maxSide, crop });
      if (current !== run.current) return;
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'gambar.webp', { type: blob.type }));
      input.files = dt.files;
      setPreview(URL.createObjectURL(blob));
      const kb = Math.round(blob.size / 1024);

      if (source === 'library') {
        setStatus({ tone: 'ok', text: `Siap diunggah (${kb} KB) · dipakai dari Library.` });
        return;
      }

      input.setCustomValidity('Gambar sedang disimpan di Library.');
      setStatus({ tone: 'busy', text: 'Menyimpan versi asli ke Library…' });

      let library: { hd: boolean; warning: string | null } | null = null;
      let libraryFailed = false;
      try {
        library = await saveToLibrary(file, blob);
      } catch {
        libraryFailed = true;
      }
      if (current !== run.current) return;

      if (libraryFailed) {
        setStatus({
          tone: 'ok',
          text: `Siap diunggah (${kb} KB). Versi Library belum tersimpan; unggahan form tetap bisa dilanjutkan.`,
        });
      } else if (library?.warning) {
        setStatus({ tone: 'ok', text: `Siap diunggah (${kb} KB). ${library.warning}` });
      } else {
        setStatus({
          tone: 'ok',
          text: `Siap diunggah (${kb} KB) · tersimpan di Library${library?.hd ? ' beserta versi HD' : ''}.`,
        });
      }
    } catch {
      input.value = '';
      setStatus({ tone: 'error', text: 'Gambar tidak bisa diproses. Coba file lain.' });
    } finally {
      if (current === run.current) input.setCustomValidity('');
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > LIBRARY_MAX_ORIGINAL_BYTES) {
      input.value = '';
      setStatus({ tone: 'error', text: 'Gambar harus JPEG, PNG, atau WebP dan maksimal 10 MB sebelum diperkecil.' });
      return;
    }
    setPicked(null);
    void applyFile(file, 'local');
  }

  function onLibraryPick(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > LIBRARY_MAX_ORIGINAL_BYTES) {
      setStatus({ tone: 'error', text: 'Gambar Library harus JPEG, PNG, atau WebP maksimal 10 MB.' });
      return;
    }
    setPicked(file.name);
    void applyFile(file, 'library');
  }

  const icon = status.tone === 'error' ? 'alert-circle' : status.tone === 'ok' ? 'check-circle' : status.tone === 'busy' ? 'loader' : 'info';
  return (
    <div className="field">
      <label className="field__label" htmlFor={`${uid}-input`}>{label}<span className="req" aria-hidden="true">*</span><span className="sr-only"> (wajib diisi)</span></label>
      <div className="dropzone">
        <input
          id={`${uid}-input`} ref={inputRef} name={name} type="file" accept="image/jpeg,image/png,image/webp" required
          onChange={onChange} aria-describedby={`${uid}-msg`} aria-invalid={status.tone === 'error' ? true : undefined}
        />
        {preview && <img className="dropzone__preview" src={preview} alt="Pratinjau gambar yang akan diunggah" width={96} height={96} />}
      </div>
      <div className="upload-src">
        <span className="field__hint">Atau pakai gambar yang sudah ada:</span>
        <LibraryImagePicker onPick={onLibraryPick} />
      </div>
      {picked && <p className="field__hint">Dipakai dari Library: {picked}</p>}
      <p id={`${uid}-msg`} role="status" className={status.tone === 'error' ? 'field__error' : 'field__hint'}>
        <Icon name={icon} size={16} className={status.tone === 'busy' ? 'spin' : undefined} />{status.text}
      </p>
    </div>
  );
}
