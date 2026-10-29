'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, dbMessage, failState, invalid, type FormState } from '@/lib/form-state';
import { isValidInvKey, normalizeInvKey } from '@/lib/inventory/keys';
import { fail, type ActionResult } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';
import { idOf } from '@/lib/zod-fields';

// URL hanya divalidasi diawali https:// (permintaan produk); tidak ada
// pemeriksaan host, port, atau bentuk lain.
const itemSchema = z.object({
  url: z.string().trim().min(1, 'Tautan wajib diisi.').max(2048, 'Maksimal 2048 karakter.')
    .refine((v) => v.startsWith('https://'), 'Tautan harus diawali https://.'),
});

const keySchema = z.object({
  token: z.string().trim().max(16, 'Maksimal 16 karakter.').optional(),
  ttl: z.enum(['24h', '7d', '1m', '6m', 'never']),
});

const KEY_FORMAT = 'inv_key harus tepat 16 karakter: huruf, angka, - atau _.';

export async function addInventoryItem(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = itemSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.from('inventory_items').insert({
    class_id: ctx.classId, owner_id: ctx.user.id, url: parsed.data.url,
  });
  if (error) { console.error('inventory', 'add', error.code); return failState(dbMessage(error), fd); }
  revalidatePath('/inventory');
  redirect(withFlash('/inventory', 'created'));
}

export async function deleteInventoryItem(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  if (!id) return failState('Data tidak ditemukan.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { data, error } = await ctx.supabase.from('inventory_items').delete()
    .eq('id', id).eq('owner_id', ctx.user.id).select('id');
  if (error) { console.error('inventory', 'delete', error.code); return failState(dbMessage(error), fd); }
  if (!data?.length) return failState('Data tidak ditemukan.', fd);
  revalidatePath('/inventory');
  redirect(withFlash('/inventory', 'deleted'));
}

export type CreatedKey = { token: string; expiresAt: string | null };
export type KeyState = ActionResult<CreatedKey> | null;

export async function createInventoryKey(_p: KeyState, fd: FormData): Promise<KeyState> {
  const parsed = keySchema.safeParse({
    token: fd.get('token') ?? '', ttl: fd.get('ttl'),
  });
  if (!parsed.success) return fail('validation', 'Masa aktif atau inv_key tidak valid.');
  const token = parsed.data.token ? normalizeInvKey(parsed.data.token) : null;
  if (token && !isValidInvKey(token)) return fail('validation', KEY_FORMAT);
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', FORBIDDEN);
  const { data, error } = await ctx.supabase.rpc('create_inventory_key', {
    p_token: token, p_ttl: parsed.data.ttl,
  });
  if (error) {
    console.error('inventory', 'key', error.code);
    const message = error.code === 'EC070'
      ? '12 slot inv_key aktif sedang penuh. Cabut key lama untuk mengosongkan slot.'
      : error.code === '23505' ? 'inv_key itu sudah dipakai. Pilih key lain.'
      : error.code === 'EC072' ? KEY_FORMAT
      : error.code === '22023' ? 'Masa aktif tidak valid.'
      : error.code === '42501' ? FORBIDDEN
      : 'inv_key belum bisa dibuat. Coba lagi.';
    return fail(error.code === '42501' ? 'forbidden'
      : error.code === '23505' ? 'conflict' : 'unknown', message);
  }
  const row = ((data ?? []) as { id: string; token: string; expires_at: string | null }[])[0];
  if (!row) return fail('unknown', 'inv_key belum bisa dibuat. Coba lagi.');
  revalidatePath('/inventory');
  return { ok: true, data: { token: row.token, expiresAt: row.expires_at } };
}

export async function revokeInventoryKey(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  if (!id) return failState('inv_key tidak ditemukan.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('revoke_inventory_key', { p_id: id });
  if (error) { console.error('inventory', 'revoke', error.code); return failState(dbMessage(error), fd); }
  revalidatePath('/inventory');
  redirect(withFlash('/inventory', 'keyRevoked'));
}

export type InventoryItemView = { id: string; url: string; createdAt: string | null };
export type InventoryView = {
  ownerName: string | null;
  expiresAt: string | null;
  items: InventoryItemView[];
};
export type AccessState = ActionResult<InventoryView> | null;

type LookupRow = {
  owner_name: string | null;
  expires_at: string | null;
  item_id: string | null;
  url: string | null;
  item_created_at: string | null;
};

// Dipanggil dari halaman publik tanpa login. Key tidak pernah masuk URL:
// hasilnya hanya hidup di state komponen sampai halaman dimuat ulang.
export async function openInventory(_p: AccessState, fd: FormData): Promise<AccessState> {
  const key = normalizeInvKey(String(fd.get('key') ?? ''));
  if (!isValidInvKey(key)) return fail('validation', KEY_FORMAT);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_inventory_by_key', { p_key: key });
  if (error) {
    console.error('inventory', 'access', error.code);
    return fail('unknown', 'Inventory belum bisa dibuka. Coba lagi.');
  }
  const rows = (data ?? []) as LookupRow[];
  const first = rows[0];
  if (!first) {
    return fail('not_found', 'inv_key tidak ditemukan, sudah dicabut, atau sudah kedaluwarsa.');
  }
  return {
    ok: true,
    data: {
      ownerName: first.owner_name,
      expiresAt: first.expires_at,
      items: rows.flatMap((r) => (r.item_id && r.url
        ? [{ id: r.item_id, url: r.url, createdAt: r.item_created_at }]
        : [])),
    },
  };
}
