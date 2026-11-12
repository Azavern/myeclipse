'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, failState, formValues, invalid, type FormState } from '@/lib/form-state';
import {
  KAS_CATEGORIES, MAX_AMOUNT_MESSAGE, parseAmount,
} from '@/lib/kas/format';
import { removeObject, uploadImage } from '@/lib/storage/upload';
import { optText, reqText } from '@/lib/zod-fields';

const amountField = z.string().trim().refine((value) => parseAmount(value) !== null, MAX_AMOUNT_MESSAGE);
const dateField = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid.');
const uuid = z.string().uuid();
const reason = reqText(200, 'Alasan');

const billSchema = z.object({
  title: reqText(120, 'Nama tagihan'),
  amount: amountField,
  due_on: dateField,
  recipient_mode: z.enum(['all', 'selected']).default('all'),
});
const transactionSchema = z.object({
  direction: z.enum(['income', 'expense']),
  amount: amountField,
  category: z.enum(KAS_CATEGORIES),
  description: reqText(200, 'Keterangan'),
  occurred_on: dateField,
});
const paymentSchema = z.object({
  bill_member_id: uuid,
  amount: amountField,
  method: z.enum(['cash', 'transfer', 'qris']),
  note: optText(200),
});
const depositSchema = z.object({ amount: amountField, note: optText(200) });

const refresh = () => {
  revalidatePath('/kas');
  revalidatePath('/');
};

// Detail teknis tetap di log server; UI hanya menerima pesan yang bisa ditindaklanjuti.
function kasMessage(code: string | undefined): string {
  switch (code) {
    case 'EC100': return 'Maksimal 24 tagihan terbuka bersamaan. Selesaikan atau batalkan tagihan lain lebih dulu.';
    case 'EC101': return 'Pilih minimal satu anggota aktif yang valid.';
    case 'EC103': return 'Pengajuan untuk iuran ini masih menunggu verifikasi.';
    case 'EC104': return 'Pengajuan ini sudah diproses pemegang izin lain. Muat ulang halaman.';
    case 'EC105': return 'Iuran ini sudah tercatat lunas.';
    case 'EC106': return 'Tagihan ini sudah ditutup atau dibatalkan.';
    case 'EC107': return 'Catatan ini sudah dibatalkan.';
    case 'EC108': return 'Bendahara belum mengunggah gambar QRIS.';
    case '22023': return 'Isian kas tidak memenuhi aturan.';
    case '23505': return 'Pengajuan atau pemasukan ini sudah tercatat.';
    case 'P0002': return 'Data kas tidak ditemukan.';
    case '40P01':
    case '40001': return 'Data kas sedang diproses pemegang izin lain. Muat ulang lalu coba lagi.';
    case '42501': return FORBIDDEN;
    default: return 'Tindakan kas belum bisa disimpan. Coba lagi.';
  }
}

async function managerContext() {
  const ctx = await requireActionContext();
  return ctx?.can('kas.manage') ? ctx : null;
}

async function uploadOptional(
  ctx: NonNullable<Awaited<ReturnType<typeof managerContext>>>,
  fd: FormData, field: string, folder: 'proofs' | 'receipts',
) {
  const file = fd.get(field);
  if (!(file instanceof File) || file.size === 0) return { path: null as string | null };
  return uploadImage({
    supabase: ctx.supabase, bucket: 'kas-media',
    dir: `${ctx.classId}/${folder}/${ctx.user.id}`, file,
  });
}

export async function createKasBill(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = billSchema.safeParse({
    title: fd.get('title'), amount: fd.get('amount'), due_on: fd.get('due_on'),
    recipient_mode: fd.get('recipient_mode') ?? 'all',
  });
  if (!parsed.success) return invalid(parsed.error, fd);
  const amount = parseAmount(parsed.data.amount);
  if (amount === null) return failState(MAX_AMOUNT_MESSAGE, fd);

  let userIds: string[] | null = null;
  if (parsed.data.recipient_mode === 'selected') {
    const ids = [...new Set(fd.getAll('user_ids').filter((v): v is string => typeof v === 'string' && v.length > 0))];
    if (ids.length === 0) {
      return { error: 'Pilih minimal satu anggota.', fieldErrors: { user_ids: ['Pilih minimal satu anggota.'] }, values: formValues(fd) };
    }
    const parsedIds = z.array(uuid).safeParse(ids);
    if (!parsedIds.success) {
      return { error: 'Pilihan anggota tidak valid.', fieldErrors: { user_ids: ['Pilihan anggota tidak valid.'] }, values: formValues(fd) };
    }
    userIds = parsedIds.data;
  }

  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('create_kas_bill', {
    p_title: parsed.data.title, p_amount: amount, p_due_on: parsed.data.due_on,
    p_user_ids: userIds,
  });
  if (error) {
    console.error('createKasBill', error.code);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', 'kasBillCreated'));
}

export async function addKasBillMembers(_p: FormState, fd: FormData): Promise<FormState> {
  const ids = [...new Set(fd.getAll('user_ids').filter((v): v is string => typeof v === 'string' && v.length > 0))];
  const parsed = z.object({ bill_id: uuid, user_ids: z.array(uuid).min(1) }).safeParse({
    bill_id: fd.get('bill_id'), user_ids: ids,
  });
  if (!parsed.success) {
    return { error: 'Pilih minimal satu anggota.', fieldErrors: { user_ids: ['Pilih minimal satu anggota.'] }, values: formValues(fd) };
  }
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('add_kas_bill_members', {
    p_bill_id: parsed.data.bill_id, p_user_ids: parsed.data.user_ids,
  });
  if (error) {
    console.error('addKasBillMembers', error.code);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', 'kasBillUpdated'));
}

export async function cancelKasBill(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ bill_id: uuid, reason }).safeParse({
    bill_id: fd.get('bill_id'), reason: fd.get('reason'),
  });
  if (!parsed.success) return invalid(parsed.error, fd);
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('cancel_kas_bill', {
    p_bill_id: parsed.data.bill_id, p_reason: parsed.data.reason,
  });
  if (error) {
    console.error('cancelKasBill', error.code);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', 'kasBillCancelled'));
}

export async function submitKasBillPayment(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = paymentSchema.safeParse({
    bill_member_id: fd.get('bill_member_id'), amount: fd.get('amount'),
    method: fd.get('method'), note: fd.get('note'),
  });
  if (!parsed.success) return invalid(parsed.error, fd);
  const amount = parseAmount(parsed.data.amount);
  if (amount === null) return failState(MAX_AMOUNT_MESSAGE, fd);

  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const up = await uploadOptional(ctx, fd, 'proof', 'proofs');
  if ('ok' in up && !up.ok) return failState(up.message, fd);

  const { error } = await ctx.supabase.rpc('submit_kas_bill_payment', {
    p_bill_member_id: parsed.data.bill_member_id,
    p_amount: amount,
    p_method: parsed.data.method,
    p_note: parsed.data.note,
    p_proof_path: up.path,
  });
  if (error) {
    console.error('submitKasBillPayment', error.code);
    await removeObject(ctx.supabase, 'kas-media', up.path);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', 'kasSubmitted'));
}

export async function submitKasDeposit(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = depositSchema.safeParse({ amount: fd.get('amount'), note: fd.get('note') });
  if (!parsed.success) return invalid(parsed.error, fd);
  const amount = parseAmount(parsed.data.amount);
  if (amount === null) return failState(MAX_AMOUNT_MESSAGE, fd);

  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const up = await uploadOptional(ctx, fd, 'proof', 'proofs');
  if ('ok' in up && !up.ok) return failState(up.message, fd);

  const { error } = await ctx.supabase.rpc('submit_kas_deposit', {
    p_amount: amount, p_note: parsed.data.note, p_proof_path: up.path,
  });
  if (error) {
    console.error('submitKasDeposit', error.code);
    await removeObject(ctx.supabase, 'kas-media', up.path);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', 'kasSubmitted'));
}

export async function reviewKasSubmission(_p: FormState, fd: FormData): Promise<FormState> {
  const approve = fd.get('decision') === 'approve';
  const parsed = z.object({
    id: uuid,
    reason: z.string().trim().max(200, 'Maksimal 200 karakter.').optional(),
  }).safeParse({ id: fd.get('id'), reason: fd.get('reason') ?? '' });
  if (!parsed.success) return invalid(parsed.error, fd);
  if (!approve && !parsed.data.reason) {
    return { error: 'Alasan penolakan wajib diisi.', fieldErrors: { reason: ['Alasan penolakan wajib diisi.'] }, values: formValues(fd) };
  }
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('review_kas_submission', {
    p_id: parsed.data.id, p_approve: approve, p_reason: parsed.data.reason || null,
  });
  if (error) {
    console.error('reviewKasSubmission', error.code);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', approve ? 'kasApproved' : 'kasRejected'));
}

export async function markKasPaid(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ id: uuid }).safeParse({ id: fd.get('id') });
  if (!parsed.success) return failState('Iuran tidak ditemukan.', fd);
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('mark_kas_bill_member_paid', {
    p_bill_member_id: parsed.data.id, p_method: 'cash',
  });
  if (error) {
    console.error('markKasPaid', error.code);
    return failState(kasMessage(error.code), fd);
  }
  refresh();
  redirect(withFlash('/kas', 'kasPaid'));
}

export async function createKasTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = transactionSchema.safeParse({
    direction: fd.get('direction'), amount: fd.get('amount'), category: fd.get('category'),
    description: fd.get('description'), occurred_on: fd.get('occurred_on'),
  });
  if (!parsed.success) return invalid(parsed.error, fd);
  const amount = parseAmount(parsed.data.amount);
  if (amount === null) return failState(MAX_AMOUNT_MESSAGE, fd);

  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const file = fd.get('receipt');
  let receiptPath: string | null = null;
  if (file instanceof File && file.size > 0) {
    const up = await uploadImage({
      supabase: ctx.supabase, bucket: 'kas-media',
      dir: `${ctx.classId}/receipts/${ctx.user.id}`, file,
    });
    if (!up.ok) return failState(up.message, fd);
    receiptPath = up.path;
  }

  const { error } = await ctx.supabase.rpc('create_kas_transaction', {
    p_direction: parsed.data.direction,
    p_amount: amount,
    p_category: parsed.data.category,
    p_description: parsed.data.description,
    p_occurred_on: parsed.data.occurred_on,
    p_receipt_path: receiptPath,
  });
  if (error) {
    console.error('createKasTransaction', error.code);
    await removeObject(ctx.supabase, 'kas-media', receiptPath);
    return failState(kasMessage(error.code), fd);
  }
  const summary = await ctx.supabase.rpc('get_kas_summary');
  const balance = Number(((summary.data ?? []) as { balance: number | string }[])[0]?.balance ?? 0);
  refresh();
  redirect(withFlash(balance < 0 ? '/kas?saldo=negatif' : '/kas', 'kasRecorded'));
}

export async function cancelKasTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ id: uuid, reason }).safeParse({ id: fd.get('id'), reason: fd.get('reason') });
  if (!parsed.success) return invalid(parsed.error, fd);
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('cancel_kas_transaction', {
    p_id: parsed.data.id, p_reason: parsed.data.reason,
  });
  if (error) {
    console.error('cancelKasTransaction', error.code);
    return failState(kasMessage(error.code), fd);
  }
  const summary = await ctx.supabase.rpc('get_kas_summary');
  const balance = Number(((summary.data ?? []) as { balance: number | string }[])[0]?.balance ?? 0);
  refresh();
  redirect(withFlash(balance < 0 ? '/kas?saldo=negatif' : '/kas', 'kasCancelled'));
}

export async function saveKasQris(_p: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get('qris');
  if (!(file instanceof File) || file.size === 0) return failState('Pilih gambar QRIS terlebih dahulu.', fd);
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);

  const old = await ctx.supabase.from('kas_settings').select('qris_path').eq('class_id', ctx.classId).maybeSingle();
  const oldPath = (old.data as { qris_path: string | null } | null)?.qris_path ?? null;
  const up = await uploadImage({
    supabase: ctx.supabase, bucket: 'kas-media', dir: `${ctx.classId}/qris`, file,
  });
  if (!up.ok) return failState(up.message, fd);

  const { error } = await ctx.supabase.rpc('set_kas_qris', { p_path: up.path });
  if (error) {
    console.error('saveKasQris', error.code);
    await removeObject(ctx.supabase, 'kas-media', up.path);
    return failState(kasMessage(error.code), fd);
  }
  if (oldPath && oldPath !== up.path) await removeObject(ctx.supabase, 'kas-media', oldPath);
  refresh();
  redirect(withFlash('/kas', 'kasQris'));
}

export async function removeKasQris(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await managerContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const old = await ctx.supabase.from('kas_settings').select('qris_path').eq('class_id', ctx.classId).maybeSingle();
  const oldPath = (old.data as { qris_path: string | null } | null)?.qris_path ?? null;
  const { error } = await ctx.supabase.rpc('set_kas_qris', { p_path: null });
  if (error) {
    console.error('removeKasQris', error.code);
    return failState(kasMessage(error.code), fd);
  }
  if (oldPath) await removeObject(ctx.supabase, 'kas-media', oldPath);
  refresh();
  redirect(withFlash('/kas', 'kasQrisRemoved'));
}
