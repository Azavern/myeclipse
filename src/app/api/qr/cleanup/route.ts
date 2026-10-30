import { NextResponse } from 'next/server';
import { createRateLimiter, clientKey } from '@/lib/rate-limit';
import { cleanupExpiredQr } from '@/lib/qr/server';

export const runtime = 'nodejs';

const limiter = createRateLimiter(6, 10 * 60 * 1000);
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Pembersih file QR lebih dari 6 jam. Aman dipanggil publik karena hanya
// menghapus objek kedaluwarsa; bearer CRON_SECRET dipakai untuk penjadwal.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorized = !!secret && secret.length >= 32
    && request.headers.get('authorization') === `Bearer ${secret}`;
  if (!authorized && !limiter(clientKey(request))) {
    return json({ error: 'Terlalu banyak permintaan.' }, 429);
  }
  try {
    const removed = await cleanupExpiredQr();
    return json({ ok: true, removed });
  } catch (error) {
    console.error('Pembersihan QR gagal', error);
    return json({ error: 'Pembersihan belum bisa dijalankan.' }, 503);
  }
}

export const GET = handle;
export const POST = handle;
