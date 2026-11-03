import { z } from 'zod';

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const MAX_BODY_BYTES = 64 * 1024;

export class ApiFailure extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiFailure';
  }
}

export function apiJson(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export function apiError(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return apiJson({ error: { code, message } }, status, headers);
}

export async function readJson(request: Request): Promise<unknown> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('application/json')) {
    throw new ApiFailure(415, 'unsupported_media_type', 'Kirim body JSON dengan Content-Type application/json.');
  }
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new ApiFailure(413, 'payload_too_large', 'Body melebihi batas 64 KB.');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiFailure(413, 'payload_too_large', 'Body melebihi batas 64 KB.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiFailure(400, 'invalid_json', 'Body bukan JSON yang valid.');
  }
}

export async function bodyOf<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiFailure(400, 'validation', parsed.error.issues[0]?.message ?? 'Isian tidak valid.');
  }
  return parsed.data as z.infer<T>;
}

export function pagination(url: URL): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get('limit') ?? '25');
  const rawOffset = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 25;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  return { limit, offset };
}

export function pageMeta(limit: number, offset: number, total: number | null) {
  return {
    limit,
    offset,
    ...(total === null ? {} : { total, has_more: offset + limit < total }),
  };
}

// Kesalahan PostgREST/Postgres tidak pernah diteruskan mentah ke klien.
export function dbFailure(error: { code?: string } | null): never {
  if (error?.code === '23505') throw new ApiFailure(409, 'conflict', 'Data yang sama sudah ada.');
  if (error?.code === 'PGRST116' || error?.code === 'P0002') {
    throw new ApiFailure(404, 'not_found', 'Data tidak ditemukan.');
  }
  if (error?.code === '23514' || error?.code === '22023' || error?.code === '22P02') {
    throw new ApiFailure(400, 'validation', 'Isian tidak memenuhi aturan.');
  }
  if (error?.code === '42501') throw new ApiFailure(403, 'forbidden', 'Operasi ini tidak diizinkan.');
  throw new ApiFailure(500, 'internal', 'Terjadi kesalahan pada server.');
}
