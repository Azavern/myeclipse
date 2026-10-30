import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { QR_TTL_HOURS } from './style';

export const QR_BUCKET = 'qr-shares';
export const QR_TTL_MS = QR_TTL_HOURS * 60 * 60 * 1000;

const MAX_DELETE_PER_SWEEP = 100;

// Objek lebih tua dari 6 jam dihapus lewat Storage API (bukan SQL langsung).
// Dipanggil sebelum unggah, dari halaman /qr, dan endpoint pembersih; tidak ada
// job latar terpisah, jadi umur file bisa sedikit melewati 6 jam bila tidak ada
// aktivitas sama sekali.
export async function cleanupExpiredQr(now = new Date()): Promise<number> {
  const admin = createAdminClient();
  const cutoff = now.getTime() - QR_TTL_MS;
  const { data, error } = await admin.storage.from(QR_BUCKET).list('', {
    limit: 1000,
    sortBy: { column: 'created_at', order: 'asc' },
  });
  if (error) throw new Error(`Daftar objek QR gagal: ${error.message}`);

  const expired = (data ?? [])
    .filter((object) => object.created_at && new Date(object.created_at).getTime() < cutoff)
    .slice(0, MAX_DELETE_PER_SWEEP)
    .map((object) => object.name);
  if (expired.length === 0) return 0;

  const { data: removed, error: removeError } = await admin.storage.from(QR_BUCKET).remove(expired);
  if (removeError) throw new Error(`Hapus objek QR gagal: ${removeError.message}`);
  return removed?.length ?? 0;
}

export async function uploadQrPng(bytes: Uint8Array, filename: string) {
  const admin = createAdminClient();
  const path = `${crypto.randomUUID()}.png`;
  const { error } = await admin.storage.from(QR_BUCKET).upload(path, bytes, {
    contentType: 'image/png',
    upsert: false,
    // Cache CDN pendek supaya objek yang sudah dihapus tidak terus tersaji.
    cacheControl: '3600',
  });
  if (error) throw new Error(`Unggah QR gagal: ${error.message}`);

  const url = admin.storage.from(QR_BUCKET).getPublicUrl(path).data.publicUrl;
  const separator = url.includes('?') ? '&' : '?';
  return {
    url,
    downloadUrl: `${url}${separator}download=${encodeURIComponent(filename)}`,
    expiresAt: new Date(Date.now() + QR_TTL_MS).toISOString(),
  };
}
