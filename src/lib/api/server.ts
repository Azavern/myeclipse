import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { apiError, ApiFailure } from './http';
import { normalizePermissions, normalizeScope, scopeFor, isAllowed, type ApiPermissions, type ApiScope } from './permissions';
import { parseApiKey, verifyApiKeySecret } from './keys';
import {
  API_RATE_LIMIT_PER_MINUTE, type ApiAction, type ApiResourceKey, type ScopeValue,
} from './resources';

type ApiKeyRow = {
  id: string; class_id: string; name: string; prefix: string; secret_hash: string;
  permissions: unknown; scope: unknown; status: string; created_by: string;
};

export type ApiPrincipal = {
  keyId: string;
  classId: string;
  ownerId: string;
  keyName: string;
  permissions: ApiPermissions;
  scope: ApiScope;
  memberIds: string[];
  timezone: string;
  admin: SupabaseClient;
};

// Service role hanya dipakai di server untuk operasi API key. Setiap query
// domain wajib menyertakan class_id dari baris key; bypass RLS dikompensasi
// dengan pemeriksaan izin dan cakupan di bawah.
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const unauthorized = () =>
  apiError(401, 'unauthorized', 'API key tidak valid.', { 'WWW-Authenticate': 'Bearer realm="eclipse-api"' });

export async function authenticate(
  request: Request,
): Promise<{ ok: true; principal: ApiPrincipal } | { ok: false; response: Response }> {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return { ok: false, response: unauthorized() };
  const parsed = parseApiKey(header.slice(7));
  if (!parsed) return { ok: false, response: unauthorized() };

  const { data, error } = await admin.from('api_keys')
    .select('id,class_id,name,prefix,secret_hash,permissions,scope,status,created_by')
    .eq('prefix', parsed.prefix)
    .maybeSingle();

  if (error) {
    console.error('api auth lookup', error.code);
    return { ok: false, response: apiError(503, 'unavailable', 'Layanan API sedang tidak tersedia.') };
  }
  const keyRow = data as ApiKeyRow | null;
  if (!keyRow || keyRow.status !== 'active' || !verifyApiKeySecret(parsed.secret, keyRow.secret_hash)) {
    return { ok: false, response: unauthorized() };
  }

  const [cls, members, quota] = await Promise.all([
    admin.from('classes').select('timezone').eq('id', keyRow.class_id).maybeSingle(),
    admin.from('api_key_members').select('user_id').eq('key_id', keyRow.id),
    admin.rpc('consume_api_quota', { p_key_id: keyRow.id, p_limit: API_RATE_LIMIT_PER_MINUTE }),
  ]);

  const classRow = cls.data as { timezone: string } | null;
  if (cls.error || !classRow) {
    console.error('api auth class', cls.error?.code ?? 'missing');
    return { ok: false, response: apiError(503, 'unavailable', 'Layanan API sedang tidak tersedia.') };
  }
  if (quota.error) {
    console.error('api quota', quota.error.code);
    return { ok: false, response: apiError(503, 'unavailable', 'Layanan API sedang tidak tersedia.') };
  }
  const quotaRow = (Array.isArray(quota.data) ? quota.data[0] : quota.data) as { allowed?: boolean } | null;
  if (!quotaRow?.allowed) {
    return {
      ok: false,
      response: apiError(429, 'rate_limited', 'Batas 120 permintaan per menit terlampaui.', { 'Retry-After': '60' }),
    };
  }
  if (members.error) {
    console.error('api auth members', members.error.code);
    return { ok: false, response: apiError(503, 'unavailable', 'Layanan API sedang tidak tersedia.') };
  }

  return {
    ok: true,
    principal: {
      keyId: keyRow.id,
      classId: keyRow.class_id,
      ownerId: keyRow.created_by,
      keyName: keyRow.name,
      permissions: normalizePermissions(keyRow.permissions),
      scope: normalizeScope(keyRow.scope),
      memberIds: (members.data ?? []).map((row) => (row as { user_id: string }).user_id),
      timezone: classRow.timezone,
      admin,
    },
  };
}

export type ApiContext = { principal: ApiPrincipal; request: Request };

type WithApiOptions = { resource: ApiResourceKey | null; action: ApiAction };

// Satu pintu untuk autentikasi, izin, error, dan audit. `resource: null` hanya
// untuk /whoami; endpoint lain selalu punya resource kanonis.
export async function withApi(
  request: Request,
  options: WithApiOptions,
  handler: (ctx: ApiContext) => Promise<Response>,
): Promise<Response> {
  const started = Date.now();
  let keyId: string | null = null;
  let classId: string | null = null;
  let status = 500;

  try {
    const auth = await authenticate(request);
    if (!auth.ok) {
      status = auth.response.status;
      return auth.response;
    }
    const { principal } = auth;
    keyId = principal.keyId;
    classId = principal.classId;

    if (options.resource && !isAllowed(principal.permissions, options.resource, options.action)) {
      status = 403;
      return apiError(403, 'forbidden', 'API key ini tidak memiliki izin untuk operasi tersebut.');
    }

    const response = await handler({ principal, request });
    status = response.status;
    return response;
  } catch (error) {
    if (error instanceof ApiFailure) {
      status = error.status;
      return apiError(error.status, error.code, error.message);
    }
    console.error('api:v1', options.resource ?? 'whoami', options.action, error instanceof Error ? error.message : 'unknown');
    status = 500;
    return apiError(500, 'internal', 'Terjadi kesalahan pada server.');
  } finally {
    if (keyId && classId) {
      try {
        const { error } = await admin.from('api_audit_log').insert({
          class_id: classId,
          api_key_id: keyId,
          method: request.method.slice(0, 10),
          path: new URL(request.url).pathname.slice(0, 300),
          resource: options.resource,
          status_code: status,
          duration_ms: Math.max(Date.now() - started, 0),
        });
        if (error) console.error('api audit insert', error.code);
      } catch (auditError) {
        // Audit tidak boleh mengubah hasil request yang sudah diproses.
        console.error('api audit insert', auditError instanceof Error ? auditError.message : 'unknown');
      }
    }
  }
}

// Cakupan `none` berarti key tidak diberi akses baca sama sekali; jangan
// mengembalikan daftar kosong yang ambigu.
export function readScope(principal: ApiPrincipal, resource: ApiResourceKey): ScopeValue {
  const value = scopeFor(principal.scope, resource);
  if (value === 'none') {
    throw new ApiFailure(403, 'scope', 'Cakupan API key ini tidak mengizinkan akses ke resource tersebut.');
  }
  return value;
}

export function requireSelfWrite(principal: ApiPrincipal, resource: ApiResourceKey): string {
  if (scopeFor(principal.scope, resource) !== 'self') {
    throw new ApiFailure(403, 'scope', 'Penulisan resource ini hanya diizinkan bila cakupannya "Pemilik API key".');
  }
  return principal.ownerId;
}
