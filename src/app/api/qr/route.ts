import { NextResponse } from 'next/server';
import { createRateLimiter, clientKey } from '@/lib/rate-limit';
import { isQrPngSize, pngDimensions } from '@/lib/qr/png';
import { cleanupExpiredQr, uploadQrPng } from '@/lib/qr/server';
import { detectImage } from '@/lib/storage/magic-bytes';

export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024;
const MIN_SIDE = 348; // versi 1: (21 + 8) modul × 12 px
const MAX_SIDE = 2220; // versi 40: (177 + 8) modul × 12 px
const limiter = createRateLimiter(8, 10 * 60 * 1000);

const json = (body: object, status = 200, extra?: HeadersInit) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...extra } });

// Hanya menerima PNG yang dihasilkan renderer QR: persegi, ukuran modul 12 px,
// maksimal 4 MB. Bucket tujuan bersifat publik hanya untuk dibaca.
export async function POST(request: Request) {
  if (!limiter(clientKey(request))) {
    return json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }, 429, { 'Retry-After': '600' });
  }
  if (!(request.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
    return json({ error: 'Format unggahan tidak didukung.' }, 415);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Data unggahan tidak bisa dibaca.' }, 400);
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return json({ error: 'Gambar QR tidak ditemukan.' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'Ukuran gambar QR melebihi 4 MB.' }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (detectImage(bytes)?.mime !== 'image/png') return json({ error: 'Gambar QR harus berformat PNG.' }, 415);
  const dimensions = pngDimensions(bytes);
  if (!dimensions || !isQrPngSize(dimensions.width, dimensions.height)
    || dimensions.width < MIN_SIDE || dimensions.width > MAX_SIDE) {
    return json({ error: 'Dimensi gambar QR tidak dikenali.' }, 400);
  }

  // Pembersihan bersifat oportunistik: kegagalan daftar/hapus tidak boleh
  // menggagalkan unggahan baru. Endpoint /api/qr/cleanup menangani sisa file.
  try {
    await cleanupExpiredQr();
  } catch (error) {
    console.error('Pembersihan QR sebelum unggah gagal', error);
  }

  try {
    const result = await uploadQrPng(bytes, `eclipse-qr-${Date.now()}.png`);
    return json(result);
  } catch (error) {
    console.error('Unggah QR gagal', error);
    return json({ error: 'Gambar QR belum bisa disimpan. Coba lagi.' }, 503);
  }
}
