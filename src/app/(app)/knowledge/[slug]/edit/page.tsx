import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DeleteButton } from '@/components/entity-form';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { PageHeader } from '@/components/ui/primitives';
import { deleteKnowledge, saveKnowledge } from '@/features/knowledge/actions';
import { KnowledgeEditor, type EditorEntry, type EditorShortcut } from '@/features/knowledge/editor';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Ubah pengetahuan' };

export default async function EditKnowledgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/login?next=${encodeURIComponent(`/knowledge/${slug}/edit`)}`);
  if (viewer.status !== 'active') return <NoAccess />;

  const supabase = await createClient();
  const { data, error } = await supabase.from('knowledge_entries')
    .select('id,slug,title,tagline,content_md,category,status,visibility,version,author_id,knowledge_entry_tags(tag),knowledge_shortcuts(keys,label,note,position)')
    .eq('slug', slug).maybeSingle();
  const row = data as (Omit<EditorEntry, 'tags' | 'shortcuts'> & {
    author_id: string; knowledge_entry_tags: { tag: string }[] | null;
    knowledge_shortcuts: EditorShortcut[] | null;
  }) | null;
  if (error || !row) notFound();

  const isAuthor = row.author_id === viewer.user.id;
  let isEditor = false;
  if (!isAuthor) {
    const { data: grant } = await supabase.from('knowledge_editors')
      .select('expires_at,revoked_at').eq('entry_id', row.id).eq('user_id', viewer.user.id).maybeSingle();
    const g = grant as { expires_at: string | null; revoked_at: string | null } | null;
    isEditor = !!g && !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date());
  }
  if (!isAuthor && !isEditor) return <NoAccess />;

  const facetsRes = await supabase.rpc('get_knowledge_facets');
  const facets = (facetsRes.data ?? []) as { kind: string; value: string }[];
  const tags = facets.filter((f) => f.kind === 'tag').map((f) => f.value).slice(0, 20);
  const entry: EditorEntry = {
    ...row,
    tags: (row.knowledge_entry_tags ?? []).map((t) => t.tag).sort(),
    shortcuts: row.knowledge_shortcuts ?? [],
  };
  const back = `/knowledge/${entry.slug}`;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Knowledge', href: '/knowledge' }, { label: entry.title, href: back }, { label: 'Ubah' }]}
        icon="pencil" title="Ubah entri"
        description="Menyimpan akan memperbarui versi saat ini. Penanda perubahan hanya berlaku untuk suntingan terakhir; tidak ada arsip revisi." />
      <div className="stack">
        <KnowledgeEditor action={saveKnowledge} entry={entry}
          tagSuggestions={tags} backHref={back} draftOwner={viewer.user.id} />
        {isAuthor && (
          <section className="card danger-zone" aria-labelledby="kb-danger-title">
            <div className="card__head">
              <h2 id="kb-danger-title" className="card__title"><Icon name="alert-triangle" size={20} />Hapus entri</h2>
            </div>
            <div className="zone">
              <p className="muted">Entri, tag, permintaan edit, dan akses editnya akan dihapus permanen. Jejak audit tindakan visibilitas tetap ada tanpa isi entri.</p>
              <DeleteButton action={deleteKnowledge} id={entry.id} title={`Hapus “${entry.title}”?`}
                consequence="Entri dan seluruh izin editnya akan dihapus permanen." confirmLabel="Hapus entri" />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
