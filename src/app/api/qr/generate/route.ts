import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import { cleanupExpiredQr, uploadQrPng } from '@/lib/qr/server';
import { renderQrPng } from '@/lib/qr/server-render';
import {
  DEFAULT_CUSTOM_STYLE, DEFAULT_ICON_STYLE, composeQrStyle, parseQrColor,
  type QrBarOrientation, type QrDotShape, type QrIconShape,
} from '@/lib/qr/style';
import { validateQrText } from '@/lib/qr/text';

export const runtime = 'nodejs';

const limiter = createRateLimiter(8, 10 * 60 * 1000);
const MAX_BODY = 3 * 1024 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;

const json = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const color = z.string().trim().refine((value) => parseQrColor(value) !== null, 'Warna tidak valid.');
const iconStyle = z.object({
  shape: z.enum(['square', 'rounded', 'circle', 'triangle', 'outline']),
  fit: z.enum(['crop', 'shrink']),
  gap: z.boolean(),
  thickness: z.number().int().min(1).max(100),
  borderColor: color,
});
const bodySchema = z.object({
  text: z.string().max(4000),
  style: z.object({
    mode: z.enum(['normal', 'custom']),
    dotShape: z.enum(['square', 'circle', 'block']),
    barOrientation: z.enum(['horizontal', 'vertical', 'diagonal_down', 'diagonal_up']).optional(),
    fillColor: color,
    backColor: color,
    icon: iconStyle.optional(),
  }),
  icon: z.object({
    width: z.number().int().min(1).max(1024),
    height: z.number().int().min(1).max(1024),
    data: z.string().max(4_200_000),
  }).nullable().optional(),
});

// Tamu tidak menerima renderer di browser. Endpoint ini menerima parameter
// final, membuat matriks + PNG di server, lalu menyimpan hasilnya di qr-shares.
export async function POST(request: Request) {
  if (!limiter(clientKey(request))) {
    return json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }, 429);
  }
  const length = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY) {
    return json({ error: 'Data QR terlalu besar.' }, 413);
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Data QR tidak bisa dibaca.' }, 400);
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return json({ error: 'Parameter QR tidak valid.' }, 400);

  const text = parsed.data.text.trim();
  const textError = validateQrText(text);
  if (textError) return json({ error: textError }, 400);

  const style = composeQrStyle({
    mode: parsed.data.style.mode,
    dotShape: parsed.data.style.dotShape as QrDotShape,
    barOrientation: parsed.data.style.barOrientation as QrBarOrientation | undefined,
    fillColor: parseQrColor(parsed.data.style.fillColor) ?? DEFAULT_CUSTOM_STYLE.fillColor,
    backColor: parseQrColor(parsed.data.style.backColor) ?? DEFAULT_CUSTOM_STYLE.backColor,
    icon: parsed.data.style.icon
      ? {
          ...parsed.data.style.icon,
          shape: parsed.data.style.icon.shape as QrIconShape,
          borderColor: parseQrColor(parsed.data.style.icon.borderColor) ?? DEFAULT_ICON_STYLE.borderColor,
        }
      : undefined,
  });

  let icon: { width: number; height: number; data: Uint8Array } | null = null;
  if (parsed.data.icon) {
    const data = new Uint8Array(Buffer.from(parsed.data.icon.data, 'base64'));
    if (data.byteLength !== parsed.data.icon.width * parsed.data.icon.height * 4
      || data.byteLength > MAX_ICON_BYTES) {
      return json({ error: 'Data ikon tidak valid.' }, 400);
    }
    icon = { width: parsed.data.icon.width, height: parsed.data.icon.height, data };
  }

  let rendered: ReturnType<typeof renderQrPng>;
  try {
    rendered = renderQrPng({ text, style, icon });
  } catch {
    return json({ error: 'Teks ini terlalu panjang untuk QR koreksi galat H.' }, 400);
  }

  try {
    await cleanupExpiredQr();
  } catch (error) {
    console.error('Pembersihan QR sebelum render gagal', error);
  }

  try {
    const result = await uploadQrPng(rendered.bytes, `eclipse-qr-${Date.now()}.png`);
    return json(result);
  } catch (error) {
    console.error('Render QR gagal disimpan', error);
    return json({ error: 'Gambar QR belum bisa disimpan. Coba lagi.' }, 503);
  }
}
