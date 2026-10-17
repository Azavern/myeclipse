import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Menjaga proyek Supabase free tier tidak di-pause. Vercel Cron mengirim "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new NextResponse(null, { status: 401 });
  const { error } = await (await createClient()).from('class_identity_v').select('id').limit(1);
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
}
