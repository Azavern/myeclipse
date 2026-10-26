'use client';
import { useEffect } from 'react';

// Service worker hanya untuk build produksi. Di dev, registrasi lama dicabut agar
// aset Turbopack tidak tersaji dari cache lama.
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => { void r.unregister(); }));
      return;
    }
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('Service worker gagal didaftarkan', error);
      });
    };
    if (document.readyState === 'complete') { register(); return; }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
