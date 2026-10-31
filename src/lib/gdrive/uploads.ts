import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import {
  cancelSession, createResumableSession, deleteFile, DriveError, fileLink, getMeta, headBytes, sessionStatus,
  uniqueName, type SessionState,
} from './drive';
import { detectSignature, extensionOf, mimeForExt, signatureMatches, buildFinalName, categoryForExt, type Category } from './files';
import { resolveDestination } from './folders';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type UploadErrorCode =
  | 'validation' | 'size' | 'archive' | 'folder' | 'limit' | 'session' | 'signature' | 'cleanup' | 'config';

export class UploadError extends Error {
  constructor(public code: UploadErrorCode, message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export type UploadRow = {
  id: string;
  owner_id: string;
  class_id: string;
  drive_folder_id: string;
  drive_file_name: string;
  original_name: string;
  size_bytes: number;
  category: Category;
  mime_type: string;
  session_uri: string | null;
  drive_file_id: string | null;
  status: 'pending' | 'uploading' | 'verifying' | 'completed' | 'failed' | 'cancelled' | 'expired';
  error_code: string | null;
};

export type StartView = {
  uploadId: string;
  sessionUri: string;
  name: string;
  folderName: string;
  size: number;
  mimeType: string;
};

export type CompleteView =
  | { done: true; fileId: string; link: string; name: string }
  | { done: false; bytesUploaded: number; size: number };

export async function classUploadSettings(supabase: Supabase, classId: string) {
  const { data } = await supabase.from('gdrive_settings')
    .select('max_file_mb,archives_enabled').eq('class_id', classId).maybeSingle();
  const row = data as { max_file_mb: number; archives_enabled: boolean } | null;
  return {
    maxMb: row?.max_file_mb ?? 500,
    archivesEnabled: row?.archives_enabled ?? true,
  };
}

function stamp(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}.${get('minute')}.${get('second')}`;
}

function claimError(code: string | undefined): UploadError {
  if (code === 'EC080') return new UploadError('limit', 'Terlalu banyak unggahan berukuran ini berjalan bersamaan. Tunggu salah satunya selesai lalu coba lagi.');
  if (code === 'EC084') return new UploadError('limit', 'Terlalu banyak unggahan dimulai dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.');
  if (code === 'EC085') return new UploadError('limit', 'Kuota unggahan harianmu (20 GB) tercapai. Coba lagi besok.');
  if (code === 'EC081') return new UploadError('size', 'Ukuran file melebihi batas kelas.');
  if (code === 'EC082') return new UploadError('archive', 'Ketua kelas menonaktifkan unggahan file arsip.');
  if (code === '42501') return new UploadError('validation', 'Kamu tidak punya izin mengunggah.');
  return new UploadError('validation', 'Unggahan belum bisa dimulai. Coba lagi.');
}

export async function startUpload(o: {
  supabase: Supabase; userId: string; classId: string; timezone: string; origin: string;
  originalName: string; size: number; customName?: string; folderId?: string | null; preferDefault?: boolean;
}): Promise<StartView> {
  const originalName = o.originalName.trim();
  if (!originalName || originalName.length > 255) throw new UploadError('validation', 'Nama file tidak valid.');
  if (!Number.isInteger(o.size) || o.size <= 0) throw new UploadError('validation', 'File kosong tidak bisa diunggah.');
  if (o.customName && o.customName.length > 160) throw new UploadError('validation', 'Nama file maksimal 160 karakter.');

  const ext = extensionOf(originalName);
  const category = categoryForExt(ext);
  if (!ext || !category) throw new UploadError('validation', 'Jenis file ini tidak diizinkan.');

  const settings = await classUploadSettings(o.supabase, o.classId);
  if (o.size > settings.maxMb * 1024 * 1024) {
    throw new UploadError('size', `Ukuran file melebihi batas ${settings.maxMb} MB.`);
  }
  if (category === 'archives' && !settings.archivesEnabled) {
    throw new UploadError('archive', 'Ketua kelas menonaktifkan unggahan file arsip.');
  }

  const destination = await resolveDestination({
    supabase: o.supabase, userId: o.userId, classId: o.classId, category,
    folderId: o.folderId, preferDefault: o.preferDefault,
  });
  const wanted = buildFinalName({
    originalName, customName: o.customName, timestamp: stamp(new Date(), o.timezone), ext,
  });
  const finalName = await uniqueName(destination.driveFolderId, wanted);

  const { data, error } = await o.supabase.rpc('begin_gdrive_upload', {
    p_folder_id: o.folderId ?? null,
    p_drive_folder_id: destination.driveFolderId,
    p_drive_file_name: finalName,
    p_original_name: originalName,
    p_size: o.size,
    p_mime: mimeForExt(ext),
    p_category: category,
  });
  if (error) throw claimError(error.code);
  const row = ((data ?? []) as { id: string }[])[0];
  if (!row) throw new UploadError('validation', 'Unggahan belum bisa dimulai. Coba lagi.');

  let sessionUri: string;
  try {
    sessionUri = await createResumableSession({
      name: finalName, parentId: destination.driveFolderId, mimeType: mimeForExt(ext),
      uploadId: row.id, origin: o.origin,
    });
  } catch (error) {
    await o.supabase.rpc('fail_gdrive_upload', { p_id: row.id, p_error: 'session_init' });
    throw error;
  }

  const { error: sessionError } = await o.supabase.rpc('set_gdrive_session', { p_id: row.id, p_session_uri: sessionUri });
  if (sessionError) {
    await cancelSession(sessionUri);
    await o.supabase.rpc('fail_gdrive_upload', { p_id: row.id, p_error: 'session_store' });
    throw new UploadError('session', 'Sesi unggah tidak dapat disimpan. Coba lagi.');
  }

  return {
    uploadId: row.id, sessionUri, name: finalName, folderName: destination.label,
    size: o.size, mimeType: mimeForExt(ext),
  };
}

async function loadOwned(supabase: Supabase, userId: string, classId: string, id: string): Promise<UploadRow> {
  const { data } = await supabase.from('gdrive_uploads').select('*')
    .eq('id', id).eq('owner_id', userId).eq('class_id', classId).maybeSingle();
  if (!data) throw new UploadError('validation', 'Unggahan tidak ditemukan.');
  return data as UploadRow;
}

const ENDED_MESSAGE = 'Unggahan ini sudah berakhir. Mulai ulang dari daftar file.';

// Verifikasi akhir: ukuran, folder, dan signature dibaca langsung dari Drive, bukan
// dari laporan peramban. Baris yang sudah ditandai berakhir (cancelled/failed/expired)
// tetap diperiksa: bila Drive ternyata menyelesaikan filenya, baris direkonsiliasi
// menjadi completed, bukan dibiarkan bertentangan dengan isi Drive.
export async function finishUpload(o: { supabase: Supabase; userId: string; classId: string; id: string }): Promise<CompleteView> {
  const row = await loadOwned(o.supabase, o.userId, o.classId, o.id);
  if (row.status === 'completed' && row.drive_file_id) {
    return { done: true, fileId: row.drive_file_id, link: fileLink(row.drive_file_id), name: row.drive_file_name };
  }
  const ended = row.status === 'cancelled' || row.status === 'failed' || row.status === 'expired';
  if (!row.session_uri) {
    throw new UploadError('session', ended ? ENDED_MESSAGE : 'Sesi unggah tidak ditemukan.');
  }

  const state = await sessionStatus(row.session_uri, Number(row.size_bytes));
  if ('expired' in state) {
    if (!ended) await o.supabase.rpc('fail_gdrive_upload', { p_id: row.id, p_error: 'session_expired' });
    throw new UploadError('session', ended
      ? 'Unggahan ini sudah berakhir dan sesinya sudah tidak ada di Google Drive.'
      : 'Sesi unggah kedaluwarsa. Mulai ulang unggahan.');
  }
  if (!state.done) {
    // Drive belum punya seluruh file: simpan progres nyata dan pertahankan sesi.
    if (ended) throw new UploadError('session', ENDED_MESSAGE);
    await o.supabase.rpc('update_gdrive_progress', { p_id: row.id, p_bytes: state.bytesUploaded });
    return { done: false, bytesUploaded: state.bytesUploaded, size: Number(row.size_bytes) };
  }

  const meta = await getMeta(state.fileId);
  const expected = Number(row.size_bytes);
  if (Number(meta.size ?? 0) !== expected || !(meta.parents ?? []).includes(row.drive_folder_id) || meta.trashed === true) {
    await deleteFile(meta.id).catch(() => console.error('gdrive: file tidak lolos verifikasi dan gagal dihapus', meta.id));
    if (!ended) await o.supabase.rpc('fail_gdrive_upload', { p_id: row.id, p_error: 'metadata_mismatch' });
    throw new UploadError('validation', 'File yang diterima Google Drive tidak sesuai dengan data unggahan, jadi dihapus.');
  }

  const ext = extensionOf(row.drive_file_name) ?? '';
  const head = await headBytes(meta.id, 4096);
  const kind = detectSignature(head);
  if (!kind || !signatureMatches(ext, kind)) {
    await deleteFile(meta.id).catch(() => console.error('gdrive: file signature salah dan gagal dihapus', meta.id));
    if (!ended) await o.supabase.rpc('fail_gdrive_upload', { p_id: row.id, p_error: 'signature' });
    throw new UploadError('signature', 'Isi file tidak sesuai dengan ekstensinya, jadi file dihapus dari Google Drive.');
  }

  const { error } = ended
    ? await o.supabase.rpc('reconcile_gdrive_upload', { p_id: row.id, p_drive_file_id: meta.id, p_bytes: expected })
    : await o.supabase.rpc('complete_gdrive_upload', { p_id: row.id, p_drive_file_id: meta.id, p_bytes: expected });
  if (error) throw new UploadError('validation', 'Hasil unggahan tidak dapat dicatat. Coba lagi.');
  return { done: true, fileId: meta.id, link: fileLink(meta.id), name: meta.name };
}

export type ResumeView =
  | { done: true; fileId: string; link: string; name: string }
  | { done: false; sessionUri: string; bytesUploaded: number; size: number; name: string };

export async function resumeUpload(o: { supabase: Supabase; userId: string; classId: string; id: string }): Promise<ResumeView> {
  const row = await loadOwned(o.supabase, o.userId, o.classId, o.id);
  if (row.status === 'completed' && row.drive_file_id) {
    return { done: true, fileId: row.drive_file_id, link: fileLink(row.drive_file_id), name: row.drive_file_name };
  }
  if (row.status !== 'pending' && row.status !== 'uploading' && row.status !== 'verifying') {
    throw new UploadError('session', 'Unggahan ini tidak bisa dilanjutkan.');
  }
  if (!row.session_uri) throw new UploadError('session', 'Sesi unggah tidak ditemukan.');
  const state = await sessionStatus(row.session_uri, Number(row.size_bytes));
  if ('expired' in state) {
    await o.supabase.rpc('fail_gdrive_upload', { p_id: row.id, p_error: 'session_expired' });
    throw new UploadError('session', 'Sesi unggah kedaluwarsa. Pilih file itu lagi untuk mulai dari awal.');
  }
  if (state.done) {
    const finished = await finishUpload(o);
    if (!finished.done) throw new UploadError('session', 'Google Drive belum menyelesaikan file. Coba lagi.');
    return finished;
  }
  await o.supabase.rpc('update_gdrive_progress', { p_id: row.id, p_bytes: state.bytesUploaded });
  return {
    done: false, sessionUri: row.session_uri, bytesUploaded: state.bytesUploaded,
    size: Number(row.size_bytes), name: row.drive_file_name,
  };
}

export type CancelView =
  | { cancelled: true }
  | { cancelled: false; fileId: string; link: string; name: string };

// Pembatalan hanya terjadi atas permintaan eksplisit pengguna dan hanya setelah server
// memastikan Drive belum menyelesaikan file. Kegagalan memeriksa atau menghapus sesi
// dilaporkan sebagai galat, bukan sebagai pembatalan yang berhasil.
export async function cancelUpload(o: { supabase: Supabase; userId: string; classId: string; id: string }): Promise<CancelView> {
  const row = await loadOwned(o.supabase, o.userId, o.classId, o.id);
  if (row.status === 'completed' && row.drive_file_id) {
    return { cancelled: false, fileId: row.drive_file_id, link: fileLink(row.drive_file_id), name: row.drive_file_name };
  }
  if (row.status === 'cancelled') return { cancelled: true };
  if (row.status !== 'pending' && row.status !== 'uploading' && row.status !== 'verifying') {
    throw new UploadError('session', 'Unggahan ini sudah berakhir dan tidak bisa dibatalkan.');
  }

  if (row.session_uri) {
    let state: SessionState;
    try {
      state = await sessionStatus(row.session_uri, Number(row.size_bytes));
    } catch {
      throw new UploadError('session', 'Status unggahan di Google Drive belum dapat diperiksa, jadi belum dibatalkan. Coba lagi.');
    }
    if ('done' in state) {
      // File sudah dibuat Drive: finalisasi, jangan tandai batal.
      const finished = await finishUpload(o);
      if (!finished.done) throw new UploadError('session', 'Google Drive belum menyelesaikan file ini. Coba batalkan lagi sebentar lagi.');
      return { cancelled: false, fileId: finished.fileId, link: finished.link, name: finished.name };
    }
    const removed = 'expired' in state ? true : await cancelSession(row.session_uri);
    if (!removed) {
      throw new UploadError('session', 'Sesi unggahan tidak dapat dihentikan di Google Drive, jadi unggahan belum dibatalkan. Coba lagi.');
    }
  }

  const { error } = await o.supabase.rpc('cancel_gdrive_upload', { p_id: row.id });
  if (error) throw new UploadError('validation', 'Unggahan tidak dapat dibatalkan.');
  return { cancelled: true };
}

export function isDriveError(error: unknown): error is DriveError {
  return error instanceof DriveError;
}
