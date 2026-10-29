'use client';
import { useActionState, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { ExtLink } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { cleanInvKey, INV_KEY_LENGTH, INV_KEY_QUOTA, INV_TTL_LABEL } from '@/lib/inventory/keys';
import { formatWhen } from '@/lib/time';
import { createInventoryKey, openInventory, type InventoryView } from './actions';

// Pembuatan key: satu formulir. Isian kosong = key acak dari server; isian
// 16 karakter = key pilihan sendiri. Key baru tampil sekali di sini, lalu
// tetap bisa disalin dari daftar di bawahnya.
export function InventoryKeyForm({ used, tz }: { used: number; tz: string }) {
  const [state, act, pending] = useActionState(createInventoryKey, null);
  const [token, setToken] = useState('');
  const left = Math.max(0, INV_KEY_QUOTA - used);
  const exhausted = left === 0;
  const error = state && !state.ok ? state.error.message : null;

  return (
    <div className="stack stack--sm">
      <form action={act} className="form" aria-busy={pending}>
        <div className="form__grid form__grid--2">
          <div className="field">
            <label className="field__label" htmlFor="inv-key-input">
              inv_key <span className="muted">(opsional)</span>
            </label>
            <input id="inv-key-input" name="token" className="key-code" value={token}
              maxLength={INV_KEY_LENGTH} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              placeholder="Kosongkan untuk key acak"
              onChange={(e) => setToken(cleanInvKey(e.currentTarget.value))}
              aria-describedby="inv-key-hint" disabled={pending || exhausted} />
            <p id="inv-key-hint" className="field__hint">
              Tepat {INV_KEY_LENGTH} karakter: huruf, angka, - atau _. Kosongkan agar dibuat acak;
              huruf kecil otomatis menjadi kapital.
            </p>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="inv-key-ttl">Masa aktif</label>
            <select id="inv-key-ttl" name="ttl" defaultValue="7d" disabled={pending || exhausted}>
              {Object.entries(INV_TTL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <p className="field__hint">Key berhenti bekerja saat masa aktif habis atau saat kamu mencabutnya, dan slotnya kembali kosong.</p>
          </div>
        </div>
        <div className="form__actions">
          <span className="muted" role="status">
            {exhausted
              ? '12 slot key aktif sedang penuh. Cabut key lama untuk membuat yang baru.'
              : `${left} dari ${INV_KEY_QUOTA} slot key aktif tersisa.`}
          </span>
          <button type="submit" className="btn" disabled={pending || exhausted} aria-busy={pending}>
            {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="key" size={18} />}
            {pending ? 'Membuat…' : 'Buat inv_key'}
          </button>
        </div>
      </form>

      {error && <Notice tone="error" role="alert">{error}</Notice>}

      {state?.ok && (
        <Notice tone="success" role="status">
          <strong>inv_key dibuat: </strong>
          <code className="key-code">{state.data.token}</code>{' '}
          <CopyButton text={state.data.token} label="Salin inv_key" />{' '}
          <span>
            {state.data.expiresAt
              ? `Berlaku sampai ${formatWhen(state.data.expiresAt, tz)}.`
              : 'Tanpa kedaluwarsa.'}
          </span>
        </Notice>
      )}
    </div>
  );
}

// Halaman publik: form lalu hasil, tanpa menyimpan key di URL atau localStorage.
export function InventoryAccess({ tz }: { tz: string }) {
  const [state, act, pending] = useActionState(openInventory, null);
  const error = state && !state.ok ? state.error.message : null;

  return (
    <div className="stack">
      <form action={act} className="card form" aria-busy={pending}>
        <div className="field">
          <label className="field__label" htmlFor="access-key">inv_key</label>
          <input id="access-key" name="key" className="key-code" required
            minLength={INV_KEY_LENGTH} maxLength={INV_KEY_LENGTH}
            autoCapitalize="characters" autoComplete="off" spellCheck={false}
            placeholder="16 karakter" aria-describedby="access-key-hint" disabled={pending} />
          <p id="access-key-hint" className="field__hint">
            Masukkan inv_key dari pemilik inventory. Key hanya dipakai untuk permintaan ini dan
            tidak disimpan di alamat halaman.
          </p>
        </div>
        <div className="form__actions">
          <button type="submit" className="btn" disabled={pending} aria-busy={pending}>
            {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="key" size={18} />}
            {pending ? 'Membuka…' : 'Buka inventory'}
          </button>
        </div>
      </form>

      {error && <Notice tone="error" role="alert">{error}</Notice>}

      <div aria-live="polite">
        {state?.ok && <InventoryResult view={state.data} tz={tz} />}
      </div>
    </div>
  );
}

function InventoryResult({ view, tz }: { view: InventoryView; tz: string }) {
  return (
    <section aria-labelledby="inv-result-title">
      <div className="section__head">
        <h2 id="inv-result-title" className="section__title">
          <Icon name="link" size={20} />Inventory {view.ownerName ?? 'anggota kelas'}
        </h2>
        <Chip tone="success" icon="check-circle">Key berlaku</Chip>
      </div>
      <div className="stack stack--sm">
        <p className="muted">
          {view.items.length} tautan · {view.expiresAt
            ? `berlaku sampai ${formatWhen(view.expiresAt, tz)}`
            : 'tanpa kedaluwarsa'}
        </p>
        {view.items.length === 0 ? (
          <div className="card">
            <EmptyState compact icon="link" title="Inventory ini masih kosong">
              Pemilik belum menambahkan tautan apa pun.
            </EmptyState>
          </div>
        ) : (
          <ul className="rows card card--flush">
            {view.items.map((item) => (
              <li key={item.id} className="row">
                <div className="row__body">
                  <ExtLink href={item.url} className="row__title key-url">{item.url}</ExtLink>
                  {item.createdAt && (
                    <span className="muted">Ditambahkan {formatWhen(item.createdAt, tz)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
