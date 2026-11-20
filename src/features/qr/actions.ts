'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, failState, type FormState } from '@/lib/form-state';
import { removeObject, uploadImage } from '@/lib/storage/upload';

const BUCKET = 'qr-studio-media';

function message(code: string | undefined): string {
  switch (code) {
    case '42501': return FORBIDDEN;
    case '22023': return 'Path QRIS tidak valid.';
    case 'P0002': return 'Konfigurasi QR Studio tidak ditemukan.';
    default: return 'QRIS belum bisa disimpan. Coba lagi.';
  }
}

async function managerContext() {
  const ctx = await requireActionContext();
  if (!ctx) return null;
  const { data } = await ctx.supabase.rpc('get_qr_studio_access');
  const row = ((data ?? []) as { can_manage: boolean }[])[0];
  return row?.can_manage ? ctx : null;
}

export async function saveQrStudioQris(_p: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get('qris');
  if (!(file instanceof File) || file.size === 0) return failState('Pilih gambar QRIS terlebih dahulu.', fd);
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);

  const old = await ctx.supabase.from('qr_studio_settings')
    .select('qris_path').eq('class_id', ctx.classId).maybeSingle();
  const oldPath = (old.data as { qris_path: string | null } | null)?.qris_path ?? null;
  const up = await uploadImage({
    supabase: ctx.supabase,
    bucket: BUCKET,
    dir: `${ctx.classId}/qris`,
    file,
  });
  if (!up.ok) return failState(up.message, fd);

  const { error } = await ctx.supabase.rpc('set_qr_studio_qris', { p_path: up.path });
  if (error) {
    console.error('saveQrStudioQris', error.code);
    await removeObject(ctx.supabase, BUCKET, up.path);
    return failState(message(error.code), fd);
  }
  if (oldPath && oldPath !== up.path) await removeObject(ctx.supabase, BUCKET, oldPath);
  revalidatePath('/qr');
  redirect(withFlash('/qr', 'qrStudioQris'));
}

export async function removeQrStudioQris(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const old = await ctx.supabase.from('qr_studio_settings')
    .select('qris_path').eq('class_id', ctx.classId).maybeSingle();
  const oldPath = (old.data as { qris_path: string | null } | null)?.qris_path ?? null;
  const { error } = await ctx.supabase.rpc('set_qr_studio_qris', { p_path: null });
  if (error) {
    console.error('removeQrStudioQris', error.code);
    return failState(message(error.code), fd);
  }
  if (oldPath) await removeObject(ctx.supabase, BUCKET, oldPath);
  revalidatePath('/qr');
  redirect(withFlash('/qr', 'qrStudioQrisRemoved'));
}
