import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { EmptyState, LinkButton, PageHeader } from '@/components/ui/primitives';
import { KnowledgeCard, type KnowledgeCardRow } from '@/features/knowledge/components';
import { getClass } from '@/lib/class';
import { KB_CATEGORY_OPTIONS, isKnowledgeCategory } from '@/lib/knowledge/labels';
import { normalizeTag } from '@/lib/knowledge/tags';
import { createClient } from '@/lib/supabase/server';
import { getViewer, requireView } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Eclipse Knowledge' };

const PAGE_SIZE = 12;
const SORTS: [string, string][] = [
  ['newest', 'Terbaru'], ['updated', 'Baru diperbarui'],
  ['title_asc', 'Judul A–Z'], ['title_desc', 'Judul Z–A'],
];
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

function queryString(o: { q?: string; category?: string; tags?: string[]; sort?: string; page?: number }) {
  const p = new URLSearchParams();
  if (o.q) p.set('q', o.q);
  if (o.category) p.set('category', o.category);
  (o.tags ?? []).forEach((t) => p.append('tag', t));
  if (o.sort && o.sort !== 'newest') p.set('sort', o.sort);
  if (o.page && o.page > 1) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default async function KnowledgeExplorer({ searchParams }: { searchParams: Promise<SP> }) {
  if (!(await requireView('page.knowledge', '/knowledge'))) return <NoAccess />;
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const categoryInput = one(sp.category).trim().slice(0, 40);
  const category = isKnowledgeCategory(categoryInput) ? categoryInput : '';
  const sort = oneOf(one(sp.sort), SORTS.map(([s]) => s), 'newest');
  const tags = (Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : [])
    .map(normalizeTag).filter(Boolean).slice(0, 5);
  const rawPage = Number.parseInt(one(sp.page), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.min(rawPage, 500) : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const [cls, viewer, res, facets] = await Promise.all([
    getClass(),
    getViewer(),
    supabase.rpc('search_knowledge', {
      p_q: q || null, p_category: category || null, p_tags: tags,
      p_sort: sort, p_limit: PAGE_SIZE, p_offset: offset,
    }),
    supabase.rpc('get_knowledge_facets'),
  ]);
  const rows = (res.data ?? []) as (KnowledgeCardRow & { total: number })[];
  const total = rows[0]?.total ?? 0;
  if (page > 1 && rows.length === 0) {
    redirect(`/knowledge${queryString({ q, category, tags, sort })}`);
  }
  const facetRows = (facets.data ?? []) as { kind: string; value: string; entry_count: number }[];
  const categoryCounts = new Map(
    facetRows.filter((f) => f.kind === 'category').map((f) => [f.value, f.entry_count] as const),
  );
  const categories = KB_CATEGORY_OPTIONS.map(([value, label]) => ({
    value, label, entry_count: categoryCounts.get(value) ?? 0,
  }));
  const allTags = facetRows.filter((f) => f.kind === 'tag').slice(0, 24);
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = !!q || !!category || tags.length > 0;
  const canWrite = !!viewer.user && viewer.status === 'active';
  const href = (o: Parameters<typeof queryString>[0]) => `/knowledge${queryString(o)}`;

  const actions = (
    <>
      {canWrite && <LinkButton href="/knowledge/manage" variant="secondary" icon="settings">Entri saya</LinkButton>}
      {canWrite
        ? <LinkButton href="/knowledge/new" icon="plus">Tulis pengetahuan</LinkButton>
        : !viewer.user && <LinkButton href="/login?next=/knowledge/new" icon="log-in">Masuk untuk menulis</LinkButton>}
    </>
  );

  return (
    <>
      <PageHeader icon="book-open" title="Eclipse Knowledge" actions={actions}
        description="Artikel Markdown dan halaman shortcut yang dibagikan anggota kelas. Entri publik bisa dibaca tanpa masuk." />

      <form method="get" action="/knowledge" className="toolbar kb-search" role="search">
        <div className="search">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="kb-q">Cari pengetahuan</label>
          <input id="kb-q" type="search" name="q" defaultValue={q} maxLength={80}
            placeholder="Cari judul, isi, atau tag…" />
        </div>
        <div className="kb-search__filters">
          <label className="sr-only" htmlFor="kb-category-filter">Kategori</label>
          <select id="kb-category-filter" name="category" defaultValue={category}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.entry_count})</option>)}
          </select>
          <label className="sr-only" htmlFor="kb-sort">Urutkan</label>
          <select id="kb-sort" name="sort" defaultValue={sort}>
            {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {tags.map((t) => <input key={t} type="hidden" name="tag" value={t} />)}
          <button type="submit" className="btn btn--secondary"><Icon name="search" size={18} />Terapkan</button>
        </div>
      </form>

      {(categories.length > 0 || allTags.length > 0) && (
        <div className="kb-facets">
          {categories.length > 0 && (
            <div className="cluster">
              <span className="kb-facets__label">Kategori</span>
              {categories.map((c) => {
                const isOn = category === c.value;
                return (
                  <Link key={c.value} className="filter-chip" aria-current={isOn ? 'true' : undefined}
                    href={href({ q, category: isOn ? '' : c.value, tags, sort })}>
                    {c.label} <span className="nums">({c.entry_count})</span>
                  </Link>
                );
              })}
            </div>
          )}
          {allTags.length > 0 && (
            <div className="cluster">
              <span className="kb-facets__label">Hashtag</span>
              {allTags.map((t) => {
                const isOn = tags.includes(t.value);
                const next = isOn ? tags.filter((x) => x !== t.value) : [...tags, t.value];
                return (
                  <Link key={t.value} className="filter-chip" aria-current={isOn ? 'true' : undefined}
                    href={href({ q, category, tags: next, sort })}>#{t.value}</Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="toolbar kb-result-bar">
        <p className="muted" role="status">
          {total === 0 ? 'Tidak ada entri yang cocok' : `${total} entri${active ? ' cocok dengan filter' : ''}`}
        </p>
        {active && (
          <Link className="link-btn" href="/knowledge"><Icon name="x" size={16} />Hapus semua filter</Link>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="book-open" title={active ? 'Belum ada yang cocok' : 'Perpustakaan masih kosong'}
          action={canWrite ? <LinkButton href="/knowledge/new" icon="plus">Tulis entri pertama</LinkButton> : undefined}>
          {active
            ? 'Coba kata kunci lain, atau hapus sebagian filter.'
            : 'Bagikan artikel Markdown atau kumpulan shortcut yang berguna untuk kelas.'}
        </EmptyState>
      ) : (
        <ul className="kb-grid">
          {rows.map((row) => (
            <li key={row.id}><KnowledgeCard row={row} tz={tz} activeTags={tags} /></li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="kb-pager" aria-label="Halaman pengetahuan">
          {page > 1
            ? <LinkButton href={href({ q, category, tags, sort, page: page - 1 })} variant="secondary" size="sm" icon="chevron-left">Sebelumnya</LinkButton>
            : <span />}
          <span className="muted">Halaman {page} dari {pages}</span>
          {page < pages
            ? <LinkButton href={href({ q, category, tags, sort, page: page + 1 })} variant="secondary" size="sm">Berikutnya</LinkButton>
            : <span />}
        </nav>
      )}
    </>
  );
}
