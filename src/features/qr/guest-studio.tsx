'use client';

import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice } from '@/components/ui/primitives';
import { validateQrText } from '@/lib/qr/text';
import { formatWhen } from '@/lib/time';
import { useQrDraft } from './draft';
import { QrControls } from './controls';

type QrUpload = { url: string; downloadUrl: string; expiresAt: string };
type DonationStage = 'closed' | 'question' | 'loading' | 'qris' | 'unavailable';

function isUpload(value: unknown): value is QrUpload {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.url === 'string' && typeof row.downloadUrl === 'string' && typeof row.expiresAt === 'string';
}

function errorMessage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const error = (value as Record<string, unknown>).error;
  return typeof error === 'string' ? error : null;
}

// Ikon dikirim sebagai RGBA kecil, bukan kode renderer. Server tidak perlu
// decoder gambar dan tamu tidak pernah menerima generator QR.
async function iconToRgba(bitmap: ImageBitmap): Promise<{ width: number; height: number; data: string }> {
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Ikon tidak bisa dibaca di perangkat ini.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < pixels.length; i += step) {
    binary += String.fromCharCode(...pixels.subarray(i, i + step));
  }
  return { width, height, data: btoa(binary) };
}

export function GuestQrStudio({ tz }: { tz: string }) {
  const draft = useQrDraft();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<QrUpload | null>(null);
  const [stage, setStage] = useState<DonationStage>('closed');
  const [qrisUrl, setQrisUrl] = useState('');
  const [donationError, setDonationError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const pendingRef = useRef(false);
  const { content, textError, iconMissing, mode, iconBitmap, iconOn, iconStyle, style } = draft;
  const question = stage === 'question';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (stage === 'closed') {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
  }, [stage]);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [result]);

  function openDonationPrompt() {
    setDonationError('');
    setQrisUrl('');
    setStage('question');
  }

  function closeDialog() {
    setStage('closed');
    setDonationError('');
  }

  async function showQris() {
    setStage('loading');
    setDonationError('');
    try {
      const response = await fetch('/api/qr/donation', { cache: 'no-store' });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data) ?? 'QRIS donasi belum tersedia.');
      const row = data as { url?: unknown };
      if (typeof row.url !== 'string') throw new Error('QRIS donasi belum tersedia.');
      setQrisUrl(row.url);
      setStage('qris');
    } catch (reason) {
      setDonationError(reason instanceof Error ? reason.message : 'QRIS donasi belum tersedia.');
      setStage('unavailable');
    }
  }

  function submit() {
    setError('');
    const invalid = validateQrText(content);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (iconMissing) {
      setError('Pilih gambar ikon dulu, atau matikan opsi ikon tengah.');
      return;
    }
    openDonationPrompt();
  }

  async function generate() {
    const invalid = validateQrText(content);
    if (invalid) {
      setError(invalid);
      closeDialog();
      return;
    }
    if (iconMissing) {
      setError('Pilih gambar ikon dulu, atau matikan opsi ikon tengah.');
      closeDialog();
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setResult(null);
    closeDialog();
    try {
      const icon = mode === 'custom' && iconOn && iconBitmap
        ? await iconToRgba(iconBitmap)
        : null;
      const response = await fetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: content,
          style,
          icon,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data) ?? 'Gambar QR belum bisa dibuat. Coba lagi.');
      if (!isUpload(data)) throw new Error('Jawaban server tidak dikenali.');
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gambar QR belum bisa dibuat. Coba lagi.');
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }

  function declineDonation() {
    void generate();
  }

  return (
    <>
      <div className="qr-studio">
        <QrControls draft={draft} busy={busy} error={error} onSubmit={submit}
          submitLabel="Buat QR" submitHint="QR dibuat di server setelah parameter dikirim. Pratinjau langsung hanya untuk anggota kelas." />

        <aside className="qr-side stack" aria-label="Hasil QR">
          <section className="card qr-guest-note" aria-labelledby="qr-guest-title">
            <div className="card__head">
              <h2 id="qr-guest-title" className="card__title"><Icon name="lock" size={20} />Dibuat di server</h2>
            </div>
            <div className="qr-preview__stage">
              <div className="qr-preview__empty">
                <span className="tile tile--lg"><Icon name="qr" size={28} /></span>
                <p>Pratinjau langsung tidak tersedia untuk tamu. QR akan muncul setelah kamu menekan <strong>Buat QR</strong>.</p>
              </div>
            </div>
            <p className="field__hint">
              Masuk sebagai anggota kelas untuk melihat pratinjau langsung dan menyesuaikan hasil sebelum mengunggah.
            </p>
          </section>

          {result && (
            <section ref={resultRef} className="card qr-result" aria-labelledby="qr-result-title" aria-live="polite">
              <div className="card__head">
                <h2 id="qr-result-title" className="card__title"><Icon name="check-circle" size={20} />QR siap dibagikan</h2>
                <Chip tone="success">6 jam</Chip>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="qr-result-url">URL gambar publik</label>
                <input id="qr-result-url" className="qr-url" readOnly value={result.url}
                  onFocus={(event) => event.currentTarget.select()} />
              </div>
              <div className="cluster">
                <CopyButton text={result.url} label="Salin tautan" />
                <a className="btn btn--secondary" href={result.downloadUrl} download="eclipse-qr.png">
                  <Icon name="download" size={18} />Unduh PNG
                </a>
                <a className="link-btn" href={result.url} target="_blank" rel="noopener noreferrer">
                  Buka gambar<Icon name="external-link" size={14} className="ext" />
                </a>
              </div>
              <p className="muted">Tautan aktif sampai {formatWhen(result.expiresAt, tz)}. File dihapus otomatis setelah 6 jam.</p>
            </section>
          )}
        </aside>
      </div>

      <dialog ref={dialogRef} className="qr-donation-dialog" aria-labelledby="qr-donation-title"
        onCancel={(event) => { event.preventDefault(); closeDialog(); }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !busy) closeDialog();
        }}>
        <div className="dialog__body">
          <h2 id="qr-donation-title">
            {question ? 'Ingin donasi?' : stage === 'qris' ? 'QRIS donasi kelas' : stage === 'unavailable' ? 'QRIS belum tersedia' : 'Menyiapkan QRIS…'}
          </h2>

          {question && (
            <p className="muted">
              QR kamu sudah siap dibuat. Sebelum lanjut, kamu bisa berdonasi ke kas kelas lewat QRIS.
              Donasi bersifat sukarela dan tidak memengaruhi QR yang kamu buat.
            </p>
          )}

          {stage === 'loading' && (
            <p className="cluster"><Icon name="loader" size={18} className="spin" />Mengambil QRIS donasi…</p>
          )}

          {stage === 'qris' && (
            <>
              <p className="muted">
                Pindai QRIS ini dengan aplikasi pembayaran. Setelah selesai, tekan <strong>Sudah donasi.</strong>
                {' '}QR yang tadi kamu minta akan langsung dibuat.
              </p>
              <div className="qr-donation-qris">
                <img src={qrisUrl} alt="QRIS donasi kas kelas" width={720} height={720} />
              </div>
            </>
          )}

          {stage === 'unavailable' && (
            <>
              <Notice tone="warning">{donationError || 'Bendahara atau Ketua belum mengatur QRIS donasi.'}</Notice>
              <p className="muted">Kamu tetap bisa membuat QR tanpa donasi.</p>
            </>
          )}
        </div>

        {stage !== 'loading' && (
          <div className="dialog__actions">
            {question && (
              <>
                <button type="button" className="btn btn--secondary" onClick={declineDonation}>
                  Tidak, buat QR
                </button>
                <button type="button" className="btn" onClick={() => void showQris()}>
                  <Icon name="qr" size={18} />Ya, lihat QRIS
                </button>
              </>
            )}
            {stage === 'qris' && (
              <>
                <button type="button" className="btn btn--secondary" onClick={closeDialog}>Batal</button>
                <button type="button" className="btn" onClick={() => void generate()}>
                  <Icon name="check" size={18} />Sudah donasi.
                </button>
              </>
            )}
            {stage === 'unavailable' && (
              <>
                <button type="button" className="btn btn--secondary" onClick={closeDialog}>Tutup</button>
                <button type="button" className="btn" onClick={() => void generate()}>
                  <Icon name="qr" size={18} />Lanjut buat QR
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
