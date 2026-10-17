import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { classVisibilityFields } from '@/features/fields';
import { saveClassVisibility } from '@/features/visibility/actions';
import { createClient } from '@/lib/supabase/server';
import { CLASS_KEYS, allowedFor } from '@/lib/visibility/audiences';

export const metadata: Metadata = { title: 'Visibilitas kelas' };

export default async function Page() {
  const supabase = await createClient();
  const [rules, map] = await Promise.all([
    supabase.from('visibility_rules').select('key,audience').is('owner_id', null),
    supabase.rpc('get_visibility_map'),
  ]);
  const current = Object.fromEntries(((rules.data ?? []) as { key: string; audience: string }[]).map((r) => [r.key, r.audience]));
  const effective = Object.fromEntries(((map.data ?? []) as { key: string; effective_audience: string }[]).map((r) => [r.key, r.effective_audience]));
  return (
    <ManageNew perm="class.manage" next="/settings/visibility" icon="eye" title="Visibilitas kelas"
      description="Atur siapa yang boleh melihat tiap halaman dan bagian. Halaman adalah langit-langit: bagian di dalamnya tidak pernah lebih terbuka dari halamannya."
      parent={{ label: 'Pengaturan', href: '/settings/class' }} action={saveClassVisibility} submit="Simpan visibilitas"
      fields={classVisibilityFields(CLASS_KEYS, current, effective, allowedFor)} />
  );
}
