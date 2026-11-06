import 'server-only';
import { DriveError, getMeta, listFolders, listImagesInFolder, type DriveMeta } from '@/lib/gdrive/drive';
import { LIBRARY_CATEGORY, isLibraryVisibility, libraryDownloadName } from '@/lib/library/shared';
import { signByBucket, signedKey } from '@/lib/storage/sign';
import type { createClient } from '@/lib/supabase/server';
import {
  LIBRARY_DRIVE_ID, LIBRARY_FOLDER_MAX, LIBRARY_FOLDER_STEP, LIBRARY_PAGE_MAX, LIBRARY_PAGE_SIZE,
  type LibraryBrowseView, type LibraryEntryView, type LibraryPickView, type LibraryStorageView,
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
    .select('id,drive_file_id,storage_path,bucket')
    .eq('owner_id', userId).in('drive_file_id', driveIds);
  if (error) {
    console.error('library nav: item Library gagal dibaca', error.code);
    return map;
  }

  const rows = (data ?? []) as { id: string; drive_file_id: string; storage_path: string; bucket: string }[];
  const urls = await signByBucket(supabase, rows);
  for (const row of rows) {
    map.set(row.drive_file_id, { id: row.id, url: urls.get(signedKey(row.bucket, row.storage_path)) ?? null });
  }
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
// gambar lain. Tidak ada filter pemilik di sini: RLS `library_items` sudah
// menentukan item mana yang boleh dibaca (milik sendiri, `all`, atau `specific`),
// dan policy Storage mengikuti baris katalognya.
export async function pickLibraryItem(
  supabase: Supabase, id: string,
): Promise<LibraryPickView | null> {
  const { data, error } = await supabase.from('library_items')
    .select('title,storage_path,bucket,original_name,original_ext,mime_type')
    .eq('id', id).maybeSingle();
  if (error) {
    console.error('library pick: item gagal dibaca', error.code);
    throw new LibraryNavError('drive', 'Gambar tidak dapat diambil. Coba lagi.');
  }

  const row = data as {
    title: string; storage_path: string; bucket: string; original_name: string | null;
    original_ext: string | null; mime_type: string | null;
  } | null;
  if (!row) return null;

  const urls = await signByBucket(supabase, [row]);
  const url = urls.get(signedKey(row.bucket, row.storage_path));
  if (!url) return null;

  const ext = (row.mime_type ?? '').split('/')[1]?.toLowerCase() || row.original_ext || 'webp';
  return { url, name: libraryDownloadName(row.original_name, row.title, ext) };
}

type StorageRow = {
  id: string; owner_id: string; title: string; storage_path: string; bucket: string;
  size_bytes: number; visibility: string; drive_file_id: string | null; created_at: string;
};
type OwnerRow = { user_id: string; full_name: string | null; username: string };

// Sumber "Dari Storage": baris katalog Supabase (bucket `member-media` dan
// `class-media`), bukan isi folder Drive. RLS menentukan item mana yang boleh
// dibaca; halaman dibatasi 10 gambar seperti penjelajah Drive. Hanya query
// database dan tanda tangan Storage, jadi tidak memakai jatah pembatas Drive.
export async function browseStorage(supabase: Supabase, page: number): Promise<LibraryStorageView> {
  const current = clamp(page, 1, LIBRARY_PAGE_MAX);
  const from = (current - 1) * LIBRARY_PAGE_SIZE;
  const { data, error, count } = await supabase.from('library_items')
    .select('id,owner_id,title,storage_path,bucket,size_bytes,visibility,drive_file_id,created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + LIBRARY_PAGE_SIZE - 1);
  if (error) {
    console.error('library storage: katalog gagal dibaca', error.code);
    throw new LibraryNavError('drive', 'Daftar gambar Storage belum bisa dibaca. Coba lagi.');
  }

  const rows = (data ?? []) as StorageRow[];
  const urls = await signByBucket(supabase, rows);

  const ownerIds = [...new Set(rows.map((row) => row.owner_id))];
  const ownerResult = ownerIds.length > 0
    ? await supabase.from('member_profile_v').select('user_id,full_name,username').in('user_id', ownerIds)
    : { data: [] as OwnerRow[] };
  const names = new Map<string, string>();
  for (const owner of (ownerResult.data ?? []) as OwnerRow[]) {
    names.set(owner.user_id, owner.full_name?.trim() || owner.username);
  }

  const total = count ?? rows.length;
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      ownerName: names.get(row.owner_id) ?? 'Anggota',
      size: row.size_bytes,
      visibility: isLibraryVisibility(row.visibility) ? row.visibility : 'private',
      hd: row.drive_file_id !== null,
      createdAt: row.created_at,
      thumbUrl: urls.get(signedKey(row.bucket, row.storage_path)) ?? null,
    })),
    page: current,
    hasMore: from + rows.length < total,
    total,
  };
}
