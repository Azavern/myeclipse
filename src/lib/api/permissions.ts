import {
  API_ACTIONS, API_RESOURCES, DEFAULT_SCOPE, SCOPED_RESOURCES,
  type ApiAction, type ApiResourceKey, type ScopeValue,
} from './resources';

export type ApiPermissions = Record<string, Partial<Record<ApiAction, boolean>>>;
export type ApiScope = Record<string, ScopeValue>;

const RESOURCE_KEYS = new Set<string>(API_RESOURCES.map((resource) => resource.key));
const ACTION_KEYS = new Set<string>(API_ACTIONS);
const SCOPE_BY_RESOURCE = new Map<string, Set<string>>(
  SCOPED_RESOURCES.map((resource) => [resource.key, new Set<string>(resource.scopeOptions)] as const),
);

// Membuang resource/aksi yang tidak dikenal dan nilai selain `true`. Bentuk ini
// yang disimpan ke JSONB, jadi data lama atau kiriman klien tidak bisa menambah
// izin di luar katalog.
export function normalizePermissions(input: unknown): ApiPermissions {
  const out: ApiPermissions = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [resource, actions] of Object.entries(input as Record<string, unknown>)) {
    if (!RESOURCE_KEYS.has(resource)) continue;
    if (!actions || typeof actions !== 'object' || Array.isArray(actions)) continue;
    const allowed: Partial<Record<ApiAction, boolean>> = {};
    for (const [action, value] of Object.entries(actions as Record<string, unknown>)) {
      if (ACTION_KEYS.has(action) && value === true) allowed[action as ApiAction] = true;
    }
    if (Object.keys(allowed).length > 0) out[resource] = allowed;
  }
  return out;
}

export function normalizeScope(input: unknown): ApiScope {
  const out: ApiScope = { ...DEFAULT_SCOPE };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [resource, value] of Object.entries(input as Record<string, unknown>)) {
    const allowed = SCOPE_BY_RESOURCE.get(resource);
    if (!allowed || typeof value !== 'string' || !allowed.has(value)) continue;
    out[resource] = value as ScopeValue;
  }
  return out;
}

export function isAllowed(permissions: ApiPermissions, resource: ApiResourceKey, action: ApiAction): boolean {
  return permissions[resource]?.[action] === true;
}

export function permissionCount(permissions: ApiPermissions): number {
  return Object.values(permissions).reduce(
    (total, actions) => total + Object.values(actions).filter(Boolean).length, 0,
  );
}

export function scopeFor(scope: ApiScope, resource: ApiResourceKey): ScopeValue {
  return scope[resource] ?? 'none';
}

export type ScopeContext = {
  ownerId: string;
  memberIds: readonly string[];
  rowOwnerId: string;
  /** Nilai kolom `visibility` baris, bila ada. */
  visibility?: string | null;
};

// Cakupan hanya menyaring baris; izin operasi tetap diperiksa terpisah.
export function scopeMatches(value: ScopeValue, ctx: ScopeContext): boolean {
  switch (value) {
    case 'all': return true;
    case 'selected': return ctx.memberIds.includes(ctx.rowOwnerId);
    case 'self': return ctx.rowOwnerId === ctx.ownerId;
    case 'public': return ctx.visibility === 'public';
    default: return false;
  }
}

// Penulisan resource milik anggota hanya boleh untuk key dengan cakupan `self`,
// dan baris yang disentuh harus milik pemilik key. API tidak mewakili anggota lain.
export function canWriteOwned(scope: ApiScope, resource: ApiResourceKey, ownerId: string, rowOwnerId: string): boolean {
  return scopeFor(scope, resource) === 'self' && ownerId === rowOwnerId;
}
