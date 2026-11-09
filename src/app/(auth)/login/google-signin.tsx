'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { beginGoogleSignIn, completeGoogleSignIn } from './google-actions';

// Tombol resmi Google Identity Services. Skrip Google hanya boleh dimuat di
// halaman masuk (CSP `allowsGoogleSignIn`); token yang diterima langsung dikirim
// ke Server Action untuk ditukar menjadi sesi Supabase.

type CredentialResponse = { credential?: string };
type GisButton = {
  type?: 'standard'; theme?: 'outline'; size?: 'large'; text?: 'continue_with';
  shape?: 'pill'; logo_alignment?: 'left'; width?: number;
};
type GisId = {
  initialize(config: {
    client_id: string; nonce: string; auto_select?: boolean; cancel_on_tap_outside?: boolean;
    use_fedcm_for_button?: boolean; callback: (response: CredentialResponse) => void;
  }): void;
  renderButton(parent: HTMLElement, options: GisButton): void;
};
declare global {
  interface Window { google?: { accounts?: { id?: GisId } } }
}

const SRC = 'https://accounts.google.com/gsi/client';
const UNAVAILABLE = 'Masuk dengan Google tidak bisa dimuat di peramban ini. Gunakan email dan kata sandi.';

function loadGis(): Promise<GisId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const finish = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('gis'));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-gsi]');
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('gis')), { once: true });
      window.setTimeout(finish, 8000);
      return;
    }
    const script = document.createElement('script');
    script.src = SRC;
    script.async = true;
    script.defer = true;
    script.dataset.gsi = '1';
    // GIS menyuntikkan <style> untuk tombolnya. Tanpa nonce, CSP memblokir style itu dan
    // SVG logo mewarisi max-width:100% dari reset aplikasi sehingga tampil raksasa.
    // Di produksi nonce dapat hanya berada di <script>, bukan <style>.
    const nonce = document.querySelector<HTMLElement>('[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('gis')), { once: true });
    document.head.appendChild(script);
  });
}

export function GoogleSignIn({ clientId, next }: { clientId: string; next: string }) {
  const router = useRouter();
  const slot = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const runId = useRef(0);
  const submitRef = useRef<(credential: string) => void>(() => {});
  // API GIS yang siap merender; renderButton baru dipanggil setelah wadah terlihat.
  const pending = useRef<GisId | null>(null);
  // Satu nonce per pemasangan komponen; StrictMode memanggil effect dua kali dan
  // dua permintaan nonce dapat saling menimpa cookie sebelum tombol dirender.
  const nonceRequest = useRef<ReturnType<typeof beginGoogleSignIn> | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'busy' | 'failed'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  const submit = useCallback(async (credential: string) => {
    setPhase('busy');
    try {
      const result = await completeGoogleSignIn(credential, next);
      if (!alive.current) return;
      if ('error' in result) {
        nonceRequest.current = null;
        setMessage(result.error);
        setPhase('failed');
        slot.current?.replaceChildren(); // nonce sudah terpakai; tombol lama tidak berlaku
        return;
      }
      router.replace(result.next);
      router.refresh();
    } catch {
      if (!alive.current) return;
      nonceRequest.current = null;
      setMessage(UNAVAILABLE);
      setPhase('failed');
      slot.current?.replaceChildren();
    }
  }, [next, router]);

  useEffect(() => { submitRef.current = (credential) => void submit(credential); }, [submit]);

  const prepare = useCallback(async () => {
    const run = ++runId.current;
    setPhase('loading');
    setMessage(null);
    pending.current = null;
    slot.current?.replaceChildren();
    if (!nonceRequest.current) nonceRequest.current = beginGoogleSignIn();
    const nonce = await nonceRequest.current.catch(() => null);
    if (run !== runId.current) return;
    if (!nonce || !nonce.ok) {
      nonceRequest.current = null;
      setMessage(nonce ? nonce.error : UNAVAILABLE);
      setPhase('failed');
      return;
    }
    const api = await loadGis().catch(() => null);
    if (run !== runId.current) return;
    if (!api) {
      setMessage(UNAVAILABLE);
      setPhase('failed');
      return;
    }
    const target = slot.current;
    if (!target) return;
    target.replaceChildren();
    api.initialize({
      client_id: clientId,
      nonce: nonce.hashedNonce,
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_button: true,
      callback: (response) => { if (response.credential) submitRef.current(response.credential); },
    });
    pending.current = api;
    // Wadah sengaja masih display:none selama memuat. GIS menghitung lebar tombol dari
    // wadah induk; saat wadah tersembunyi, GIS bisa merender varian selebar ikon sehingga
    // yang terlihat hanya logo G. Tampilkan wadah dulu, render di efek di bawah.
    setPhase('ready');
  }, [clientId]);

  useEffect(() => {
    alive.current = true;
    void prepare();
    return () => {
      alive.current = false;
      // Effect pertama StrictMode tidak boleh menyelesaikan initialize setelah effect kedua.
      runId.current += 1;
    };
  }, [prepare]);

  // Render setelah wadah benar-benar tampil agar GIS mengukur lebar nyata dan
  // menghasilkan tombol penuh (logo + teks), bukan tombol ikon saja.
  useEffect(() => {
    if (phase !== 'ready') return;
    const target = slot.current;
    const api = pending.current;
    if (!target || !api) return;
    const frame = requestAnimationFrame(() => {
      if (target.childElementCount > 0) return;
      try {
        api.renderButton(target, {
          type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'left',
        });
      } catch (error) {
        console.error('renderButton', error);
        setMessage(UNAVAILABLE);
        setPhase('failed');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return (
    <div className="google-signin">
      <div ref={slot} className={phase === 'ready' ? 'google-slot' : 'google-slot google-slot--idle'}
        aria-busy={phase === 'busy'} />
      {phase === 'loading' && (
        <p className="google-status" role="status">
          <Icon name="loader" size={16} className="spin" />Menyiapkan tombol Google…
        </p>
      )}
      {phase === 'busy' && (
        <p className="google-status" role="status">
          <Icon name="loader" size={16} className="spin" />Memeriksa akun Google…
        </p>
      )}
      {phase === 'failed' && (
        <button type="button" className="btn btn--secondary btn--lg btn--block" onClick={() => { nonceRequest.current = null; void prepare(); }}>
          <Icon name="log-in" size={18} />Coba masuk dengan Google lagi
        </button>
      )}
      {phase === 'failed' && message && <Notice tone="error" role="alert">{message}</Notice>}
    </div>
  );
}
