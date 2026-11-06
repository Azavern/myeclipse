import { NextResponse } from 'next/server';
import { requireActionContext } from '@/lib/action-context';
import { env } from '@/lib/env';
import { deleteFile, DriveError, uniqueName, uploadBytes } from '@/lib/gdrive/drive';
import { ensureLibraryFolder } from '@/lib/gdrive/library-folders';
import { resolveUploadOrigin } from '@/lib/gdrive/origin';
import {
  LIBRARY_MAX_ORIGINAL_BYTES, LIBRARY_MAX_PREVIEW_BYTES, LIBRARY_MAX_TITLE,
  libraryDriveName, libraryTitle,
} from '@/lib/library/shared';
import { createRateLimiter } from '@/lib/rate-limit';
import { detectImage } from '@/lib/storage/magic-bytes';

const allowUpload = createRateLimiter(30, 10 * 60 * 1000);
const MAX_BODY_BYTES = 15 * 1024 * 1024;

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

// Unggah satu gambar ke dua jalur sekaligus:
//   1. versi ringan (hasil kompresi peramban) -> bucket `member-media`,
//   2. versi asli tanpa perubahan -> folder Drive pribadi anggota.
// Versi asli opsional: bila Drive belum siap, gambar tetap masuk Library dan
// unduhan HD ditandai tidak tersedia.
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const allowedOrigin = origin
    ? resolveUploadOrigin({
        requestOrigin: origin,
        requestHost: request.headers.get('host'),
        appUrl: env.APP_URL,
        extraOrigins: process.env.GDRIVE_UPLOAD_ORIGINS,
      })
    : null;
  if (!origin || !allowedOrigin) return fail(403, 'forbidden', 'Permintaan harus berasal dari aplikasi ini.');

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return fail(413, 'too_large', 'Ukuran unggahan terlalu besar.');

  const ctx = await requireActionContext();
  if (!ctx) return fail(401, 'unauthenticated', 'Masuk sebagai anggota aktif untuk mengunggah.');
  if (!allowUpload(ctx.user.id)) {
    return fail(429, 'rate_limited', 'Terlalu banyak unggahan. Tunggu beberapa menit lalu coba lagi.');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'validation', 'Data unggahan tidak dapat dibaca.');
  }

  const original = form.get('original');
  const preview = form.get('preview');
  if (!(original instanceof File) || !(preview instanceof File)) {
    return fail(400, 'validation', 'Gambar asli dan versi ringan wajib disertakan.');
  }
  if (original.size === 0 || original.size > LIBRARY_MAX_ORIGINAL_BYTES) {
    return fail(400, 'validation', 'Gambar asli maksimal 10 MB.');
  }
  if (preview.size === 0 || preview.size > LIBRARY_MAX_PREVIEW_BYTES) {
    return fail(400, 'validation', 'Versi ringan gambar maksimal 2 MB.');
  }

  const originalBytes = new Uint8Array(await original.arrayBuffer());
  const previewBytes = new Uint8Array(await preview.arrayBuffer());
  const originalType = detectImage(originalBytes);
  const previewType = detectImage(previewBytes);
  if (!originalType) return fail(400, 'validation', 'Gambar asli harus JPEG, PNG, atau WebP.');
  if (!previewType) return fail(400, 'validation', 'Versi ringan gambar tidak dikenali.');

  const rawTitle = form.get('title');
  const originalName = original.name.trim() || 'gambar';
  const title = (typeof rawTitle === 'string' ? rawTitle.trim() : '').slice(0, LIBRARY_MAX_TITLE)
    || libraryTitle(originalName);

  const storagePath = `${ctx.classId}/${ctx.user.id}/library/${crypto.randomUUID()}.${previewType.ext}`;
  const stored = await ctx.supabase.storage.from('member-media').upload(storagePath, previewBytes, {
    upsert: false, contentType: previewType.mime,
  });
  if (stored.error) {
    console.error('library upload: versi ringan gagal disimpan', stored.error.statusCode);
    return fail(500, 'storage', 'Gambar belum bisa disimpan. Coba lagi.');
  }

  let drive: { fileId: string; folderId: string; fileName: string } | null = null;
  let warning: string | null = null;
  try {
    const folder = await ensureLibraryFolder({
      supabase: ctx.supabase, classId: ctx.classId, userId: ctx.user.id,
    });
    const wanted = libraryDriveName(originalName, originalType.ext);
    const fileName = await uniqueName(folder.folderId, wanted);
    const uploaded = await uploadBytes({
      parentId: folder.folderId, name: fileName, mimeType: originalType.mime, bytes: originalBytes,
    });
    drive = { fileId: uploaded.id, folderId: folder.folderId, fileName };
  } catch (error) {
    console.error('library upload: versi HD gagal disimpan',
      error instanceof DriveError ? error.kind : 'unknown');
    warning = 'Gambar tersimpan, tetapi versi HD belum bisa disimpan ke Google Drive. Coba unggah lagi nanti.';
  }

  const { data, error } = await ctx.supabase.from('library_items').insert({
    bucket: 'member-media',
    class_id: ctx.classId,
    owner_id: ctx.user.id,
    title,
    storage_path: storagePath,
    mime_type: previewType.mime,
    size_bytes: previewBytes.byteLength,
    original_name: originalName.slice(0, 255),
    original_ext: originalType.ext,
    original_mime: originalType.mime,
    original_size: original.size,
    drive_file_id: drive?.fileId ?? null,
    drive_folder_id: drive?.folderId ?? null,
    drive_file_name: drive?.fileName ?? null,
    drive_error: drive ? null : 'hd_unavailable',
  }).select('id').maybeSingle();

  if (error || !data) {
    console.error('library upload: baris gagal disimpan', error?.code);
    const { error: removeError } = await ctx.supabase.storage.from('member-media').remove([storagePath]);
    if (removeError) console.error('library upload: versi ringan gagal dibersihkan');
    if (drive) await deleteFile(drive.fileId).catch(() => console.error('library upload: file HD gagal dibersihkan'));
    return fail(500, 'database', 'Gambar belum bisa dicatat. Coba lagi.');
  }

  const id = (data as { id: string }).id;
  const signed = await ctx.supabase.storage.from('member-media').createSignedUrl(storagePath, 600);
  return NextResponse.json({
    ok: true,
    item: {
      id,
      title,
      previewUrl: signed.data?.signedUrl ?? null,
      hd: drive !== null,
    },
    warning,
  }, { status: 201 });
}
