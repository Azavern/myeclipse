'use server';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { DriveError, gdriveStatus } from '@/lib/gdrive/drive';
import { gateLibraryFetch } from '@/lib/library/guard';
import {
  browseLibrary, libraryRoot, LibraryNavError, pickLibraryItem,
} from '@/lib/library/navigator';
import {
  LIBRARY_DRIVE_ID, LIBRARY_FOLDER_MAX, LIBRARY_FOLDER_STEP, LIBRARY_PAGE_MAX,
  type LibraryBrowseView, type LibraryPickView,
} from '@/lib/library/view';

export type LibraryBrowseResult =
  | { ok: true; data: LibraryBrowseView }
  | { ok: false; code: 'cooldown'; retryAfterMs: number }
  | { ok: false; code: 'config' | 'forbidden' | 'folder' | 'drive' | 'unknown'; message: string };

export type LibraryPickResult = { ok: true; data: LibraryPickView } | { ok: false; message: string };

const browseSchema = z.object({
  folderId: z.string().regex(LIBRARY_DRIVE_ID).nullish(),
  folders: z.number().int().min(LIBRARY_FOLDER_STEP).max(LIBRARY_FOLDER_MAX).optional(),
  page: z.number().int().min(1).max(LIBRARY_PAGE_MAX).optional(),
});

function driveMessage(error: unknown): LibraryBrowseResult {
  if (error instanceof LibraryNavError) return { ok: false, code: error.kind, message: error.message };
  if (error instanceof DriveError) {
    console.error('library nav: drive', error.kind);
    if (error.kind === 'config') return { ok: false, code: 'config', message: 'Google Drive belum dikonfigurasi di server.' };
    if (error.kind === 'rate') return { ok: false, code: 'unknown', message: 'Google Drive sedang membatasi permintaan. Coba lagi sebentar lagi.' };
    if (error.kind === 'network') return { ok: false, code: 'unknown', message: 'Koneksi ke Google Drive terputus. Coba lagi.' };
    return { ok: false, code: 'unknown', message: 'Isi folder belum bisa dibaca. Coba lagi.' };
  }
  console.error('library nav', error);
  return { ok: false, code: 'unknown', message: 'Isi folder belum bisa dibaca. Coba lagi.' };
}

// Setiap pengambilan daftar lewat sini dihitung pembatas. Folder yang belum
// ada tidak memanggil Drive, jadi tidak memakai jatah.
export async function browseLibraryFolder(input: unknown): Promise<LibraryBrowseResult> {
  const parsed = browseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'folder', message: 'Folder tidak valid.' };

  const ctx = await requireActionContext();
  if (!ctx) return { ok: false, code: 'forbidden', message: 'Sesi berakhir. Masuk kembali lalu coba lagi.' };
  if (!gdriveStatus().ready) return { ok: false, code: 'config', message: 'Google Drive belum dikonfigurasi di server.' };

  try {
    const root = await libraryRoot(ctx.supabase, ctx.classId, ctx.user.id);
    if (!root) return { ok: false, code: 'folder', message: 'Folder Drive Library belum ada. Unggah satu gambar lebih dulu, lalu buka lagi.' };

    const gate = await gateLibraryFetch(ctx.supabase, ctx.user.id);
    if (!gate.allowed) return { ok: false, code: 'cooldown', retryAfterMs: gate.retryAfterMs };

    const data = await browseLibrary({
      supabase: ctx.supabase, userId: ctx.user.id, classId: ctx.classId, root,
      folderId: parsed.data.folderId ?? null,
      folders: parsed.data.folders,
      page: parsed.data.page,
    });
    return { ok: true, data };
  } catch (error) {
    return driveMessage(error);
  }
}

const pickSchema = z.string().uuid();

// Mengambil URL pratinjau satu item Library. Ini pembacaan Storage bertanda
// tangan, bukan daftar Drive, jadi tidak memakai jatah pembatas.
export async function pickLibraryImage(id: string): Promise<LibraryPickResult> {
  const parsed = pickSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: 'Gambar tidak valid.' };

  const ctx = await requireActionContext();
  if (!ctx) return { ok: false, message: 'Sesi berakhir. Masuk kembali lalu coba lagi.' };

  try {
    const data = await pickLibraryItem(ctx.supabase, ctx.user.id, parsed.data);
    if (!data) return { ok: false, message: 'Gambar itu tidak ada di Library-mu.' };
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof LibraryNavError ? error.message : 'Gambar belum bisa dipakai. Coba lagi.',
    };
  }
}
