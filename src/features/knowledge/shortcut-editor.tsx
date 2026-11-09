'use client';
import { Fragment, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { cx } from '@/lib/cx';
import { SHORTCUT_KEYBOARD_ROWS, SHORTCUT_KEY_LABELS } from '@/lib/knowledge/keyboard';
import {
  MAX_SHORTCUT_CARDS, MAX_SHORTCUT_KEYS, MAX_SHORTCUT_LABEL, MAX_SHORTCUT_NOTE,
  emptyShortcutDraft, type ShortcutDraft,
} from '@/lib/knowledge/shortcuts';

type PickerTarget = { card: number; slot: number };

export function ShortcutEditor({ cards, onChange, error }: {
  cards: ShortcutDraft[]; onChange: (cards: ShortcutDraft[]) => void; error?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  const updateCard = (index: number, patch: Partial<ShortcutDraft>) => {
    onChange(cards.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  };

  const addSlot = (index: number) => {
    const card = cards[index];
    if (!card || card.keys.length >= MAX_SHORTCUT_KEYS) return;
    updateCard(index, { keys: [...card.keys, ''] });
  };

  const openPicker = (card: number, slot: number) => {
    setPicker({ card, slot });
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  };

  const closePicker = () => {
    if (dialogRef.current?.open) dialogRef.current.close();
    setPicker(null);
  };

  const chooseKey = (key: string) => {
    if (!picker) return;
    const card = cards[picker.card];
    if (card) {
      const keys = card.keys.map((value, i) => (i === picker.slot ? key : value));
      updateCard(picker.card, { keys });
    }
    closePicker();
  };

  const addCard = () => {
    if (cards.length >= MAX_SHORTCUT_CARDS) return;
    const uid = globalThis.crypto?.randomUUID?.() ?? `baru-${Date.now()}`;
    onChange([...cards, emptyShortcutDraft(uid)]);
  };

  const removeCard = (index: number) => {
    if (cards.length <= 1) return;
    onChange(cards.filter((_, i) => i !== index));
  };

  return (
    <section className="kb-shortcuts-edit" aria-label="Editor kartu shortcut">
      <div className="kb-shortcuts-edit__intro">
        <p className="muted">
          Tekan slot kosong untuk memilih tombol. Tombol <strong>+</strong> menambah slot berikutnya;
          jelaskan di keterangan bila tombol harus ditekan bersamaan atau berurutan.
        </p>
      </div>

      <div className="kb-shortcuts-edit__list">
        {cards.map((card, index) => (
          <article className="kb-shortcut-edit" key={card.uid}>
            <div className="kb-shortcut-edit__head">
              <h3 className="kb-shortcut-edit__title">Kartu {index + 1}</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeCard(index)}
                disabled={cards.length <= 1} aria-label={`Hapus kartu ${index + 1}`}>
                <Icon name="trash" size={16} />Hapus
              </button>
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${card.uid}-label`}>Shortcut untuk apa?</label>
              <input id={`${card.uid}-label`} value={card.label} maxLength={MAX_SHORTCUT_LABEL}
                placeholder="Mis. Buka Settings di Windows" required
                onChange={(e) => updateCard(index, { label: e.currentTarget.value })} />
              <span className="field__count" aria-hidden="true">{card.label.length}/{MAX_SHORTCUT_LABEL}</span>
            </div>

            <div className="field">
              <span className="field__label" id={`${card.uid}-keys-label`}>Kombinasi tombol</span>
              <div className="kb-shortcut-edit__keys" role="group" aria-labelledby={`${card.uid}-keys-label`}>
                {card.keys.map((key, slot) => (
                  <Fragment key={`${card.uid}-${slot}`}>
                    {slot > 0 && <span className="kb-shortcut-edit__plus" aria-hidden="true">+</span>}
                    <button type="button" className={cx('kb-key-slot', !key && 'kb-key-slot--empty')}
                      aria-label={key ? `Tombol ${key}. Klik untuk mengganti` : `Pilih tombol ke-${slot + 1}`}
                      onClick={() => openPicker(index, slot)}>
                      {key ? <kbd className="kb-kbd">{key}</kbd> : <Icon name="plus" size={16} />}
                    </button>
                  </Fragment>
                ))}
                <button type="button" className="btn btn--secondary btn--icon kb-shortcut-edit__add-key"
                  aria-label="Tambah tombol ke kombinasi" title="Tambah tombol"
                  disabled={card.keys.length >= MAX_SHORTCUT_KEYS} onClick={() => addSlot(index)}>
                  <Icon name="plus" size={18} />
                </button>
              </div>
              <p className="field__hint">Klik slot untuk mengganti tombol. Minimal satu tombol, maksimal {MAX_SHORTCUT_KEYS}.</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${card.uid}-note`}>Keterangan <span className="muted">(opsional)</span></label>
              <textarea id={`${card.uid}-note`} value={card.note} maxLength={MAX_SHORTCUT_NOTE} rows={3}
                placeholder="Mis. Tekan bersamaan, atau tekan Alt, lalu H, 7, dan U secara berurutan."
                onChange={(e) => updateCard(index, { note: e.currentTarget.value })} />
              <span className="field__count" aria-hidden="true">{card.note.length}/{MAX_SHORTCUT_NOTE}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="kb-shortcuts-edit__foot">
        <button type="button" className="btn btn--secondary" onClick={addCard}
          disabled={cards.length >= MAX_SHORTCUT_CARDS}>
          <Icon name="plus" size={18} />Tambah kartu
        </button>
        <span className="muted">{cards.length}/{MAX_SHORTCUT_CARDS} kartu</span>
      </div>
      {error && <p className="field__error" role="alert"><Icon name="alert-circle" size={16} /><span>{error}</span></p>}

      <dialog ref={dialogRef} data-ui="dialog" className="kb-keyboard-dialog" aria-labelledby="kb-keyboard-title"
        onClose={() => setPicker(null)}
        onClick={(e) => { if (e.target === e.currentTarget) closePicker(); }}>
        <div className="kb-keyboard__head">
          <div>
            <h2 id="kb-keyboard-title">Pilih tombol</h2>
            {picker && <p className="muted">Kartu {picker.card + 1}, slot {picker.slot + 1}</p>}
          </div>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Tutup pemilih tombol" onClick={closePicker}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="kb-keyboard__body">
          <div className="kb-keyboard__rows">
            {SHORTCUT_KEYBOARD_ROWS.map((row, rowIndex) => (
              <div className="kb-keyboard__row" key={rowIndex}>
                {row.map((key, keyIndex) => (
                  <button type="button" key={`${key}-${keyIndex}`}
                    className={cx('kb-keyboard__key', key.length > 1 && 'kb-keyboard__key--wide', key === 'Space' && 'kb-keyboard__key--space')}
                    aria-label={SHORTCUT_KEY_LABELS[key] ?? key} onClick={() => chooseKey(key)}>
                    {key === 'Space' ? 'Space' : key}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="field__hint">Pilih satu tombol. Gunakan tombol + di samping slot untuk menambah tombol lain.</p>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={closePicker}>Batal</button>
        </div>
      </dialog>
    </section>
  );
}
