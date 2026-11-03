'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { generateApiKey } from '@/lib/api/keys';
import { normalizePermissions, normalizeScope } from '@/lib/api/permissions';
import { API_RESOURCES, SCOPED_RESOURCES } from '@/lib/api/resources';
import { fail, type ActionResult } from '@/lib/result';

export type KeyFormState = ActionResult<{ id: string; secret: string | null }> | null;
export type KeyActionState = ActionResult<null> | null;

const nameSchema = z.string().trim().min(1, 'Nama API key wajib diisi.').max(60, 'Maksimal 60 karakter.');
const idSchema = z.string().uuid();

function permissionsFrom(fd: FormData) {
  const raw: Record<string, Record<string, boolean>> = {};
  for (const resource of API_RESOURCES) {
    for (const action of resource.actions) {
      if (fd.get(`p:${resource.key}:${action}`) === '1') {
        raw[resource.key] ??= {};
        raw[resource.key]![action] = true;
      }
    }
  }
  return normalizePermissions(raw);
}

function scopeFrom(fd: FormData) {
  const raw: Record<string, string> = {};
  for (const resource of SCOPED_RESOURCES) {
    const value = fd.get(`s:${resource.key}`);
    if (typeof value === 'string') raw[resource.key] = value;
  }
  return normalizeScope(raw);
}

function memberIdsFrom(fd: FormData) {
  return fd.getAll('member_ids')
    .filter((value): value is string => typeof value === 'string' && idSchema.safeParse(value).success)
    .slice(0, 200);
}

function rpcFailure<T>(error: { code?: string }, fallback: string): ActionResult<T> {
  console.error('developer api', error.code);
  if (error.code === '42501') return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');
  if (error.code === '22023') return fail('validation', 'Izin atau cakupan API key tidak valid.');
  if (error.code === '23505') return fail('conflict', 'Prefix key bentrok. Coba buat lagi.');
  if (error.code === 'EC080') return fail('conflict', 'API key yang sudah dicabut tidak dapat diubah.');
  if (error.code === 'P0002') return fail('not_found', 'API key tidak ditemukan.');
  return fail('unknown', fallback);
}

export async function createApiKey(_prev: KeyFormState, fd: FormData): Promise<KeyFormState> {
  const name = nameSchema.safeParse(fd.get('name'));
  if (!name.success) return fail('validation', name.error.issues[0]?.message ?? 'Nama API key tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');

  const generated = generateApiKey();
  const { data, error } = await ctx.supabase.rpc('create_api_key', {
    p_name: name.data,
    p_prefix: generated.prefix,
    p_secret_hash: generated.hash,
    p_permissions: permissionsFrom(fd),
    p_scope: scopeFrom(fd),
    p_member_ids: memberIdsFrom(fd),
  });
  if (error) return rpcFailure(error, 'API key belum bisa dibuat. Coba lagi.');

  const id = typeof data === 'string' ? data : null;
  if (!id) return fail('unknown', 'API key dibuat, tetapi ID-nya tidak terbaca. Muat ulang halaman.');
  revalidatePath('/settings/developer');
  return { ok: true, data: { id, secret: generated.key } };
}

export async function updateApiKey(_prev: KeyFormState, fd: FormData): Promise<KeyFormState> {
  const id = idSchema.safeParse(fd.get('id'));
  const name = nameSchema.safeParse(fd.get('name'));
  if (!id.success) return fail('validation', 'API key tidak valid.');
  if (!name.success) return fail('validation', name.error.issues[0]?.message ?? 'Nama API key tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');

  const { error } = await ctx.supabase.rpc('update_api_key', {
    p_id: id.data,
    p_name: name.data,
    p_permissions: permissionsFrom(fd),
    p_scope: scopeFrom(fd),
    p_member_ids: memberIdsFrom(fd),
  });
  if (error) return rpcFailure(error, 'Perubahan API key belum bisa disimpan.');

  revalidatePath('/settings/developer');
  revalidatePath(`/settings/developer/${id.data}`);
  return { ok: true, data: { id: id.data, secret: null } };
}

// Rotasi kredensial: prefix dan secret baru, izin/cakupan/nama tetap. Secret lama
// langsung tidak berlaku karena hash-nya ditimpa. Secret baru hanya dikembalikan
// ke pemanggil dan tidak pernah disimpan.
export async function rotateApiKey(_prev: KeyFormState, fd: FormData): Promise<KeyFormState> {
  const id = idSchema.safeParse(fd.get('id'));
  if (!id.success) return fail('validation', 'API key tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');

  const generated = generateApiKey();
  const { error } = await ctx.supabase.rpc('rotate_api_key', {
    p_id: id.data,
    p_prefix: generated.prefix,
    p_secret_hash: generated.hash,
  });
  if (error) return rpcFailure(error, 'API key belum bisa diperbarui. Coba lagi.');

  revalidatePath('/settings/developer');
  revalidatePath(`/settings/developer/${id.data}`);
  return { ok: true, data: { id: id.data, secret: generated.key } };
}

export async function setApiKeyStatus(_prev: KeyActionState, fd: FormData): Promise<KeyActionState> {
  const id = idSchema.safeParse(fd.get('id'));
  const status = z.enum(['active', 'disabled']).safeParse(fd.get('status'));
  if (!id.success || !status.success) return fail('validation', 'Status API key tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');

  const { error } = await ctx.supabase.rpc('set_api_key_status', { p_id: id.data, p_status: status.data });
  if (error) return rpcFailure(error, 'Status API key belum bisa diubah.');
  revalidatePath('/settings/developer');
  revalidatePath(`/settings/developer/${id.data}`);
  return { ok: true, data: null };
}

export async function revokeApiKey(_prev: KeyActionState, fd: FormData): Promise<KeyActionState> {
  const id = idSchema.safeParse(fd.get('id'));
  if (!id.success) return fail('validation', 'API key tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');

  const { error } = await ctx.supabase.rpc('revoke_api_key', { p_id: id.data });
  if (error) return rpcFailure(error, 'API key belum bisa dicabut.');
  revalidatePath('/settings/developer');
  revalidatePath(`/settings/developer/${id.data}`);
  return { ok: true, data: null };
}

export async function deleteApiKey(_prev: KeyActionState, fd: FormData): Promise<KeyActionState> {
  const id = idSchema.safeParse(fd.get('id'));
  if (!id.success) return fail('validation', 'API key tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return fail('forbidden', 'Kamu tidak punya izin untuk mengelola API key.');

  const { error } = await ctx.supabase.rpc('delete_api_key', { p_id: id.data });
  if (error) return rpcFailure(error, 'API key belum bisa dihapus.');
  revalidatePath('/settings/developer');
  redirect('/settings/developer');
}
