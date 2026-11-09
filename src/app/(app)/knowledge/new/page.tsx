import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { PageHeader } from '@/components/ui/primitives';
import { KnowledgeEditor } from '@/features/knowledge/editor';
import { saveKnowledge } from '@/features/knowledge/actions';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Tulis pengetahuan' };

export default async function NewKnowledgePage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=/knowledge/new');
  if (viewer.status !== 'active') return <NoAccess />;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_knowledge_facets');
  const facets = (data ?? []) as { kind: string; value: string }[];
  const tags = facets.filter((f) => f.kind === 'tag').map((f) => f.value).slice(0, 20);

  return (
    <>
      <PageHeader crumbs={[{ label: 'Knowledge', href: '/knowledge' }, { label: 'Entri baru' }]}
        icon="pencil" title="Tulis pengetahuan"
        description="Bagikan artikel Markdown atau halaman shortcut. Draf lokal disimpan di perangkat ini sampai kamu menerbitkan atau membuangnya." />
      <KnowledgeEditor action={saveKnowledge} entry={null}
        tagSuggestions={tags} backHref="/knowledge" draftOwner={viewer.user.id} />
    </>
  );
}
