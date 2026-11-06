// Tipe dan batas tampilan penjelajah Library. Tanpa 'server-only' supaya
// dipakai halaman server, dialog klien, dan aksi server sekaligus.
import type { LibraryVisibility } from './shared';

export const LIBRARY_PAGE_SIZE = 10;
export const LIBRARY_PAGE_MAX = 5;
export const LIBRARY_FOLDER_STEP = 10;
export const LIBRARY_FOLDER_MAX = 50;
export const LIBRARY_COOLDOWN_TEXT = 'Jeda 1 menit sebelum menggunakan Library kembali';

// Hanya ID Drive yang berbentuk wajar yang diteruskan ke API.
export const LIBRARY_DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export type LibraryEntryView = {
  id: string;
  name: string;
  size: number | null;
  createdAt: string | null;
  libraryId: string | null;
  thumbUrl: string | null;
};

export type LibraryBrowseView = {
  folder: { id: string; name: string };
  parent: { id: string; name: string } | null;
  folders: LibraryEntryView[];
  foldersMore: boolean;
  images: LibraryEntryView[];
  hasMoreImages: boolean;
  page: number;
};

export type LibraryPickView = { url: string; name: string };

// Sumber kedua penjelajah: baris katalog di Supabase Storage (bucket
// `member-media` dan `class-media`), bukan folder Drive. Ini yang membuat
// gambar bersama dan media kelas bisa dipakai ulang dari form gambar mana pun.
export type LibraryStorageItemView = {
  id: string;
  title: string;
  ownerName: string;
  size: number | null;
  visibility: LibraryVisibility;
  hd: boolean;
  createdAt: string | null;
  thumbUrl: string | null;
};

export type LibraryStorageView = {
  items: LibraryStorageItemView[];
  page: number;
  hasMore: boolean;
  total: number;
};
