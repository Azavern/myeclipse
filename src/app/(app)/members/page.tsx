import type { Metadata } from 'next';
import { NoAccess } from '@/components/states';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { MemberDirectory } from '@/features/members/directory';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { requireView } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Anggota' };

type Row = { username: string; full_name: string; nickname: string | null; role_name: string; status: string; avatar_path: string | null };

export default async function MembersPage() {
  if (!(await requireView('page.members', '/members'))) return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase.from('member_profile_v')
    .select('username,full_name,nickname,role_name,status,avatar_path').order('full_name').limit(100);
  const rows = (data ?? []) as Row[];
  const avatars = await signMany(supabase, 'member-media', rows.map((r) => r.avatar_path));
  return (
    <>
      <PageHeader icon="users" title="Anggota" description={rows.length > 0 ? `${rows.length} anggota kelas.` : 'Teman sekelas dan pengelola kelas.'} />
      {rows.length === 0
        ? <EmptyState icon="users" title="Belum ada anggota yang ditampilkan">Anggota kelas akan muncul di sini.</EmptyState>
        : <MemberDirectory members={rows.map((r) => ({ ...r, avatar: r.avatar_path ? avatars.get(r.avatar_path) ?? null : null }))} />}
    </>
  );
}
