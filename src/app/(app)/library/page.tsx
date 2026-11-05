import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { PageHeader } from '@/components/ui/primitives';
import { LibraryManager, type LibraryItemView, type LibraryMember } from '@/features/library/library-manager';
import { getClass } from '@/lib/class';
import { isLibraryVisibility } from '@/lib/library/shared';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Library' };

type Row = {
  id: string; owner_id: string; title: string; storage_path: string; size_bytes: number;
  drive_file_id: string | null; visibility: string; created_at: string;
};
type ProfileRow = { user_id: string; full_name: string; username: string };
type GrantRow = { item_id: string; user_id: string };

// Library hanya untuk anggota aktif. RLS menentukan item mana yang terlihat:
// milik sendiri, semua anggota, atau yang dibagikan secara spesifik.
export default async function LibraryPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Flibrary');
  if (viewer.status !== 'active') return <NoAccess />;
  const userId = viewer.user.id;

  const supabase = await createClient();
  const cls = await getClass();
  const [itemsResult, membersResult] = await Promise.all([
    supabase.from('library_items')
      .select('id,owner_id,title,storage_path,size_bytes,drive_file_id,visibility,created_at')
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('member_profile_v').select('user_id,full_name,username')
      .order('full_name').limit(300),
  ]);

  const rows = (itemsResult.data ?? []) as Row[];
  const profiles = (membersResult.data ?? []) as ProfileRow[];
  const names = new Map(profiles.map((profile) => [
    profile.user_id,
    profile.full_name?.trim() || profile.username,
  ] as const));
  names.set(userId, names.get(userId) ?? 'Saya');

  const ownIds = rows.filter((row) => row.owner_id === userId).map((row) => row.id);
  const grantsResult = ownIds.length > 0
    ? await supabase.from('library_item_access').select('item_id,user_id').in('item_id', ownIds)
    : { data: [] as GrantRow[] };
  const grants = new Map<string, string[]>();
  for (const grant of (grantsResult.data ?? []) as GrantRow[]) {
    const list = grants.get(grant.item_id) ?? [];
    list.push(grant.user_id);
    grants.set(grant.item_id, list);
  }

  const urls = await signMany(supabase, 'member-media', rows.map((row) => row.storage_path));
  const items: LibraryItemView[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: urls.get(row.storage_path) ?? null,
    ownerId: row.owner_id,
    ownerName: names.get(row.owner_id) ?? 'Anggota',
    size: row.size_bytes,
    hd: !!row.drive_file_id,
    visibility: isLibraryVisibility(row.visibility) ? row.visibility : 'private',
    createdAt: row.created_at,
    sharedWith: grants.get(row.id) ?? [],
  }));
  const members: LibraryMember[] = profiles
    .filter((profile) => profile.user_id !== userId)
    .map((profile) => ({ id: profile.user_id, name: profile.full_name?.trim() || profile.username }));

  return (
    <>
      <PageHeader icon="image" title="Library"
        description="Kelola gambar yang pernah kamu unggah, atur siapa yang boleh melihat, dan pakai ulang di form lain." />
      <LibraryManager items={items} members={members} meId={userId} tz={cls?.timezone ?? 'Asia/Jakarta'} />
    </>
  );
}
