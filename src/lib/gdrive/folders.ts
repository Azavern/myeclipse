import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { categoryFolderId, canWriteToFolder, createFolder, createTextFile, customParentId, deleteFile, DriveError, getMeta, hasAnyoneWriter, rootFolderId } from './drive';
import { CATEGORY_LABEL, parseFolderRef, type Category } from './files';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CloudFolderRow = {
  id: string;
  name: string;
  kind: 'custom' | 'external';
  drive_folder_id: string;
  validated_at: string | null;
};

export type Destination = { driveFolderId: string; label: string; source: 'folder' | 'category' | 'root' };

export async function ownFolder(supabase: Supabase, userId: string, classId: string, id: string): Promise<CloudFolderRow | null> {
  const { data } = await supabase.from('gdrive_folders')
    .select('id,name,kind,drive_folder_id,validated_at')
    .eq('id', id).eq('owner_id', userId).eq('class_id', classId).maybeSingle();
  return (data as CloudFolderRow | null) ?? null;
}

// Prioritas: pilihan khusus unggahan ini → default pengguna → folder kategori → root.
// Default yang rusak TIDAK dialihkan diam-diam; pengguna diminta memperbaikinya.
export async function resolveDestination(o: {
  supabase: Supabase; userId: string; classId: string; category: Category;
  folderId?: string | null; preferDefault?: boolean;
}): Promise<Destination> {
  let row: CloudFolderRow | null = null;
  if (o.folderId) {
    row = await ownFolder(o.supabase, o.userId, o.classId, o.folderId);
    if (!row) throw new DriveError('forbidden', 'Folder tujuan bukan milikmu.');
  } else if (o.preferDefault !== false) {
    const { data: profile } = await o.supabase.from('gdrive_profiles')
      .select('default_folder_id').eq('class_id', o.classId).eq('owner_id', o.userId).maybeSingle();
    const defaultId = (profile as { default_folder_id: string | null } | null)?.default_folder_id;
    if (defaultId) {
      row = await ownFolder(o.supabase, o.userId, o.classId, defaultId);
      if (!row) {
        throw new DriveError('folder', 'Folder default tidak lagi tersedia. Perbaiki atau ganti tujuan penyimpanan di halaman Cloud.');
      }
    }
  }

  if (row) {
    const meta = await getMeta(row.drive_folder_id).catch((error: unknown) => {
      if (error instanceof DriveError && error.kind === 'not_found') {
        throw new DriveError('folder', `Folder "${row?.name ?? 'tujuan'}" sudah dihapus atau tidak dapat diakses. Pilih tujuan lain.`);
      }
      throw error;
    });
    if (!canWriteToFolder(meta)) throw new DriveError('folder', `Folder "${meta.name}" tidak dapat ditulisi.`);
    if (row.kind === 'external' && !hasAnyoneWriter(meta)) {
      throw new DriveError('folder', `Izin folder "${meta.name}" berubah. Folder eksternal harus "Anyone with the link" sebagai Editor.`);
    }
    return { driveFolderId: meta.id, label: meta.name, source: 'folder' };
  }

  const categoryId = categoryFolderId(o.category);
  const target = categoryId ?? rootFolderId();
  const label = categoryId ? `folder ${CATEGORY_LABEL[o.category]}` : 'folder utama';
  try {
    const meta = await getMeta(target);
    if (!canWriteToFolder(meta)) throw new DriveError('folder', `Folder ${label} tidak dapat ditulisi.`);
    return { driveFolderId: meta.id, label: meta.name, source: categoryId ? 'category' : 'root' };
  } catch (error) {
    if (error instanceof DriveError && (error.kind === 'not_found' || error.kind === 'forbidden')) {
      throw new DriveError('folder', `Folder ${label} yang dikonfigurasi server tidak ditemukan atau tidak dapat diakses.`);
    }
    throw error;
  }
}

const DUMMY_TEXT = 'Eclipse Google Drive access check. File ini dibuat otomatis lalu dihapus.';

// Folder eksternal divalidasi dengan file uji kecil; file asli pengguna tidak
// pernah dipakai untuk mengetes izin.
export async function validateExternalFolder(input: string): Promise<{ driveFolderId: string; name: string }> {
  const folderId = parseFolderRef(input);
  if (!folderId) throw new DriveError('folder', 'Masukkan Folder ID atau link folder Google Drive yang valid, bukan link file.');

  const meta = await getMeta(folderId).catch((error: unknown) => {
    if (error instanceof DriveError && error.kind === 'not_found') {
      throw new DriveError('folder', 'Folder tidak ditemukan. Pastikan link folder benar dan akun server punya akses.');
    }
    throw error;
  });
  if (meta.mimeType !== 'application/vnd.google-apps.folder' || meta.trashed === true) {
    throw new DriveError('folder', 'Link itu bukan folder Google Drive yang aktif.');
  }
  if (!hasAnyoneWriter(meta)) {
    throw new DriveError('folder', 'Folder harus dibagikan sebagai "Anyone with the link" dengan izin Editor. Viewer saja tidak cukup.');
  }
  if (!canWriteToFolder(meta)) {
    throw new DriveError('folder', 'Akun Google server tidak dapat menulis ke folder ini.');
  }

  const dummyName = `eclipse-dummy-${crypto.randomUUID()}.txt`;
  let dummyId: string;
  try {
    ({ id: dummyId } = await createTextFile(folderId, dummyName, DUMMY_TEXT));
  } catch {
    throw new DriveError('folder', 'Folder dapat ditemukan, tetapi file uji tidak bisa dibuat. Pastikan izin Editor benar-benar berlaku.');
  }

  try {
    await deleteFile(dummyId);
  } catch {
    try {
      await deleteFile(dummyId);
    } catch {
      throw new DriveError('cleanup', `File uji "${dummyName}" berhasil dibuat tetapi gagal dihapus. Hapus file itu manual dari folder Google Drive.`);
    }
  }

  try {
    await getMeta(dummyId);
    throw new DriveError('cleanup', `File uji "${dummyName}" masih ada di folder. Hapus manual sebelum memakai folder ini.`);
  } catch (error) {
    if (!(error instanceof DriveError && error.kind === 'not_found')) throw error;
  }

  return { driveFolderId: folderId, name: meta.name };
}

function cleanFolderName(raw: string): string {
  const name = raw.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '');
  if (!name) throw new DriveError('folder', 'Nama folder wajib diisi.');
  if (name.length > 80) throw new DriveError('folder', 'Nama folder maksimal 80 karakter.');
  return name;
}

export async function createCustomFolder(name: string): Promise<{ driveFolderId: string; name: string; parentDriveId: string }> {
  const clean = cleanFolderName(name);
  const parentDriveId = customParentId();
  try {
    const parent = await getMeta(parentDriveId);
    if (!canWriteToFolder(parent)) throw new DriveError('folder', 'Folder induk custom tidak dapat ditulisi.');
  } catch (error) {
    if (error instanceof DriveError && error.kind === 'not_found') {
      throw new DriveError('folder', 'Folder induk untuk folder custom tidak ditemukan. Periksa GDRIVE_CUSTOM atau GDRIVE_ROOT_FOLDER_ID.');
    }
    throw error;
  }
  const folder = await createFolder(clean, parentDriveId);
  return { driveFolderId: folder.id, name: folder.name, parentDriveId };
}
