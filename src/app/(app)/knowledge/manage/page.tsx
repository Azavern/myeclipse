import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { EmptyState, LinkButton, Notice, PageHeader, Segmented } from '@/components/ui/primitives';
import {
  KnowledgeStatusChip, KnowledgeTags, KnowledgeVisibilityChip,
} from '@/features/knowledge/components';
import { KB_CATEGORY_LABEL, knowledgeCategory } from '@/lib/knowledge/labels';
import { createClient } from '@/lib/supabase/server';
import { formatDay } from '@/lib/time';
import { getClass } from '@/lib/class';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Entri pengetahuan saya' };

type Row = {
  id: string; slug: string; title: string; tagline: string | null; category: string | null;
  status: string; visibility: string; updated_at: string; edited_at: string | null;
  knowledge_entry_tags: { tag: string }[] | null;
};

export default async function ManageKnowledgePage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=/knowledge/manage');
  if (viewer.status !== 'active') return <NoAccess />;

  const supabase = await createClient();
  const [cls, res] = await Promise.all([
    getClass(),
    supabase.from('knowledge_entries')
      .select('id,slug,title,tagline,category,status,visibility,updated_at,edited_at,knowledge_entry_tags(tag)')
      .eq('author_id', viewer.user.id).order('updated_at', { ascending: false }).limit(100),
  ]);
  const rows = (res.data ?? []) as Row[];
  const pendingCount = rows.length === 0 ? 0 : ((await supabase.from('knowledge_edit_requests')
    .select('id').in('entry_id', rows.map((r) => r.id)).eq('status', 'pending_author')).data ?? []).length;
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader icon="book-open" title="Entri pengetahuan saya"
        description="Kelola artikel Markdown, halaman shortcut, draf, dan permintaan akses edit untuk pengetahuanmu."
        actions={<><LinkButton href="/knowledge" variant="secondary" icon="search">Jelajahi</LinkButton>
          <LinkButton href="/knowledge/new" icon="plus">Tulis pengetahuan</LinkButton></>} />
      <div className="toolbar">
        <Segmented label="Bagian kelola pengetahuan" items={[
          { href: '/knowledge/manage', label: 'Entri saya', active: true, icon: 'book-open' },
          { href: '/knowledge/manage/requests', label: 'Permintaan & akses', active: false, icon: 'key' },
        ]} />
        <p className="muted" role="status">
          {counts.published ?? 0} terbit · {counts.draft ?? 0} draf · {counts.archived ?? 0} diarsipkan
        </p>
      </div>

      {pendingCount > 0 && (
        <Notice tone="warning" role="status">
          <span>{pendingCount} permintaan edit menunggu keputusanmu. </span>
          <Link href="/knowledge/manage/requests" className="link-btn">Tinjau permintaan</Link>
        </Notice>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="book-open" title="Belum ada entri"
          action={<LinkButton href="/knowledge/new" icon="plus">Tulis entri pertama</LinkButton>}>
          Tulis catatan, tautan, atau panduan. Draf hanya terlihat olehmu dan Ketua sampai diterbitkan.
        </EmptyState>
      ) : (
        <ul className="rows card card--flush">
          {rows.map((r) => {
            const tags = (r.knowledge_entry_tags ?? []).map((t) => t.tag).sort();
            return (
              <li key={r.id} className="row row--wrap">
                <div className="row__body">
                  <div className="cluster">
                    <KnowledgeStatusChip status={r.status} />
                    <KnowledgeVisibilityChip visibility={r.visibility} />
                    {r.edited_at && <span className="chip chip--warning">Diedit</span>}
                  </div>
                  <h2 className="kb-row__title">
                    <Link href={`/knowledge/${r.slug}`} className="row__title">{r.title}</Link>
                  </h2>
                  {r.tagline && <p className="muted clamp-2">{r.tagline}</p>}
                  <div className="meta">
                    {r.category && <span><Icon name={r.category === 'shortcut' ? 'keyboard' : 'book-open'} size={14} />{KB_CATEGORY_LABEL[knowledgeCategory(r.category)]}</span>}
                    <span><Icon name="clock" size={14} />Diperbarui {formatDay(r.updated_at, tz)}</span>
                  </div>
                  {tags.length > 0 && <KnowledgeTags tags={tags} />}
                </div>
                <div className="row__actions">
                  <LinkButton href={`/knowledge/${r.slug}/edit`} variant="secondary" size="sm" icon="pencil">
                    {r.status === 'draft' ? 'Lanjutkan' : 'Ubah'}
                  </LinkButton>
                  <LinkButton href={`/knowledge/${r.slug}`} variant="ghost" size="sm" icon="arrow-right">Buka</LinkButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
