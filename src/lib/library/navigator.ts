import 'server-only';
import { DriveError, getMeta, listFolders, listImagesInFolder, type DriveMeta } from '@/lib/gdrive/drive';
import { LIBRARY_CATEGORY, libraryDownloadName } from '@/lib/library/shared';
import { signMany } from '@/lib/storage/sign';
import type { createClient } from '@/lib/supabase/server';
import {
  LIBRARY_DRIVE_ID, LIBRARY_FOLDER_MAX, LIBRARY_FOLDER_STEP, LIBRARY_PAGE_MAX, LIBRARY_PAGE_SIZE,
  type LibraryBrowseView, type LibraryEntryView, type LibraryPickView,
} from './view';

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Kegagalan penjelajah dibedakan dari galat Drive mentah supaya pesan ke
// pengguna jelas: folder miliknya, izin, atau konfigurasi server.
export class LibraryNavError extends Error {
  constructor(public kind: 'config' | 'folder' | 'forbidden' | 'drive', message: string) {
    super(message);
    this.name = 'LibraryNavError';
  }
}

const MAX_DEPTH = 12;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

export type LibraryRoot = { id: string; name: string };

// Folder pribadi anggota di Drive. Dibuat saat unggahan pertama, jadi bisa
// belum ada; tanpa folder ini penjelajah tidak memanggil Drive sama sekali.
export async function libraryRoot(
  supabase: Supabase, classId: string, userId: string,
): Promise<LibraryRoot | null> {
  const { data, error } = await supabase.from('library_drive_folders')
    .select('drive_folder_id,folder_name')
    .eq('class_id', classId).eq('owner_id', userId).eq('category', LIBRARY_CATEGORY)
    .maybeSingle();
  if (error) {
    console.error('library nav: folder Drive gagal dibaca', error.code);
    throw new LibraryNavError('drive', 'Folder Library tidak dapat dibaca. Coba lagi.');
  }
  const row = data as { drive_folder_id: string; folder_name: string } | null;
  return row ? { id: row.drive_folder_id, name: row.folder_name } : null;
}

// Id folder datang dari peramban, jadi rantai induknya diperiksa sampai folder
// akar Library. Folder di luar Library (mis. folder Cloud lain) ditolak.
async function insideRoot(folderId: string, rootId: string): Promise<boolean> {
  let current: string | undefined = folderId;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current === rootId) return true;
    const meta: DriveMeta | null = await getMeta(current).catch(() => null);
    current = meta?.parents?.[0];
  }
  return false;
}

// Pratinjau hanya untuk gambar yang tercatat sebagai item Library. File lain di
// Drive tetap ditampilkan sebagai baris tanpa gambar, bukan diambil ulang
// lewat server (itu yang membuat penjelajah berat).
async function previews(supabase: Supabase, userId: string, driveIds: string[]) {
  const map = new Map<string, { id: string; url: string | null }>();
  if (driveIds.length === 0) return map;

  const { data, error } = await supabase.from('library_items')
    .select('id,drive_file_id,storage_path')
    .eq('owner_id', userId).in('drive_file_id', driveIds);
  if (error) {
    console.error('library nav: item Library gagal dibaca', error.code);
    return map;
  }

  const rows = (data ?? []) as { id: string; drive_file_id: string; storage_path: string }[];
  const urls = await signMany(supabase, 'member-media', rows.map((row) => row.storage_path));
  for (const row of rows) map.set(row.drive_file_id, { id: row.id, url: urls.get(row.storage_path) ?? null });
  return map;
}

export async function browseLibrary(o: {
  supabase: Supabase; userId: string; classId: string; root: LibraryRoot;
  folderId?: string | null; folders?: number; page?: number;
}): Promise<LibraryBrowseView> {
  const target = o.folderId ?? o.root.id;
  if (!LIBRARY_DRIVE_ID.test(target)) throw new LibraryNavError('folder', 'Folder tidak valid.');
  if (target !== o.root.id && !(await insideRoot(target, o.root.id))) {
    throw new LibraryNavError('forbidden', 'Hanya folder di dalam Library-mu yang bisa dibuka.');
  }

  const folder = await getMeta(target).catch((error: unknown) => {
    if (error instanceof DriveError && (error.kind === 'not_found' || error.kind === 'forbidden')) {
      throw new LibraryNavError('folder', 'Folder itu sudah tidak ada di Google Drive.');
    }
    throw error;
  });

  const shown = clamp(o.folders ?? LIBRARY_FOLDER_STEP, LIBRARY_FOLDER_STEP, LIBRARY_FOLDER_MAX);
  const page = clamp(o.page ?? 1, 1, LIBRARY_PAGE_MAX);

  // Satu kueri per jenis isi: folder dibatasi jumlah tampil, gambar diambil
  // sampai akhir halaman yang diminta.
  const [folders, images] = await Promise.all([
    listFolders(target, shown + 1),
    listImagesInFolder(target, page * LIBRARY_PAGE_SIZE + 1),
  ]);
  const known = await previews(o.supabase, o.userId, images.map((item) => item.id));

  const parentId = target === o.root.id ? null : folder.parents?.[0] ?? null;
  const parent = parentId
    ? {
        id: parentId,
        name: parentId === o.root.id ? o.root.name : (await getMeta(parentId).catch(() => null))?.name ?? 'Folder induk',
      }
    : null;

  return {
    folder: { id: folder.id, name: folder.name },
    parent,
    folders: folders.slice(0, shown).map<LibraryEntryView>((item) => ({
      id: item.id, name: item.name, size: null, createdAt: null, libraryId: null, thumbUrl: null,
    })),
    foldersMore: folders.length > shown,
    images: images.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE).map((item) => {
      const preview = known.get(item.id) ?? null;
      return {
        id: item.id,
        name: item.name,
        size: item.size ? Number(item.size) : null,
        createdAt: item.createdTime ?? null,
        libraryId: preview?.id ?? null,
        thumbUrl: preview?.url ?? null,
      };
    }),
    hasMoreImages: images.length > page * LIBRARY_PAGE_SIZE,
    page,
  };
}

// URL bertanda tangan singkat untuk memakai ulang satu gambar Library di form
// gambar lain. Hanya pemilik item yang bisa memintanya.
export async function pickLibraryItem(
  supabase: Supabase, userId: string, id: string,
): Promise<LibraryPickView | null> {
  const { data, error } = await supabase.from('library_items')
    .select('title,storage_path,original_name,original_ext,mime_type')
    .eq('id', id).eq('owner_id', userId).maybeSingle();
  if (error) {
    console.error('library pick: item gagal dibaca', error.code);
    throw new LibraryNavError('drive', 'Gambar tidak dapat diambil. Coba lagi.');
  }

  const row = data as {
    title: string; storage_path: string; original_name: string | null;
    original_ext: string | null; mime_type: string | null;
  } | null;
  if (!row) return null;

  const urls = await signMany(supabase, 'member-media', [row.storage_path]);
  const url = urls.get(row.storage_path);
  if (!url) return null;

  const ext = (row.mime_type ?? '').split('/')[1]?.toLowerCase() || row.original_ext || 'webp';
  return { url, name: libraryDownloadName(row.original_name, row.title, ext) };
}
