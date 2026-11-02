// Aturan murni pemilihan origin untuk sesi resumable Google Drive. Tanpa 'server-only'
// supaya aturannya bisa diuji Vitest; pembacaan env tetap di drive.ts.
import { originOf } from '../security/csp';

export type UploadOriginInput = {
  requestOrigin: string | null;
  requestHost: string | null;
  appUrl: string | undefined;
  extraOrigins: string | undefined;
};

// Host pertama dari header Host/x-forwarded-host; rantai proxy bisa berisi beberapa nilai.
function firstHost(value: string | null): string | null {
  const host = value?.split(',')[0]?.trim().toLowerCase();
  return host ? host : null;
}

/**
 * Origin yang diteruskan ke Google saat membuat sesi resumable, atau null bila ditolak.
 * Yang diterima hanya origin aplikasi sendiri: APP_URL, daftar GDRIVE_UPLOAD_ORIGINS, dan
 * origin yang host-nya sama dengan host permintaan. Perbandingan host menutup kasus
 * APP_URL tertulis http:// padahal peramban membuka https://, atau domain pratinjau Vercel.
 */
export function resolveUploadOrigin(o: UploadOriginInput): string | null {
  const fallback = originOf(o.appUrl);
  const allowed = new Set<string>(fallback ? [fallback] : []);
  for (const item of (o.extraOrigins ?? '').split(',')) {
    const origin = originOf(item.trim());
    if (origin) allowed.add(origin);
  }
  if (!o.requestOrigin) return fallback;

  const request = originOf(o.requestOrigin);
  if (request && allowed.has(request)) return request;

  // Server Action sudah menolak permintaan lintas origin, jadi host yang sama berarti
  // origin ini aplikasi sendiri. Origin sembarang tetap tidak pernah diteruskan ke Google.
  const host = firstHost(o.requestHost);
  if (request && host && new URL(request).host.toLowerCase() === host) return request;
  return null;
}
