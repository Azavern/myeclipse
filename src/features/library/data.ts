import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { signMany } from '@/lib/storage/sign';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LibraryPickerItem = { id: string; title: string; url: string | null; hd: boolean };

// Item milik pengguna untuk pemilih di form gambar lain. Hanya milik sendiri yang
// bisa dipakai ulang, jadi query dibatasi owner_id dari sesi.
export async function libraryPickerItems(
  supabase: Supabase, userId: string, limit = 30,
): Promise<LibraryPickerItem[]> {
  const { data } = await supabase.from('library_items')
    .select('id,title,storage_path,drive_file_id')
    .eq('owner_id', userId).order('created_at', { ascending: false }).limit(limit);
  const rows = (data ?? []) as {
    id: string; title: string; storage_path: string; drive_file_id: string | null;
  }[];
  const urls = await signMany(supabase, 'member-media', rows.map((row) => row.storage_path));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: urls.get(row.storage_path) ?? null,
    hd: !!row.drive_file_id,
  }));
}
