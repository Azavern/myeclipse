'use client';

import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice } from '@/components/ui/primitives';
import { renderQr } from '@/lib/qr/render';
import { validateQrText } from '@/lib/qr/text';
import { formatWhen } from '@/lib/time';
import { useQrDraft } from './draft';
import { QrControls } from './controls';

type QrUpload = { url: string; downloadUrl: string; expiresAt: string };

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

// Anggota aktif memakai jalur lama: preview langsung di canvas dan unggah PNG.
// Tamu memakai GuestQrStudio, yang tidak mengimpor modul ini maupun renderer.
export function QrStudio({ tz }: { tz: string }) {
  const draft = useQrDraft();
  const [previewError, setPreviewError] = useState('');
  const [dims, setDims] = useState<{ width: number; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<QrUpload | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const runId = useRef(0);
  const {
    content, textError, iconBitmap, iconMissing, mode, dotShape, barOrientation, fill, back, iconOn, iconStyle, style,
  } = draft;
  const showPreview = !!content && !textError && !previewError && !!dims;

  useEffect(() => {
    if (!content) {
      setPreviewError('');
      setDims(null);
      return;
    }
    const invalid = validateQrText(content);
    if (invalid) {
      setPreviewError('');
      setDims(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const rendered = renderQr(canvas, {
          text: content,
          style,
          icon: mode === 'custom' && iconOn ? iconBitmap : null,
        });
        setDims({ width: rendered.width, version: rendered.version });
        setPreviewError('');
      } catch {
        setDims(null);
        setPreviewError('Teks ini terlalu panjang untuk QR koreksi galat H. Pendekkan teks atau tautan.');
      }
    }, 160);
    return () => window.clearTimeout(timer);
  }, [content, textError, mode, dotShape, barOrientation, fill, back, iconOn, iconBitmap, iconStyle, style]);

  useEffect(() => {
    runId.current += 1;
    setResult(null);
    setError('');
  }, [content, mode, dotShape, barOrientation, fill, back, iconOn, iconBitmap, iconStyle]);

  // Di layar sempit hasil berada di atas formulir; bawa pengguna ke kartu hasil
  // setelah unggahan selesai. Preferensi gerak dikurangi tetap dihormati.
  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [result]);

  async function generate() {
    const id = ++runId.current;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      renderQr(canvas, { text: content, style, icon: mode === 'custom' && iconOn ? iconBitmap : null });
    } catch {
      setError('Gambar QR tidak bisa dibuat. Periksa teks dan warna.');
      return;
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setError('Gambar QR tidak bisa dibuat di perangkat ini.');
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append('file', new File([blob], 'eclipse-qr.png', { type: 'image/png' }));
      const response = await fetch('/api/qr', { method: 'POST', body });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(data) ?? 'Gambar QR belum bisa disimpan. Coba lagi.');
      if (!isUpload(data)) throw new Error('Jawaban server tidak dikenali.');
      if (id === runId.current) setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gambar QR belum bisa disimpan. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qr-studio">
      <QrControls draft={draft} busy={busy} error={error} onSubmit={generate}
        submitLabel="Buat & unggah QR" submitHint="Gambar disimpan sementara di storage publik selama 6 jam." />

      <aside className="qr-side stack" aria-label="Pratinjau dan hasil">
        <section className="card qr-preview" aria-labelledby="qr-preview-title">
          <div className="card__head">
            <h2 id="qr-preview-title" className="card__title"><Icon name="eye" size={20} />Pratinjau</h2>
            {dims && <span className="qr-size">{dims.width}×{dims.width} px</span>}
          </div>
          <div className="qr-preview__stage">
            <canvas ref={canvasRef} className="qr-canvas" hidden={!showPreview}
              role="img" aria-label="Pratinjau QR yang dihasilkan" />
            {!showPreview && (
              <div className="qr-preview__empty">
                <span className="tile tile--lg"><Icon name="qr" size={28} /></span>
                <p>{draft.text.trim() ? 'Perbaiki teks untuk melihat pratinjau.' : 'QR akan muncul di sini setelah kamu mengisi teks atau tautan.'}</p>
              </div>
            )}
          </div>
          {previewError && <Notice tone="error">{previewError}</Notice>}
          <p className="field__hint">
            {dims ? `QR versi ${dims.version}, koreksi galat H, modul 12 px.` : 'Pratinjau mengikuti warna, bentuk, dan ikon yang dipilih.'}
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
  );
}
