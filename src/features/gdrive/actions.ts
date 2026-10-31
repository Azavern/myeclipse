'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, failState, invalid, type FormState } from '@/lib/form-state';
import { DriveError, gdriveStatus } from '@/lib/gdrive/drive';
import { GDRIVE_MAX_FILE_MB, GDRIVE_MAX_FOLDERS } from '@/lib/gdrive/files';
import { createCustomFolder, validateExternalFolder } from '@/lib/gdrive/folders';
import {
  cancelUpload as cancelUploadService, finishUpload, resumeUpload as resumeUploadService, startUpload,
  UploadError, type CompleteView, type ResumeView, type StartView,
} from '@/lib/gdrive/uploads';

export type CloudErrorCode =
  | 'validation' | 'forbidden' | 'config' | 'auth' | 'quota' | 'rate' | 'folder'
  | 'limit' | 'size' | 'archive' | 'signature' | 'session' | 'cleanup' | 'network' | 'unknown';

export type CloudResult<T> = { ok: true; data: T } | { ok: false; code: CloudErrorCode; message: string };

const fail = (code: CloudErrorCode, message: string): CloudResult<never> => ({ ok: false, code, message });

function mapError(error: unknown): CloudResult<never> {
  if (error instanceof UploadError) return fail(error.code, error.message);
  if (error instanceof DriveError) {
    switch (error.kind) {
      case 'config': return fail('config', 'Google Drive belum dikonfigurasi di server.');
      case 'auth': return fail('auth', 'Kredensial Google Drive di server bermasalah. Hubungi Ketua.');
      case 'quota': return fail('quota', 'Kuota Google Drive akun server penuh.');
      case 'rate': return fail('rate', 'Google Drive sedang membatasi permintaan. Coba lagi beberapa saat lagi.');
      case 'folder': return fail('folder', error.message);
      case 'cleanup': return fail('cleanup', error.message);
      case 'not_found': return fail('folder', 'Folder atau file Google Drive tidak ditemukan.');
      case 'forbidden': return fail('folder', 'Google Drive menolak akses ke folder tujuan.');
      case 'network': return fail('network', 'Koneksi ke Google Drive terputus. Periksa jaringan lalu coba lagi.');
      default: return fail('unknown', 'Google Drive sedang bermasalah. Coba lagi nanti.');
    }
  }
  console.error('gdrive', error instanceof Error ? error.name : 'unknown');
  return fail('unknown', 'Unggahan belum berhasil. Coba lagi.');
}

const startSchema = z.object({
  originalName: z.string().trim().min(1, 'Nama file tidak valid.').max(255, 'Nama file terlalu panjang.'),
  size: z.number().int().positive().max(GDRIVE_MAX_FILE_MB * 1024 * 1024),
  customName: z.string().trim().max(160).optional(),
  folderId: z.string().uuid().nullish(),
  preferDefault: z.boolean().optional(),
});

export async function beginUpload(input: unknown): Promise<CloudResult<StartView>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return fail('validation', 'Data file tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Kamu harus anggota aktif untuk mengunggah.');
  if (!gdriveStatus().ready) return fail('config', 'Google Drive belum dikonfigurasi di server.');
  try {
    const data = await startUpload({
      supabase: ctx.supabase, userId: ctx.user.id, classId: ctx.classId, timezone: ctx.timezone,
      originalName: parsed.data.originalName, size: parsed.data.size,
      customName: parsed.data.customName || undefined,
      folderId: parsed.data.folderId ?? null, preferDefault: parsed.data.preferDefault,
    });
    revalidatePath('/cloud');
    return { ok: true, data };
  } catch (error) {
    return mapError(error);
  }
}

const idSchema = z.string().uuid();

export async function completeUpload(id: string): Promise<CloudResult<CompleteView>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail('validation', 'Unggahan tidak ditemukan.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Sesi berakhir. Masuk kembali lalu coba lagi.');
  try {
    const data = await finishUpload({ supabase: ctx.supabase, userId: ctx.user.id, classId: ctx.classId, id: parsed.data });
    revalidatePath('/cloud');
    return { ok: true, data };
  } catch (error) {
    return mapError(error);
  }
}

export async function resumeUpload(id: string): Promise<CloudResult<ResumeView>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail('validation', 'Unggahan tidak ditemukan.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Sesi berakhir. Masuk kembali lalu coba lagi.');
  try {
    const data = await resumeUploadService({ supabase: ctx.supabase, userId: ctx.user.id, classId: ctx.classId, id: parsed.data });
    return { ok: true, data };
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelUpload(id: string): Promise<CloudResult<null>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail('validation', 'Unggahan tidak ditemukan.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Sesi berakhir. Masuk kembali lalu coba lagi.');
  try {
    await cancelUploadService({ supabase: ctx.supabase, userId: ctx.user.id, classId: ctx.classId, id: parsed.data });
    revalidatePath('/cloud');
    return { ok: true, data: null };
  } catch (error) {
    return mapError(error);
  }
}

function registerError(code: string | undefined): CloudResult<never> {
  if (code === '23505') return fail('validation', 'Folder itu sudah ada di daftarmu.');
  if (code === 'EC083') return fail('limit', `Maksimal ${GDRIVE_MAX_FOLDERS} folder per anggota.`);
  if (code === '42501') return fail('forbidden', 'Kamu tidak punya izin untuk tindakan ini.');
  return fail('unknown', 'Folder belum bisa disimpan. Coba lagi.');
}

export async function createCloudFolder(name: string): Promise<CloudResult<{ name: string }>> {
  const parsed = z.string().trim().min(1, 'Nama folder wajib diisi.').max(80, 'Nama folder maksimal 80 karakter.').safeParse(name);
  if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Nama folder tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Kamu harus anggota aktif untuk membuat folder.');
  if (!gdriveStatus().ready) return fail('config', 'Google Drive belum dikonfigurasi di server.');
  try {
    const folder = await createCustomFolder(parsed.data);
    const { error } = await ctx.supabase.rpc('register_gdrive_folder', {
      p_drive_folder_id: folder.driveFolderId, p_name: folder.name, p_kind: 'custom', p_parent_drive_id: folder.parentDriveId,
    });
    if (error) return registerError(error.code);
    revalidatePath('/cloud');
    return { ok: true, data: { name: folder.name } };
  } catch (error) {
    return mapError(error);
  }
}

export async function addExternalFolder(ref: string): Promise<CloudResult<{ name: string }>> {
  const parsed = z.string().trim().min(1, 'Folder ID atau link wajib diisi.').max(2048).safeParse(ref);
  if (!parsed.success) return fail('validation', 'Folder ID atau link tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Kamu harus anggota aktif untuk menambah folder.');
  if (!gdriveStatus().ready) return fail('config', 'Google Drive belum dikonfigurasi di server.');
  try {
    const folder = await validateExternalFolder(parsed.data);
    const { error } = await ctx.supabase.rpc('register_gdrive_folder', {
      p_drive_folder_id: folder.driveFolderId, p_name: folder.name, p_kind: 'external', p_parent_drive_id: null,
    });
    if (error) return registerError(error.code);
    revalidatePath('/cloud');
    return { ok: true, data: { name: folder.name } };
  } catch (error) {
    return mapError(error);
  }
}

export async function setDefaultCloudFolder(id: string | null): Promise<CloudResult<null>> {
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Kamu harus anggota aktif untuk mengubah default.');
  if (id === null) {
    const { error } = await ctx.supabase.rpc('clear_gdrive_default');
    if (error) return fail('unknown', 'Default folder belum bisa dihapus. Coba lagi.');
    revalidatePath('/cloud');
    return { ok: true, data: null };
  }
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail('validation', 'Folder tidak ditemukan.');
  const { error } = await ctx.supabase.rpc('set_gdrive_default', { p_folder_id: parsed.data });
  if (error) {
    if (error.code === 'P0002') return fail('folder', 'Folder tidak ditemukan atau bukan milikmu.');
    if (error.code === '42501') return fail('forbidden', FORBIDDEN);
    return fail('unknown', 'Default folder belum bisa disimpan. Coba lagi.');
  }
  revalidatePath('/cloud');
  return { ok: true, data: null };
}

export async function removeCloudFolder(id: string): Promise<CloudResult<null>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail('validation', 'Folder tidak ditemukan.');
  const ctx = await requireActionContext();
  if (!ctx) return fail('forbidden', 'Kamu harus anggota aktif untuk menghapus folder.');
  const { error } = await ctx.supabase.rpc('remove_gdrive_folder', { p_id: parsed.data });
  if (error) {
    if (error.code === 'P0002') return fail('folder', 'Folder tidak ditemukan atau bukan milikmu.');
    if (error.code === '42501') return fail('forbidden', FORBIDDEN);
    return fail('unknown', 'Folder belum bisa dihapus dari daftar. Coba lagi.');
  }
  revalidatePath('/cloud');
  return { ok: true, data: null };
}

const settingsSchema = z.object({
  max_file_mb: z.coerce.number({ invalid_type_error: 'Batas ukuran harus berupa angka.' })
    .int('Batas ukuran harus bilangan bulat.').min(1, 'Minimal 1 MB.').max(GDRIVE_MAX_FILE_MB, `Maksimal ${GDRIVE_MAX_FILE_MB} MB.`),
  archives_enabled: z.enum(['1', '0']),
});

export async function updateGdriveSettings(_p: FormState, fd: FormData): Promise<FormState> {
  const parsed = settingsSchema.safeParse({ max_file_mb: fd.get('max_file_mb'), archives_enabled: fd.get('archives_enabled') });
  if (!parsed.success) return invalid(parsed.error, fd);
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('save_gdrive_settings', {
    p_max_mb: parsed.data.max_file_mb, p_archives: parsed.data.archives_enabled === '1',
  });
  if (error) {
    console.error('gdrive', 'settings', error.code);
    return failState(error.code === '42501' ? FORBIDDEN : 'Pengaturan belum bisa disimpan. Coba lagi.', fd);
  }
  revalidatePath('/cloud');
  revalidatePath('/settings/cloud');
  redirect(withFlash('/settings/cloud', 'saved'));
}
