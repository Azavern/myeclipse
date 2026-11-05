'use client';
import { useActionState, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice } from '@/components/ui/primitives';
import { beginTotpEnrollment, removeTotp, verifyTotpEnrollment } from './mfa-actions';

// Pengaturan TOTP per akun. Rahasia dan QR hanya ditampilkan sekali selama
// pendaftaran; setelah diverifikasi, Supabase menyimpannya dan halaman ini hanya
// menampilkan status aktif.
export function TwoFactor({ enabled, hasPin }: { enabled: boolean; hasPin: boolean }) {
  const [enroll, enrollAction, enrolling] = useActionState(beginTotpEnrollment, null);
  const [verify, verifyAction, verifying] = useActionState(verifyTotpEnrollment, null);
  const [remove, removeAction, removing] = useActionState(removeTotp, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="card" aria-labelledby="h-2fa">
      <div className="card__head">
        <div>
          <h2 id="h-2fa" className="card__title"><Icon name="shield" size={20} />Verifikasi dua langkah</h2>
          <p className="card__desc">Selain kata sandi, minta kode 6 angka dari aplikasi authenticator saat masuk.</p>
        </div>
        <Chip tone={enabled ? 'success' : 'neutral'} icon={enabled ? 'check-circle' : 'shield'}>
          {enabled ? 'Aktif' : 'Belum aktif'}
        </Chip>
      </div>

      <div className="stack stack--sm">
        {enabled && (
          <>
            <p className="muted">
              Akun ini meminta kode dari aplikasi authenticator setiap kali masuk, termasuk lewat Google.
              Simpan perangkatmu dengan baik; bila hilang, minta pengelola kelas menghapus faktor 2FA akunmu.
            </p>
            {!confirming ? (
              <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
                <Icon name="shield" size={18} />Matikan verifikasi dua langkah
              </button>
            ) : (
              <div className="stack stack--sm" role="group" aria-label="Konfirmasi mematikan verifikasi dua langkah">
                <Notice tone="warning">
                  Tanpa verifikasi dua langkah, akun hanya dilindungi kata sandi. Kamu bisa mengaktifkannya lagi kapan saja.
                </Notice>
                <div className="cluster">
                  <form action={removeAction} className="stack stack--sm">
                    {hasPin && (
                      <div className="field">
                        <label className="field__label" htmlFor="pin-remove-2fa">PIN 6 angka</label>
                        <input id="pin-remove-2fa" name="pin" type="password" className="otp-input" inputMode="numeric"
                          pattern="\d{6}" maxLength={6} required autoComplete="off" disabled={removing} />
                      </div>
                    )}
                    {remove?.error && <Notice tone="error" role="alert">{remove.error}</Notice>}
                    <button type="submit" className="btn btn--danger-soft" disabled={removing} aria-busy={removing}>
                      {removing && <Icon name="loader" size={18} className="spin" />}{removing ? 'Mematikan…' : 'Ya, matikan'}
                    </button>
                  </form>
                  <button type="button" className="btn btn--ghost" disabled={removing} onClick={() => setConfirming(false)}>Batal</button>
                </div>
              </div>
            )}
          </>
        )}

        {!enabled && !enroll?.factor && (
          <form action={enrollAction} className="stack stack--sm">
            <p className="muted">
              Kamu akan memindai kode QR dengan aplikasi authenticator (misalnya Google Authenticator, Authy,
              atau 1Password), lalu memasukkan kode pertama untuk mengaktifkannya.
            </p>
            {enroll?.error && <Notice tone="error" role="alert">{enroll.error}</Notice>}
            <button type="submit" className="btn" disabled={enrolling} aria-busy={enrolling}>
              {enrolling ? <Icon name="loader" size={18} className="spin" /> : <Icon name="shield" size={18} />}
              {enrolling ? 'Menyiapkan…' : 'Aktifkan verifikasi dua langkah'}
            </button>
          </form>
        )}

        {!enabled && enroll?.factor && (
          <div className="stack">
            <p className="muted">Pindai kode QR ini, atau masukkan kunci manual bila kamera tidak tersedia.</p>
            <img src={enroll.factor.qr} alt="Kode QR untuk aplikasi authenticator" width={220} height={220} />
            <p className="muted">Kunci manual: <span className="pre">{enroll.factor.secret}</span></p>
            <form action={verifyAction} className="stack stack--sm">
              <input type="hidden" name="factorId" value={enroll.factor.id} />
              {verify?.error && <Notice tone="error" role="alert">{verify.error}</Notice>}
              <div className="field">
                <label className="field__label" htmlFor="totp-setup">Kode 6 angka dari aplikasi</label>
                <input id="totp-setup" name="code" className="otp-input" inputMode="numeric" autoComplete="one-time-code"
                  pattern="\d{6}" maxLength={6} required autoFocus disabled={verifying} />
                <p className="field__hint">Masukkan kode yang tampil setelah QR dipindai. Pendaftaran selesai setelah kode ini benar.</p>
              </div>
              <button type="submit" className="btn" disabled={verifying} aria-busy={verifying}>
                {verifying && <Icon name="loader" size={18} className="spin" />}{verifying ? 'Memeriksa…' : 'Verifikasi dan aktifkan'}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
