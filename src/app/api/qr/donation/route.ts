import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const limiter = createRateLimiter(20, 10 * 60 * 1000);
const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Hanya URL QRIS donasi yang sudah sengaja diatur pengurus. Path privat tetap
// di server; tautan bertanda tangan berlaku singkat dan tidak pernah didaftar.
export async function GET(request: Request) {
  if (!limiter(clientKey(request))) {
    return json({ error: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.' }, 429);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from('qr_studio_settings')
    .select('qris_path').limit(1).maybeSingle();
  if (error) {
    console.error('QRIS donasi tidak terbaca', error.code);
    return json({ error: 'QRIS donasi belum bisa dibaca.' }, 503);
  }
  const path = (data as { qris_path: string | null } | null)?.qris_path;
  if (!path) return json({ error: 'Bendahara atau Ketua belum mengatur QRIS donasi.' }, 404);

  const { data: signed, error: signError } = await admin.storage
    .from('qr-studio-media').createSignedUrl(path, 300);
  if (signError || !signed?.signedUrl) {
    console.error('QRIS donasi gagal ditandatangani', signError?.message);
    return json({ error: 'QRIS donasi belum bisa ditampilkan.' }, 503);
  }
  return json({ url: signed.signedUrl, expiresAt: new Date(Date.now() + 300_000).toISOString() });
}
