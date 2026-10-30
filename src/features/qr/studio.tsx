'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { renderQr } from '@/lib/qr/render';
import {
  DEFAULT_CUSTOM_STYLE, DEFAULT_ICON_STYLE, DEFAULT_QR_STYLE, QR_COLOR_PRESETS, QR_MAX_ICON_BYTES,
  QR_MAX_TEXT_BYTES, parseQrColor, qrContrast, textByteLength,
  type QrBarOrientation, type QrDotShape, type QrIconFit, type QrIconShape, type QrIconStyle, type QrMode, type QrStyle,
} from '@/lib/qr/style';
import { validateQrText } from '@/lib/qr/matrix';
import { luminance } from '@/lib/theme/contrast';
import { formatWhen } from '@/lib/time';

type QrUpload = { url: string; downloadUrl: string; expiresAt: string };

const DOT_SHAPES: { value: QrDotShape; label: string; hint: string }[] = [
  { value: 'square', label: 'Kotak', hint: 'Modul kotak rapi, paling mudah dipindai.' },
  { value: 'circle', label: 'Bulat', hint: 'Titik bulat dengan finder membulat.' },
  { value: 'block', label: 'Balok', hint: 'Modul bersebelahan menyatu jadi balok pill; orientasinya bisa dipilih.' },
];

const BAR_ORIENTATIONS: { value: QrBarOrientation; label: string; hint: string }[] = [
  { value: 'horizontal', label: 'Horizontal (mendatar)', hint: 'Balok mendatar, sama seperti versi balok sebelumnya.' },
  { value: 'vertical', label: 'Vertikal (tegak)', hint: 'Balok tegak, geometri horizontal diputar 90°.' },
  { value: 'diagonal_down', label: 'Diagonal turun (↘)', hint: 'Balok miring dari kiri-atas ke kanan-bawah.' },
  { value: 'diagonal_up', label: 'Diagonal naik (↗)', hint: 'Balok miring dari kiri-bawah ke kanan-atas.' },
];

const ICON_SHAPES: { value: QrIconShape; label: string }[] = [
  { value: 'square', label: 'Kotak' },
  { value: 'rounded', label: 'Kotak membulat' },
  { value: 'circle', label: 'Bulat' },
  { value: 'triangle', label: 'Segitiga' },
  { value: 'outline', label: 'Outline mengikuti gambar' },
];

const ICON_FITS: { value: QrIconFit; label: string }[] = [
  { value: 'crop', label: 'Padat (gambar memenuhi bentuk)' },
  { value: 'shrink', label: 'Diperkecil (gambar tampil utuh)' },
];

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

// Kontrol warna kecil: pemilih native + input hex/nama + preset skrip.
function ColorField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const previous = useRef(value);
  const parsed = parseQrColor(draft);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setDraft(value);
    }
  }, [value]);

  return (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-hex`}>{label}</label>
      <div className="qr-color">
        <input id={`${id}-color`} type="color" value={value}
          aria-label={`${label}: buka pemilih warna`} onChange={(event) => onChange(event.target.value)} />
        <input id={`${id}-hex`} type="text" value={draft} spellCheck={false} autoComplete="off"
          aria-invalid={!parsed} aria-describedby={`${id}-help`}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const color = parseQrColor(next);
            if (color) onChange(color);
          }}
          onBlur={() => { if (!parseQrColor(draft)) setDraft(value); }} />
      </div>
      <div className="qr-swatches" role="group" aria-label={`Preset warna ${label.toLowerCase()}`}>
        {QR_COLOR_PRESETS.map((preset) => (
          <button key={preset.name} type="button" className={cx('qr-swatch', `qr-swatch--${preset.name}`)}
            aria-label={`Pakai warna ${preset.label}`} aria-pressed={value === preset.value}
            title={preset.label} onClick={() => onChange(preset.value)} />
        ))}
      </div>
      <p id={`${id}-help`} className={parsed ? 'field__hint' : 'field__error'}>
        {parsed ? 'Nama warna atau kode hex enam digit.' : 'Warna tidak dikenali. Gunakan nama warna atau kode hex enam digit.'}
      </p>
    </div>
  );
}

export function QrStudio({ tz }: { tz: string }) {
  const [mode, setMode] = useState<QrMode>('normal');
  const [text, setText] = useState('');
  const [dotShape, setDotShape] = useState<QrDotShape>('square');
  const [barOrientation, setBarOrientation] = useState<QrBarOrientation>('horizontal');
  const [fill, setFill] = useState(DEFAULT_CUSTOM_STYLE.fillColor);
  const [back, setBack] = useState(DEFAULT_CUSTOM_STYLE.backColor);
  const [iconOn, setIconOn] = useState(false);
  const [iconBitmap, setIconBitmap] = useState<ImageBitmap | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconName, setIconName] = useState('');
  const [iconError, setIconError] = useState('');
  const [iconStyle, setIconStyle] = useState<QrIconStyle>(DEFAULT_ICON_STYLE);
  const [previewError, setPreviewError] = useState('');
  const [dims, setDims] = useState<{ width: number; version: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<QrUpload | null>(null);
  const touchedColor = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const runId = useRef(0);

  const content = text.trim();
  const textError = content ? validateQrText(content) : null;
  const showPreview = !!content && !textError && !previewError && !!dims;
  const iconMissing = mode === 'custom' && iconOn && !iconBitmap;
  const ratio = qrContrast(fill, back);
  const lowContrast = ratio < 4.5 || luminance(fill) > luminance(back);

  function changeMode(next: QrMode) {
    if (!touchedColor.current) {
      setFill(next === 'custom' ? DEFAULT_CUSTOM_STYLE.fillColor : DEFAULT_QR_STYLE.fillColor);
      setBack(DEFAULT_CUSTOM_STYLE.backColor);
    }
    setMode(next);
  }

  function updateIcon<K extends keyof QrIconStyle>(key: K, value: QrIconStyle[K]) {
    setIconStyle((current) => ({ ...current, [key]: value }));
  }

  async function chooseIcon(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > QR_MAX_ICON_BYTES) {
      setIconError('Ikon harus PNG, JPEG, atau WebP dan maksimal 5 MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 4096 || bitmap.height > 4096) {
        bitmap.close();
        setIconError('Dimensi ikon terlalu besar. Gunakan gambar maksimal 4096 px per sisi.');
        return;
      }
      setIconBitmap(bitmap);
      setIconPreview(URL.createObjectURL(file));
      setIconName(file.name);
      setIconError('');
      setIconOn(true);
    } catch {
      setIconError('Ikon tidak bisa dibaca. Coba file lain.');
    }
  }

  function removeIcon() {
    setIconOn(false);
    setIconBitmap(null);
    setIconPreview(null);
    setIconName('');
    setIconError('');
  }

  useEffect(() => {
    const bitmap = iconBitmap;
    return () => { bitmap?.close(); };
  }, [iconBitmap]);

  // Pembersihan oportunistik: setiap kunjungan membuang file yang sudah lewat
  // 6 jam. Kegagalan diabaikan; unggahan berikutnya mencoba lagi.
  useEffect(() => {
    void fetch('/api/qr/cleanup', { method: 'POST' }).catch(() => undefined);
  }, []);

  useEffect(() => () => {
    if (iconPreview) URL.revokeObjectURL(iconPreview);
  }, [iconPreview]);

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
      const style: QrStyle = mode === 'custom'
        ? { ...DEFAULT_CUSTOM_STYLE, dotShape, barOrientation, fillColor: fill, backColor: back, icon: iconStyle }
        : { mode: 'normal', dotShape: 'square', fillColor: fill, backColor: back };
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
  }, [content, mode, dotShape, barOrientation, fill, back, iconOn, iconBitmap, iconStyle]);

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
    const style: QrStyle = mode === 'custom'
      ? { ...DEFAULT_CUSTOM_STYLE, dotShape, barOrientation, fillColor: fill, backColor: back, icon: iconStyle }
      : { mode: 'normal', dotShape: 'square', fillColor: fill, backColor: back };
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

  const textId = useId();

  return (
    <div className="qr-studio">
      <div className="qr-controls stack">
        <section className="card" aria-labelledby="qr-mode-title">
          <div className="card__head">
            <div>
              <h2 id="qr-mode-title" className="card__title"><Icon name="qr" size={20} />Mode QR</h2>
              <p className="card__desc">Normal untuk QR standar, Custom untuk bentuk titik dan ikon tengah.</p>
            </div>
          </div>
          <div className="segmented" role="group" aria-label="Pilih mode QR">
            <button type="button" aria-pressed={mode === 'normal'} onClick={() => changeMode('normal')}>
              <Icon name="qr" size={16} />Normal
            </button>
            <button type="button" aria-pressed={mode === 'custom'} onClick={() => changeMode('custom')}>
              <Icon name="sparkles" size={16} />Custom
            </button>
          </div>

          <div className="field qr-text-field">
            <label className="field__label" htmlFor={`${textId}-text`}>
              Teks atau tautan<span className="req" aria-hidden="true">*</span>
              <span className="sr-only"> (wajib diisi)</span>
            </label>
            <textarea id={`${textId}-text`} value={text} rows={3} maxLength={2000}
              placeholder="https://contoh.id atau teks apa pun"
              aria-describedby={`${textId}-text-help`} aria-invalid={!!textError}
              onChange={(event) => setText(event.target.value)} />
            <div className="qr-text-meta">
              <p id={`${textId}-text-help`} className={textError ? 'field__error' : 'field__hint'}>
                {textError ?? 'Maksimal 1.200 byte. Teks yang lebih panjang tidak muat pada koreksi galat H.'}
              </p>
              <span className={textByteLength(content) > QR_MAX_TEXT_BYTES ? 'field__count qr-count--over' : 'field__count'}>
                {textByteLength(content)}/{QR_MAX_TEXT_BYTES} byte
              </span>
            </div>
            <button type="button" className="link-btn qr-example" onClick={() => setText('https://example.com')}>
              <Icon name="sparkles" size={14} />Isi contoh
            </button>
          </div>

          <div className="form__grid form__grid--2 qr-colors">
            <ColorField id="qr-fill" label="Warna QR / titik" value={fill}
              onChange={(value) => { touchedColor.current = true; setFill(value); }} />
            <ColorField id="qr-back" label="Warna latar" value={back}
              onChange={(value) => { touchedColor.current = true; setBack(value); }} />
          </div>
          {lowContrast && (
            <Notice tone="warning">
              Kontras warna ini rendah{ratio < 4.5 ? ` (${ratio.toFixed(1)}:1)` : ''}. QR sebaiknya gelap di atas latar terang
              agar mudah dipindai; coba warna hitam bila hasil tidak terbaca.
            </Notice>
          )}
        </section>

        {mode === 'custom' && (
          <section className="card" aria-labelledby="qr-shape-title">
            <div className="card__head">
              <div>
                <h2 id="qr-shape-title" className="card__title"><Icon name="layout" size={20} />Bentuk titik</h2>
                <p className="card__desc">Pilih bentuk titik QR yang diinginkan.</p>
              </div>
            </div>
            <fieldset className="choices qr-shape-choices">
              <legend className="sr-only">Pilih bentuk titik QR</legend>
              {DOT_SHAPES.map((shape) => (
                <label key={shape.value} className="choice">
                  <input type="radio" name="qr-dot-shape" value={shape.value}
                    checked={dotShape === shape.value} onChange={() => setDotShape(shape.value)} />
                  <span className="choice__name">{shape.label}</span>
                  <span className="choice__note">{shape.hint}</span>
                </label>
              ))}
            </fieldset>
            {dotShape === 'block' && (
              <div className="field qr-bar-field">
                <label className="field__label" htmlFor="qr-bar-orientation">Orientasi balok</label>
                <select id="qr-bar-orientation" value={barOrientation}
                  onChange={(event) => setBarOrientation(event.target.value as QrBarOrientation)}>
                  {BAR_ORIENTATIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="field__hint">{BAR_ORIENTATIONS.find((option) => option.value === barOrientation)?.hint}</p>
              </div>
            )}
          </section>
        )}

        {mode === 'custom' && (
          <section className="card" aria-labelledby="qr-icon-title">
            <div className="card__head">
              <div>
                <h2 id="qr-icon-title" className="card__title"><Icon name="image" size={20} />Ikon tengah</h2>
                <p className="card__desc">Opsional. Area ikon 23% lebar QR</p>
              </div>
              <label className="qr-check">
                <input type="checkbox" checked={iconOn} onChange={(event) => setIconOn(event.target.checked)} />
                <span>Aktif</span>
              </label>
            </div>

            {iconOn && (
              <div className="stack stack--sm">
                <div className="qr-icon-row">
                  <div className={cx('qr-icon-preview', iconPreview && 'qr-icon-preview--filled')}>
                    {iconPreview
                      ? <img src={iconPreview} alt={`Pratinjau ikon ${iconName}`} width={80} height={80} />
                      : <Icon name="image" size={28} />}
                  </div>
                  <div className="stack stack--sm qr-icon-upload">
                    <label className="field__label" htmlFor="qr-icon-file">Gambar ikon</label>
                    <input id="qr-icon-file" type="file" accept="image/png,image/jpeg,image/webp"
                      aria-describedby="qr-icon-help" onChange={chooseIcon} />
                    <p id="qr-icon-help" className="field__hint">PNG, JPEG, atau WebP, maksimal 5 MB. Latar transparan paling aman.</p>
                    {iconName && <p className="field__hint">Terpilih: {iconName}</p>}
                    <div><button type="button" className="btn btn--secondary btn--sm" onClick={removeIcon}>
                      <Icon name="trash" size={16} />Hapus ikon
                    </button></div>
                  </div>
                </div>
                {iconError && <Notice tone="error" role="alert">{iconError}</Notice>}
                {!iconBitmap && <Notice tone="warning">Pilih gambar ikon sebelum membuat QR.</Notice>}

                <div className="form__grid form__grid--2">
                  <div className="field">
                    <label className="field__label" htmlFor="qr-icon-shape">Bentuk border</label>
                    <select id="qr-icon-shape" value={iconStyle.shape}
                      onChange={(event) => {
                        const shape = event.target.value as QrIconShape;
                        updateIcon('shape', shape);
                        if (shape === 'outline') updateIcon('fit', 'shrink');
                      }}>
                      {ICON_SHAPES.map((shape) => <option key={shape.value} value={shape.value}>{shape.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="qr-icon-fit">Gambar di dalam border</label>
                    <select id="qr-icon-fit" value={iconStyle.fit} disabled={iconStyle.shape === 'outline'}
                      onChange={(event) => updateIcon('fit', event.target.value as QrIconFit)}>
                      {ICON_FITS.map((fit) => <option key={fit.value} value={fit.value}>{fit.label}</option>)}
                    </select>
                    {iconStyle.shape === 'outline' && <p className="field__hint">Outline mengikuti siluet gambar; gambar selalu tampil utuh.</p>}
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="qr-icon-thickness">
                    Ketebalan border <span className="muted">({iconStyle.thickness}%)</span>
                  </label>
                  <input id="qr-icon-thickness" type="range" min={1} max={100} step={1} value={iconStyle.thickness}
                    onChange={(event) => updateIcon('thickness', Number(event.target.value))} />
                  <p className="field__hint">Makin tebal, gambar di dalamnya makin kecil supaya area QR yang tertutup tetap aman.</p>
                </div>

                {iconStyle.fit === 'crop' && iconStyle.shape !== 'outline' && (
                  <label className="qr-check">
                    <input type="checkbox" checked={iconStyle.gap} onChange={(event) => updateIcon('gap', event.target.checked)} />
                    <span>Beri jarak antara gambar dan border</span>
                  </label>
                )}

                <ColorField id="qr-icon-border" label={iconStyle.shape === 'outline' ? 'Warna outline' : 'Warna border'}
                  value={iconStyle.borderColor} onChange={(value) => updateIcon('borderColor', value)} />
              </div>
            )}
          </section>
        )}

        <div className="qr-submit">
          {error && <Notice tone="error" role="alert">{error}</Notice>}
          <div className="cluster qr-submit__row">
            <button type="button" className="btn btn--lg" disabled={busy || !content} aria-busy={busy} onClick={generate}>
              {busy ? <Icon name="loader" size={18} className="spin" /> : <Icon name="qr" size={18} />}
              {busy ? 'Mengunggah…' : 'Buat & unggah QR'}
            </button>
            <p className="field__hint">Gambar disimpan sementara di storage publik selama 6 jam.</p>
          </div>
        </div>
      </div>

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
                <p>{text.trim() ? 'Perbaiki teks untuk melihat pratinjau.' : 'QR akan muncul di sini setelah kamu mengisi teks atau tautan.'}</p>
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
