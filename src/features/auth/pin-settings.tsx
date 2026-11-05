'use client';
import { useActionState, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice } from '@/components/ui/primitives';
import { removePin, setPin } from './pin-actions';

// PIN adalah alternatif kata sandi saat masuk, bukan pengganti 2FA. Perubahan
// dan penghapusan PIN dikonfirmasi dengan kata sandi agar sesi yang ditinggal
// terbuka tidak bisa mengubah kredensial.
export function PinSettings({ enabled }: { enabled: boolean }) {
  const [save, saveAction, saving] = useActionState(setPin, null);
  const [remove, removeAction, removing] = useActionState(removePin, null);
  const [confirming, setConfirming] = useState(false);
  const busy = saving || removing;

  return (
    <section className="card" aria-labelledby="h-pin">
      <div className="card__head">
        <div>
          <h2 id="h-pin" className="card__title"><Icon name="key" size={20} />PIN masuk</h2>
          <p className="card__desc">Alternatif kata sandi: masuk dengan email dan PIN 6 angka.</p>
        </div>
        <Chip tone={enabled ? 'success' : 'neutral'} icon={enabled ? 'check-circle' : 'key'}>
          {enabled ? 'Aktif' : 'Belum aktif'}
        </Chip>
      </div>

      <div className="stack stack--sm">
        <p className="muted">
          PIN hanya 6 angka, jadi setelah 5 kali salah PIN dikunci selama 15 menit. Jangan pakai tanggal lahir
          atau angka yang mudah ditebak. Verifikasi dua langkah tetap diminta setelah PIN bila aktif.
        </p>

        <form action={saveAction} className="stack stack--sm">
          <h3>{enabled ? 'Ganti PIN' : 'Buat PIN'}</h3>
          {save?.error && <Notice tone="error" role="alert">{save.error}</Notice>}
          <div className="field">
            <label className="field__label" htmlFor="pin-password">Kata sandi saat ini</label>
            <input id="pin-password" name="current" type="password" autoComplete="current-password"
              maxLength={72} required disabled={busy} />
            <p className="field__hint">Dipakai untuk mengonfirmasi bahwa ini benar-benar kamu.</p>
          </div>
          <div className="form__grid form__grid--2">
            <div className="field">
              <label className="field__label" htmlFor="pin-new">PIN baru</label>
              <input id="pin-new" name="pin" type="password" className="otp-input" inputMode="numeric"
                pattern="\d{6}" maxLength={6} autoComplete="off" required disabled={busy} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="pin-confirm">Ulangi PIN baru</label>
              <input id="pin-confirm" name="confirm" type="password" className="otp-input" inputMode="numeric"
                pattern="\d{6}" maxLength={6} autoComplete="off" required disabled={busy} />
            </div>
          </div>
          <button type="submit" className="btn" disabled={busy} aria-busy={saving}>
            {saving ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
            {saving ? 'Menyimpan…' : enabled ? 'Ganti PIN' : 'Aktifkan PIN'}
          </button>
        </form>

        {enabled && (
          <div className="stack stack--sm">
            {remove?.error && <Notice tone="error" role="alert">{remove.error}</Notice>}
            {!confirming ? (
              <button type="button" className="btn btn--danger-soft" disabled={busy} onClick={() => setConfirming(true)}>
                <Icon name="trash" size={18} />Hapus PIN
              </button>
            ) : (
              <div className="stack stack--sm" role="group" aria-label="Konfirmasi menghapus PIN">
                <Notice tone="warning">
                  Setelah PIN dihapus, kamu hanya bisa masuk dengan kata sandi. Kata sandi tetap berlaku.
                </Notice>
                <form action={removeAction} className="stack stack--sm">
                  <div className="field">
                    <label className="field__label" htmlFor="pin-remove-password">Kata sandi saat ini</label>
                    <input id="pin-remove-password" name="current" type="password" autoComplete="current-password"
                      maxLength={72} required disabled={removing} />
                  </div>
                  <div className="cluster">
                    <button type="submit" className="btn btn--danger-soft" disabled={removing} aria-busy={removing}>
                      {removing ? <Icon name="loader" size={18} className="spin" /> : <Icon name="trash" size={18} />}
                      {removing ? 'Menghapus…' : 'Ya, hapus PIN'}
                    </button>
                    <button type="button" className="btn btn--ghost" disabled={removing} onClick={() => setConfirming(false)}>
                      Batal
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
