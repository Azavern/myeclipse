'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { QR_COLOR_PRESETS, parseQrColor } from '@/lib/qr/style';
import {
  BAR_ORIENTATIONS, DOT_SHAPES, ICON_FITS, ICON_SHAPES, type QrDraft,
} from './draft';

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

export function QrControls({ draft, busy, error, onSubmit, submitLabel, submitHint }: {
  draft: QrDraft;
  busy: boolean;
  error: string;
  onSubmit: () => void;
  submitLabel: string;
  submitHint: string;
}) {
  const textId = useId();

  return (
    <div className="qr-controls stack">
      <section className="card" aria-labelledby="qr-mode-title">
        <div className="card__head">
          <div>
            <h2 id="qr-mode-title" className="card__title"><Icon name="qr" size={20} />Mode QR</h2>
            <p className="card__desc">Normal untuk QR standar, Custom untuk bentuk titik dan ikon tengah.</p>
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Pilih mode QR">
          <button type="button" aria-pressed={draft.mode === 'normal'} onClick={() => draft.changeMode('normal')}>
            <Icon name="qr" size={16} />Normal
          </button>
          <button type="button" aria-pressed={draft.mode === 'custom'} onClick={() => draft.changeMode('custom')}>
            <Icon name="sparkles" size={16} />Custom
          </button>
        </div>

        <div className="field qr-text-field">
          <label className="field__label" htmlFor={`${textId}-text`}>
            Teks atau tautan<span className="req" aria-hidden="true">*</span>
            <span className="sr-only"> (wajib diisi)</span>
          </label>
          <textarea id={`${textId}-text`} value={draft.text} rows={3} maxLength={2000}
            placeholder="https://contoh.id atau teks apa pun"
            aria-describedby={`${textId}-text-help`} aria-invalid={!!draft.textError}
            onChange={(event) => draft.setText(event.target.value)} />
          <div className="qr-text-meta">
            <p id={`${textId}-text-help`} className={draft.textError ? 'field__error' : 'field__hint'}>
              {draft.textError ?? 'Maksimal 1.200 byte. Teks yang lebih panjang tidak muat pada koreksi galat H.'}
            </p>
            <span className={draft.textBytes > draft.maxTextBytes ? 'field__count qr-count--over' : 'field__count'}>
              {draft.textBytes}/{draft.maxTextBytes} byte
            </span>
          </div>
          <button type="button" className="link-btn qr-example" onClick={() => draft.setText('https://example.com')}>
            <Icon name="sparkles" size={14} />Isi contoh
          </button>
        </div>

        <div className="form__grid form__grid--2 qr-colors">
          <ColorField id="qr-fill" label="Warna QR / titik" value={draft.fill} onChange={draft.setFillTouched} />
          <ColorField id="qr-back" label="Warna latar" value={draft.back} onChange={draft.setBackTouched} />
        </div>
        {draft.lowContrast && (
          <Notice tone="warning">
            Kontras warna ini rendah{draft.ratio < 4.5 ? ` (${draft.ratio.toFixed(1)}:1)` : ''}. QR sebaiknya gelap di atas latar terang
            agar mudah dipindai; coba warna hitam bila hasil tidak terbaca.
          </Notice>
        )}
      </section>

      {draft.mode === 'custom' && (
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
                  checked={draft.dotShape === shape.value} onChange={() => draft.setDotShape(shape.value)} />
                <span className="choice__name">{shape.label}</span>
                <span className="choice__note">{shape.hint}</span>
              </label>
            ))}
          </fieldset>
          {draft.dotShape === 'block' && (
            <div className="field qr-bar-field">
              <label className="field__label" htmlFor="qr-bar-orientation">Orientasi balok</label>
              <select id="qr-bar-orientation" value={draft.barOrientation}
                onChange={(event) => draft.setBarOrientation(event.target.value as typeof draft.barOrientation)}>
                {BAR_ORIENTATIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="field__hint">{BAR_ORIENTATIONS.find((option) => option.value === draft.barOrientation)?.hint}</p>
            </div>
          )}
        </section>
      )}

      {draft.mode === 'custom' && (
        <section className="card" aria-labelledby="qr-icon-title">
          <div className="card__head">
            <div>
              <h2 id="qr-icon-title" className="card__title"><Icon name="image" size={20} />Ikon tengah</h2>
              <p className="card__desc">Opsional. Area ikon 23% lebar QR</p>
            </div>
            <label className="qr-check">
              <input type="checkbox" checked={draft.iconOn} onChange={(event) => draft.setIconOn(event.target.checked)} />
              <span>Aktif</span>
            </label>
          </div>

          {draft.iconOn && (
            <div className="stack stack--sm">
              <div className="qr-icon-row">
                <div className={cx('qr-icon-preview', draft.iconPreview && 'qr-icon-preview--filled')}>
                  {draft.iconPreview
                    ? <img src={draft.iconPreview} alt={`Pratinjau ikon ${draft.iconName}`} width={80} height={80} />
                    : <Icon name="image" size={28} />}
                </div>
                <div className="stack stack--sm qr-icon-upload">
                  <label className="field__label" htmlFor="qr-icon-file">Gambar ikon</label>
                  <input id="qr-icon-file" type="file" accept="image/png,image/jpeg,image/webp"
                    aria-describedby="qr-icon-help" onChange={draft.chooseIcon} />
                  <p id="qr-icon-help" className="field__hint">PNG, JPEG, atau WebP, maksimal 5 MB. Latar transparan paling aman.</p>
                  {draft.iconName && <p className="field__hint">Terpilih: {draft.iconName}</p>}
                  <div><button type="button" className="btn btn--secondary btn--sm" onClick={draft.removeIcon}>
                    <Icon name="trash" size={16} />Hapus ikon
                  </button></div>
                </div>
              </div>
              {draft.iconError && <Notice tone="error" role="alert">{draft.iconError}</Notice>}
              {!draft.iconBitmap && <Notice tone="warning">Pilih gambar ikon sebelum membuat QR.</Notice>}

              <div className="form__grid form__grid--2">
                <div className="field">
                  <label className="field__label" htmlFor="qr-icon-shape">Bentuk border</label>
                  <select id="qr-icon-shape" value={draft.iconStyle.shape}
                    onChange={(event) => {
                      const shape = event.target.value as typeof draft.iconStyle.shape;
                      draft.updateIcon('shape', shape);
                      if (shape === 'outline') draft.updateIcon('fit', 'shrink');
                    }}>
                    {ICON_SHAPES.map((shape) => <option key={shape.value} value={shape.value}>{shape.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="qr-icon-fit">Gambar di dalam border</label>
                  <select id="qr-icon-fit" value={draft.iconStyle.fit} disabled={draft.iconStyle.shape === 'outline'}
                    onChange={(event) => draft.updateIcon('fit', event.target.value as typeof draft.iconStyle.fit)}>
                    {ICON_FITS.map((fit) => <option key={fit.value} value={fit.value}>{fit.label}</option>)}
                  </select>
                  {draft.iconStyle.shape === 'outline' && <p className="field__hint">Outline mengikuti siluet gambar; gambar selalu tampil utuh.</p>}
                </div>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="qr-icon-thickness">
                  Ketebalan border <span className="muted">({draft.iconStyle.thickness}%)</span>
                </label>
                <input id="qr-icon-thickness" type="range" min={1} max={100} step={1} value={draft.iconStyle.thickness}
                  onChange={(event) => draft.updateIcon('thickness', Number(event.target.value))} />
                <p className="field__hint">Makin tebal, gambar di dalamnya makin kecil supaya area QR yang tertutup tetap aman.</p>
              </div>

              {draft.iconStyle.fit === 'crop' && draft.iconStyle.shape !== 'outline' && (
                <label className="qr-check">
                  <input type="checkbox" checked={draft.iconStyle.gap} onChange={(event) => draft.updateIcon('gap', event.target.checked)} />
                  <span>Beri jarak antara gambar dan border</span>
                </label>
              )}

              <ColorField id="qr-icon-border" label={draft.iconStyle.shape === 'outline' ? 'Warna outline' : 'Warna border'}
                value={draft.iconStyle.borderColor} onChange={(value) => draft.updateIcon('borderColor', value)} />
            </div>
          )}
        </section>
      )}

      <div className="qr-submit">
        {error && <Notice tone="error" role="alert">{error}</Notice>}
        <div className="cluster qr-submit__row">
          <button type="button" className="btn btn--lg" disabled={busy || !draft.content} aria-busy={busy} onClick={onSubmit}>
            {busy ? <Icon name="loader" size={18} className="spin" /> : <Icon name="qr" size={18} />}
            {busy ? 'Memproses…' : submitLabel}
          </button>
          <p className="field__hint">{submitHint}</p>
        </div>
      </div>
    </div>
  );
}
