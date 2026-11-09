import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Chip } from '@/components/ui/primitives';
import { formatDay } from '@/lib/time';
import { KB_CATEGORY_LABEL, KB_STATUS_LABEL, KB_VISIBILITY_LABEL, knowledgeCategory } from '@/lib/knowledge/labels';

export type KnowledgeCardRow = {
  id: string; slug: string; title: string; tagline: string | null; category: string | null;
  author_id: string; author_name: string | null; tags: string[];
  published_at: string | null; updated_at: string; edited: boolean;
};

export function KnowledgeStatusChip({ status }: { status: string }) {
  const tone = status === 'published' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
  const icon = status === 'published' ? 'check-circle' : status === 'draft' ? 'pencil' : 'archive';
  return <Chip tone={tone} icon={icon}>{KB_STATUS_LABEL[status] ?? status}</Chip>;
}

export function KnowledgeVisibilityChip({ visibility }: { visibility: string }) {
  const tone = visibility === 'public' ? 'brand' : visibility === 'unlisted' ? 'accent'
    : visibility === 'class_only' ? 'neutral' : 'neutral';
  const icon = visibility === 'public' ? 'globe' : visibility === 'unlisted' ? 'link'
    : visibility === 'class_only' ? 'users' : 'lock';
  return <Chip tone={tone} icon={icon}>{KB_VISIBILITY_LABEL[visibility] ?? visibility}</Chip>;
}

export function KnowledgeTags({ tags, active = [] }: { tags: string[]; active?: string[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="cluster kb-tags-list" aria-label="Hashtag">
      {tags.map((tag) => (
        <li key={tag}>
          <Link className="chip chip--outline" href={`/knowledge?tag=${encodeURIComponent(tag)}`}
            aria-current={active.includes(tag) ? 'true' : undefined}>#{tag}</Link>
        </li>
      ))}
    </ul>
  );
}

export function KnowledgeCard({ row, tz, activeTags = [] }: { row: KnowledgeCardRow; tz: string; activeTags?: string[] }) {
  return (
    <article className="card kb-card">
      <div className="kb-card__top">
        {row.category && (
          <Chip tone="accent" icon={row.category === 'shortcut' ? 'keyboard' : 'book-open'}>
            {KB_CATEGORY_LABEL[knowledgeCategory(row.category)]}
          </Chip>
        )}
        {row.edited && <Chip tone="warning" icon="pencil">Diedit</Chip>}
      </div>
      <h2 className="kb-card__title"><Link href={`/knowledge/${row.slug}`} className="row__title stretch">{row.title}</Link></h2>
      {row.tagline && <p className="muted clamp-2">{row.tagline}</p>}
      {row.tags.length > 0 && <KnowledgeTags tags={row.tags} active={activeTags} />}
      <div className="meta kb-card__meta">
        <span><Icon name="user" size={14} />{row.author_name ?? 'Anggota kelas'}</span>
        <span><Icon name="clock" size={14} />Diperbarui {formatDay(row.updated_at, tz)}</span>
        {row.published_at && <span><Icon name="calendar" size={14} />Terbit {formatDay(row.published_at, tz)}</span>}
      </div>
    </article>
  );
}
