import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { libraryFolderName } from '@/lib/library/shared';
import {
  categoryFolderId, createFolder, DriveError, getMeta, renameFile, rootFolderId,
} from './drive';

type Supabase = Awaited<ReturnType<typeof createClient>>;
const CATEGORY = 'pictures';

type FolderRow = { category: string; drive_folder_id: string; folder_name: string };

async function readUsername(supabase: Supabase, classId: string, userId: string): Promise<string> {
  const { data } = await supabase.from('member_profiles')
    .select('username').eq('class_id', classId).eq('user_id', userId).maybeSingle();
  const username = (data as { username: string } | null)?.username;
  if (!username) throw new DriveError('config', 'Username anggota tidak ditemukan.');
  return username;
}

async function readFolder(
  supabase: Supabase, classId: string, userId: string,
): Promise<FolderRow | null> {
  const { data } = await supabase.from('library_drive_folders')
    .select('category,drive_folder_id,folder_name')
    .eq('class_id', classId).eq('owner_id', userId).eq('category', CATEGORY).maybeSingle();
  return (data as FolderRow | null) ?? null;
}

// Update dulu, insert bila belum ada. Upsert PostgREST ikut menulis kolom kunci
// yang sengaja tidak diberikan izin UPDATE, jadi jalurnya dipisah.
async function saveFolder(o: {
  supabase: Supabase; classId: string; userId: string; driveFolderId: string; name: string;
}): Promise<void> {
  const values = {
    drive_folder_id: o.driveFolderId,
    folder_name: o.name,
    updated_at: new Date().toISOString(),
  };
  const updated = await o.supabase.from('library_drive_folders').update(values)
    .eq('class_id', o.classId).eq('owner_id', o.userId).eq('category', CATEGORY)
    .select('drive_folder_id');
  if (updated.error) {
    console.error('library folder: pemetaan gagal diperbarui', updated.error.code);
    throw new DriveError('server', 'Pemetaan folder Library tidak dapat disimpan.');
  }
  if (updated.data?.length) return;

  const inserted = await o.supabase.from('library_drive_folders').insert({
    class_id: o.classId,
    owner_id: o.userId,
    category: CATEGORY,
    ...values,
  });
  if (inserted.error && inserted.error.code !== '23505') {
    console.error('library folder: pemetaan gagal disimpan', inserted.error.code);
    throw new DriveError('server', 'Pemetaan folder Library tidak dapat disimpan.');
  }
}

// Folder selalu dicari lewat pemetaan ID, bukan nama. Bila namanya sudah tidak
// sama dengan username, folder diganti nama (file tetap). Bila foldernya hilang,
// folder baru dibuat dan pemetaan diganti; file lama tidak pernah dihapus.
async function ensureNamedFolder(o: {
  supabase: Supabase; classId: string; userId: string; username: string;
}): Promise<{ folderId: string; name: string }> {
  const name = libraryFolderName(o.username);
  const row = await readFolder(o.supabase, o.classId, o.userId);

  if (row) {
    try {
      const meta = await getMeta(row.drive_folder_id);
      if (meta.trashed !== true) {
        if (meta.name !== name) await renameFile(row.drive_folder_id, name);
        if (row.folder_name !== name) {
          const { error } = await o.supabase.from('library_drive_folders')
            .update({ folder_name: name, updated_at: new Date().toISOString() })
            .eq('class_id', o.classId).eq('owner_id', o.userId).eq('category', CATEGORY);
          if (error) console.error('library folder: nama folder gagal dicatat', error.code);
        }
        return { folderId: row.drive_folder_id, name };
      }
      console.error('library folder: folder lama terhapus, membuat folder baru');
    } catch (error) {
      // Folder yang benar-benar hilang boleh diganti. Galat izin/kuota tidak,
      // supaya tidak membuat folder duplikat saat Drive sedang bermasalah.
      if (!(error instanceof DriveError && error.kind === 'not_found')) throw error;
      console.error('library folder: folder lama tidak ditemukan, membuat folder baru');
    }
  }

  const parentId = categoryFolderId(CATEGORY) ?? rootFolderId();
  const created = await createFolder(name, parentId);
  await saveFolder({
    supabase: o.supabase, classId: o.classId, userId: o.userId,
    driveFolderId: created.id, name: created.name,
  });
  return { folderId: created.id, name: created.name };
}

export async function ensureLibraryFolder(o: {
  supabase: Supabase; classId: string; userId: string;
}): Promise<{ folderId: string; name: string }> {
  const username = await readUsername(o.supabase, o.classId, o.userId);
  return ensureNamedFolder({ ...o, username });
}

// Dipanggil setelah username anggota berubah. Nama folder di Drive diganti tanpa
// memindahkan atau menghapus file, lalu pemetaan ID diperbarui. Kegagalan dicatat
// dan tidak menggagalkan perubahan username; unggahan berikutnya akan mencoba lagi.
export async function syncLibraryFolderName(o: {
  supabase: Supabase; classId: string; userId: string; username: string;
}): Promise<{ renamed: number; failed: number }> {
  const name = libraryFolderName(o.username);
  const { data } = await o.supabase.from('library_drive_folders')
    .select('category,drive_folder_id,folder_name')
    .eq('class_id', o.classId).eq('owner_id', o.userId);
  let renamed = 0;
  let failed = 0;

  for (const row of (data ?? []) as FolderRow[]) {
    if (row.folder_name === name) continue;
    try {
      const meta = await getMeta(row.drive_folder_id);
      if (meta.trashed === true) {
        failed++;
        continue;
      }
      if (meta.name !== name) await renameFile(row.drive_folder_id, name);
      const { error } = await o.supabase.from('library_drive_folders')
        .update({ folder_name: name, updated_at: new Date().toISOString() })
        .eq('class_id', o.classId).eq('owner_id', o.userId).eq('category', row.category);
      if (error) throw new DriveError('server', 'Nama folder tidak dapat dicatat.');
      renamed++;
    } catch (error) {
      failed++;
      console.error('library folder sync gagal', error instanceof DriveError ? error.kind : 'unknown');
    }
  }
  return { renamed, failed };
}
