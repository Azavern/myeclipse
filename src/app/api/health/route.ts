import { NextResponse } from 'next/server';
import { cleanupExpiredQr } from '@/lib/qr/server';
import { createClient } from '@/lib/supabase/server';

// Menjaga proyek Supabase free tier tidak di-pause. Vercel Cron mengirim "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  const { error } = await (await createClient()).from('class_identity_v').select('id').limit(1);
  if (error) console.error('Pemeriksaan kesehatan Supabase gagal', { code: error.code, message: error.message });
  // Sekalian menyapu gambar QR yang lewat 6 jam saat cron harian berjalan.
  try { await cleanupExpiredQr(); } catch (cleanupError) { console.error('Pembersihan QR harian gagal', cleanupError); }
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
