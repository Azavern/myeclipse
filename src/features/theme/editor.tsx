'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice, Tile } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import type { FormState } from '@/lib/form-state';
import { PALETTE_LABEL, contrastReport } from '@/lib/theme/contrast';
import { themeVars } from '@/lib/theme/css';
import { DEFAULT_THEME } from '@/lib/theme/defaults';
import { THEME_PRESETS } from '@/lib/theme/presets';
import { PALETTE_KEYS, ThemeSchema, type Theme } from '@/lib/theme/schema';

const HEX = /^#[0-9a-fA-F]{6}$/;
const norm = (v: string) => { const s = v.trim(); return /^[0-9a-fA-F]{6}$/.test(s) ? `#${s.toUpperCase()}` : HEX.test(s) ? s.toUpperCase() : s; };
const same = (a: Theme['palette'], b: Theme['palette']) => PALETTE_KEYS.every((k) => a[k].toUpperCase() === b[k].toUpperCase());
// Baris tombol (on_primary/on_secondary) sudah menyebut latarnya di labelnya sendiri.
const pairLabel = (fg: string, bg: string) => (fg.startsWith('on_') ? (PALETTE_LABEL[fg] ?? fg) : `${PALETTE_LABEL[fg] ?? fg} di atas ${(PALETTE_LABEL[bg] ?? bg).toLowerCase()}`);
const ratioText = (n: number) => n.toFixed(1).replace('.', ',');

const FONTS: { id: Theme['font_preset']; name: string; note: string }[] = [
  { id: 'editorial', name: 'Editorial', note: 'Hangat, bergaya majalah' },
  { id: 'grotesk', name: 'Grotesk', note: 'Tegas dan modern' },
  { id: 'rounded', name: 'Rounded', note: 'Ramah dan santai' },
];
const LAYOUTS: { id: Theme['layout']; name: string; note: string }[] = [
  { id: 'standard', name: 'Standar', note: 'Ringkasan kelas lebih dulu, lalu jadwal dan aktivitas.' },
  { id: 'profile_focused', name: 'Berfokus anggota', note: 'Daftar anggota tampil lebih awal di Beranda.' },
];

// Titik warna preset: SVG dengan atribut fill (bukan atribut style) agar tetap sesuai CSP.
function Dots({ palette }: { palette: Theme['palette'] }) {
  const keys = ['primary', 'secondary', 'background', 'surface', 'text_primary'] as const;
  return (
    <svg className="preset__dots" width={keys.length * 20 + 6} height={26} viewBox={`0 0 ${keys.length * 20 + 6} 26`} aria-hidden="true">
      {keys.map((k, i) => <circle key={k} cx={13 + i * 20} cy={13} r={11} fill={palette[k]} />)}
    </svg>
  );
}

export function ThemeEditor({ initial, action, fontClasses }: {
  initial: Theme;
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  fontClasses: Record<Theme['font_preset'], string>;
}) {
  const [t, setT] = useState<Theme>(initial); // pratinjau = state lokal, belum disimpan (A-12)
  const [state, act, pending] = useActionState(action, null);
  const previewRef = useRef<HTMLDivElement>(null);

  const hexOk = PALETTE_KEYS.every((k) => HEX.test(t.palette[k]));
  const report = hexOk ? contrastReport(t.palette) : [];
  const failing = report.filter((r) => !r.ok);
  const canSave = hexOk && ThemeSchema.safeParse(t).success && !pending;

  // Pratinjau memakai variabel tema yang dipasang lewat CSSOM (bukan atribut style) agar sesuai CSP.
  useEffect(() => {
    const el = previewRef.current;
    if (!el || !hexOk) return;
    for (const [k, v] of Object.entries(themeVars(t.palette))) el.style.setProperty(k, v);
  }, [t.palette, hexOk]);

  const setColor = (k: (typeof PALETTE_KEYS)[number], v: string) => setT((cur) => ({ ...cur, palette: { ...cur.palette, [k]: v } }));

  return (
    <form action={act} aria-busy={pending} className="theme-form">
      {/* Pratinjau menempel di atas saat menggulir (layar ≥768px) supaya perubahan warna langsung terlihat. */}
      <section className="theme-preview" aria-label="Pratinjau tema, belum dipublikasikan">
        <div ref={previewRef} className={cx('preview theme-scope', fontClasses[t.font_preset])} aria-hidden="true" inert>
          <div className="preview__bar"><Tile icon="cap" size="sm" />Kelas contoh<Chip tone="outline">Pratinjau</Chip></div>
          <div className="preview__body preview__body--row">
            <div className="stack stack--sm">
              <h3>Jadwal hari ini</h3>
              <p>Teks utama di atas permukaan. <span className="muted">Teks pendukung untuk keterangan.</span></p>
            </div>
            <div className="cluster">
              <Chip tone="success" icon="check-circle">Selesai</Chip>
              <Chip tone="warning" icon="hourglass">Segera</Chip>
              <Chip tone="error" icon="alert-triangle">Terlambat</Chip>
              <span className="btn btn--sm">Utama</span>
              <span className="btn btn--accent btn--sm">Aksen</span>
            </div>
          </div>
        </div>
      </section>

      {state?.error && <Notice tone="error" role="alert">{state.error}</Notice>}

      <section className="card" aria-labelledby="presets-title">
        <div className="card__head">
          <div>
            <h2 id="presets-title" className="card__title"><Icon name="sparkles" size={20} />Palet siap pakai</h2>
            <p className="card__desc">Mulai dari palet yang sudah lolos aturan kontras, lalu sesuaikan di bawah.</p>
          </div>
        </div>
        <div className="swatch-grid">
          {THEME_PRESETS.map((p) => (
            <button key={p.id} type="button" className="preset" aria-pressed={same(p.palette, t.palette)} onClick={() => setT((cur) => ({ ...cur, palette: { ...p.palette } }))}>
              <Dots palette={p.palette} />
              <span><b>{p.name}</b><span className="muted"> · {p.note}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="colors-title">
        <div className="card__head">
          <div>
            <h2 id="colors-title" className="card__title"><Icon name="palette" size={20} />Warna</h2>
            <p className="card__desc">Tulis kode #RRGGBB atau pilih dari kotak warna.</p>
          </div>
        </div>
        <div className="swatch-grid">
          {PALETTE_KEYS.map((k) => {
            const bad = !HEX.test(t.palette[k]);
            return (
              <div key={k} className="swatch">
                <div className="field">
                  <label className="field__label" htmlFor={`p_${k}`}>{PALETTE_LABEL[k]}</label>
                  <input id={`p_${k}`} name={`p_${k}`} value={t.palette[k]} maxLength={7} required spellCheck={false} autoComplete="off"
                    aria-invalid={bad || undefined} aria-describedby={bad ? `p_${k}-e` : undefined}
                    onChange={(e) => setColor(k, e.target.value)} onBlur={(e) => setColor(k, norm(e.target.value))} />
                  {bad && <p id={`p_${k}-e`} className="field__error"><Icon name="alert-circle" size={16} /><span>Gunakan format #RRGGBB.</span></p>}
                </div>
                <input type="color" aria-label={`Pilih ${PALETTE_LABEL[k]}`} value={bad ? '#000000' : t.palette[k]} onChange={(e) => setColor(k, e.target.value.toUpperCase())} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="type-title">
        <div className="card__head">
          <h2 id="type-title" className="card__title"><Icon name="layout" size={20} />Huruf dan tata letak</h2>
        </div>
        <div className="stack">
          <fieldset className="choices">
            <legend>Gaya huruf</legend>
            {FONTS.map((f) => (
              <label key={f.id} className="choice">
                <input type="radio" name="font_preset" value={f.id} checked={t.font_preset === f.id} onChange={() => setT((cur) => ({ ...cur, font_preset: f.id }))} />
                <span className="choice__name">{f.name}</span>
                <span className={cx('theme-scope', fontClasses[f.id], 'font-sample')} aria-hidden="true">Aa Kelas</span>
                <span className="choice__note">{f.note}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="choices">
            <legend>Tata letak Beranda</legend>
            {LAYOUTS.map((l) => (
              <label key={l.id} className="choice">
                <input type="radio" name="layout" value={l.id} checked={t.layout === l.id} onChange={() => setT((cur) => ({ ...cur, layout: l.id }))} />
                <span className="choice__name">{l.name}</span>
                <span className="choice__note">{l.note}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </section>

      <section className="card" aria-labelledby="contrast-title">
        <div className="card__head">
          <h2 id="contrast-title" className="card__title"><Icon name="shield" size={20} />Laporan kontras</h2>
          <Chip tone="outline">Minimal 4,5:1</Chip>
        </div>
        {!hexOk ? (
          <p className="muted">Lengkapi semua warna (#RRGGBB) untuk melihat laporan.</p>
        ) : (
          <div className="stack stack--sm">
            <Notice tone={failing.length === 0 ? 'success' : 'warning'} role="status">
              {failing.length === 0 ? 'Semua pasangan warna lulus.' : `${failing.length} pasangan belum lulus. Publikasikan aktif setelah semuanya lulus.`}
            </Notice>
            <ul className="report">
              {[...failing, ...report.filter((r) => r.ok)].map((r) => (
                <li key={`${r.fg}-${r.bg}`}>
                  <Icon name={r.ok ? 'check-circle' : 'alert-triangle'} size={16} className={r.ok ? 'ok' : 'bad'} />
                  <span className="sr-only">{r.ok ? 'Lulus: ' : 'Gagal: '}</span>
                  <span>{pairLabel(r.fg, r.bg)}</span>
                  <span className="nums">{ratioText(r.ratio)}:1</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="form__actions form__actions--sticky">
        <button type="button" className="btn btn--secondary" onClick={() => setT(DEFAULT_THEME)}>
          <Icon name="archive" size={18} />Kembalikan ke bawaan
        </button>
        <button type="submit" className="btn" disabled={!canSave} aria-busy={pending}>
          {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
          {pending ? 'Menyimpan…' : 'Publikasikan'}
        </button>
      </div>
    </form>
  );
}
