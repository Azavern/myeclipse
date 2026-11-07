'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice } from '@/components/ui/primitives';
import { formatCountdown as clock } from '@/lib/time';
import { requestEmailCode, verifyEmailCode } from './email-change-actions';

type Pending = { email: string; expiresInSec: number; cooldownSec: number };

// Kartu "Email akun": alamat saat ini + status verifikasi, lalu alur ganti
// email (kirim OTP → dialog 6 angka). Email Supabase baru berubah setelah kode
// diverifikasi, jadi akun tidak pernah terkunci di alamat yang belum terbukti.
export function EmailChange({ current, verified, pending }: {
  current: string | null; verified: boolean; pending: Pending | null;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(current);
  const [isVerified, setIsVerified] = useState(verified);
  const [email, setEmail] = useState(current ?? '');
  const [pendingEmail, setPendingEmail] = useState(pending?.email ?? null);
  const [expiresIn, setExpiresIn] = useState(pending?.expiresInSec ?? 0);
  const [cooldown, setCooldown] = useState(pending?.cooldownSec ?? 0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Setelah router.refresh(), nilai dari server menjadi sumber kebenaran lagi.
  useEffect(() => { setConfirmed(current); setIsVerified(verified); }, [current, verified]);

  const anyTimer = cooldown > 0 || expiresIn > 0;
  useEffect(() => {
    if (!anyTimer) return;
    const t = window.setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
      setExpiresIn((e) => Math.max(0, e - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [anyTimer]);

  const target = email.trim().toLowerCase();
  const pendingValid = pendingEmail !== null && expiresIn > 0;

  function openDialog() {
    setError(null);
    setOpen(true);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    window.requestAnimationFrame(() => codeRef.current?.focus());
  }

  function closeDialog() {
    if (verifying) return;
    dialogRef.current?.close();
    setOpen(false);
    setError(null);
  }

  async function send() {
    setError(null);
    setDone(null);
    if (!target) { setError('Isi alamat email baru terlebih dahulu.'); return; }
    setSending(true);
    try {
      const res = await requestEmailCode(target);
      if (!res.ok) {
        setError(res.error);
        if (res.retryAfter) setCooldown(res.retryAfter);
        return;
      }
      setPendingEmail(res.email);
      setExpiresIn(res.expiresIn);
      setCooldown(res.cooldown);
      setCode('');
      openDialog();
    } catch {
      setError('Permintaan belum bisa diproses. Coba lagi.');
    } finally {
      setSending(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) { setError('Kode terdiri dari 6 angka.'); return; }
    setVerifying(true);
    try {
      const res = await verifyEmailCode(code);
      if (!res.ok) { setError(res.error); return; }
      dialogRef.current?.close();
      setOpen(false);
      setPendingEmail(null);
      setExpiresIn(0);
      setCooldown(0);
      setCode('');
      setEmail(res.email);
      setConfirmed(res.email);
      setIsVerified(true);
      setDone(`Email akunmu sekarang ${res.email}.`);
      router.refresh();
    } catch {
      setError('Kode belum bisa dicek. Coba lagi.');
    } finally {
      setVerifying(false);
    }
  }

  const blockedByCooldown = cooldown > 0 && (!pendingValid || target !== pendingEmail);
  const mainLabel = sending ? 'Mengirim…' : pendingValid ? 'Buka verifikasi' : 'Verifikasi';

  return (
    <section data-ui="panel" className="card" aria-labelledby="email-title">
      <div className="card__head">
        <div>
          <h2 id="email-title" className="card__title"><Icon name="at" size={20} />Email akun</h2>
          <p className="card__desc">Email dipakai untuk masuk dan menerima kode verifikasi.</p>
        </div>
      </div>

      <div className="stack stack--sm">
        <div className="cluster">
          <span className="muted">Email saat ini</span>
          <strong className="pre">{confirmed ?? 'Belum terbaca'}</strong>
          {isVerified
            ? <Chip tone="success" icon="check-circle">Terverifikasi</Chip>
            : <Chip tone="warning" icon="alert-triangle">Belum terverifikasi</Chip>}
        </div>

        {!isVerified && (
          <Notice tone="warning">
            {confirmed
              ? 'Email akun ini belum terverifikasi. Masukkan alamat yang sama atau alamat baru, lalu masukkan kode yang kami kirim.'
              : 'Email akun belum terbaca. Muat ulang halaman sebelum menggantinya.'}
          </Notice>
        )}

        {pendingEmail && (pendingValid ? (
          <Notice tone="info">
            Menunggu verifikasi untuk <strong className="pre">{pendingEmail}</strong>. Kode berlaku {clock(expiresIn)} lagi.
          </Notice>
        ) : (
          <Notice tone="warning">
            Kode untuk <strong className="pre">{pendingEmail}</strong> sudah kedaluwarsa. Tekan Verifikasi untuk mengirim kode baru.
          </Notice>
        ))}

        <div className="field">
          <label className="field__label" htmlFor="new-email">Email baru</label>
          <div className="field-row">
            <input id="new-email" name="email" type="email" required maxLength={254} autoComplete="email"
              placeholder="nama@email.com" value={email} disabled={sending || verifying}
              onChange={(e) => { setEmail(e.target.value); setError(null); setDone(null); }} />
            <button data-ui="button" type="button" className="btn" disabled={sending || verifying || blockedByCooldown}
              aria-busy={sending} onClick={() => (pendingValid && target === pendingEmail ? openDialog() : void send())}>
              {sending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="mail" size={18} />}
              {mainLabel}
            </button>
          </div>
          <p className="field__hint">
            {blockedByCooldown
              ? `Kode baru bisa dikirim dalam ${cooldown} detik.`
              : 'Kami kirim kode 6 angka ke alamat itu. Email akun baru berubah setelah kode diverifikasi.'}
          </p>
          {error && !open && <Notice tone="error" role="alert">{error}</Notice>}
          {done && <Notice tone="success" role="status">{done}</Notice>}
        </div>
      </div>

      <dialog data-ui="dialog" ref={dialogRef} aria-labelledby="otp-title" onClose={() => { setOpen(false); setError(null); }} onCancel={(e) => { if (verifying) e.preventDefault(); }}>
        <form onSubmit={verify} aria-busy={verifying}>
          <div className="dialog__body">
            <span className="tile" aria-hidden="true"><Icon name="mail" size={22} /></span>
            <h2 id="otp-title">Masukkan kode verifikasi</h2>
            <p className="muted">
              Kode 6 angka dikirim ke <strong className="pre">{pendingEmail ?? target}</strong>.
              {expiresIn > 0 ? ` Berlaku ${clock(expiresIn)} lagi.` : ' Kode sudah kedaluwarsa; kirim ulang.'}
            </p>
            <div className="field">
              <label className="field__label" htmlFor="otp-code">Kode verifikasi</label>
              <input ref={codeRef} id="otp-code" name="code" className="otp-input" inputMode="numeric" autoComplete="one-time-code"
                pattern="\d{6}" maxLength={6} value={code} disabled={verifying}
                aria-describedby="otp-hint"
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }} />
              <p id="otp-hint" className="field__hint">Hanya berlaku sekali dan berlaku 5 menit.</p>
            </div>
            {error && <Notice tone="error" role="alert">{error}</Notice>}
          </div>
          <div className="dialog__actions">
            <button data-ui="button" type="button" className="btn btn--ghost" disabled={verifying || cooldown > 0} onClick={() => void send()}>
              <Icon name="loader" size={16} className={sending ? 'spin' : undefined} />
              {cooldown > 0 ? `Kirim ulang (${cooldown} dtk)` : sending ? 'Mengirim…' : 'Kirim ulang kode'}
            </button>
            <button data-ui="button" type="button" className="btn btn--secondary" disabled={verifying} onClick={closeDialog}>Batal</button>
            <button data-ui="button" type="submit" className="btn" disabled={verifying || expiresIn === 0} aria-busy={verifying}>
              {verifying && <Icon name="loader" size={18} className="spin" />}{verifying ? 'Memeriksa…' : 'Verifikasi'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
