import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/copy-button';
import { HighlightToggle } from '@/components/highlight-toggle';
import { Markdown, MarkdownToc } from '@/components/markdown';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Avatar, Chip, LinkButton, Notice, PageHeader } from '@/components/ui/primitives';
import {
  archiveKnowledge, changeKnowledgeVisibility, escalateRequest,
} from '@/features/knowledge/actions';
import {
  KnowledgeStatusChip, KnowledgeTags, KnowledgeVisibilityChip,
} from '@/features/knowledge/components';
import { ArchiveForm, EscalateForm, VisibilityForm } from '@/features/knowledge/forms';
import { parseHighlights } from '@/lib/knowledge/diff';
import { KB_REQUEST_LABEL, KB_STATUS_LABEL, KB_VISIBILITY_LABEL } from '@/lib/knowledge/labels';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatDay, formatWhen } from '@/lib/time';
import { getClass } from '@/lib/class';
import { getViewer, requireView } from '@/lib/visibility/server';

type Entry = {
  id: string; slug: string; title: string; tagline: string | null; content_md: string;
  category: string | null; status: string; visibility: string; highlights: unknown;
  version: number; published_at: string | null; edited_at: string | null; updated_at: string;
  author_id: string; knowledge_entry_tags: { tag: string }[] | null;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from('knowledge_entries')
    .select('title,tagline').eq('slug', slug).maybeSingle();
  const row = data as { title: string; tagline: string | null } | null;
  if (!row) return { title: 'Pengetahuan' };
  return { title: row.title, description: row.tagline ?? undefined, robots: { index: false, follow: false } };
}

export default async function KnowledgeEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await requireView('page.knowledge', `/knowledge/${slug}`))) return <NoAccess />;
  const supabase = await createClient();
  const [cls, viewer, res] = await Promise.all([
    getClass(),
    getViewer(),
    supabase.from('knowledge_entries')
      .select('id,slug,title,tagline,content_md,category,status,visibility,highlights,version,' +
        'published_at,edited_at,updated_at,author_id,knowledge_entry_tags(tag)')
      .eq('slug', slug).maybeSingle(),
  ]);
  const entry = res.data as Entry | null;
  if (res.error || !entry) notFound();

  const userId = viewer.user?.id ?? null;
  const isAuthor = !!userId && userId === entry.author_id;
  const isLeader = viewer.can('class.manage');
  const activeMember = viewer.status === 'active';
  const now = new Date();
  const [profileRes, editorRes, requestRes] = await Promise.all([
    supabase.from('member_profile_v').select('username,full_name,avatar_path').eq('user_id', entry.author_id).maybeSingle(),
    userId && !isAuthor ? supabase.from('knowledge_editors')
      .select('expires_at,revoked_at').eq('entry_id', entry.id).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
    userId && !isAuthor ? supabase.from('knowledge_edit_requests')
      .select('id,status').eq('entry_id', entry.id).eq('requester_id', userId)
      .in('status', ['pending_author', 'escalated']).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const profile = profileRes.data as { username: string; full_name: string; avatar_path: string | null } | null;
  const editor = editorRes.data as { expires_at: string | null; revoked_at: string | null } | null;
  const pending = requestRes.data as { id: string; status: string } | null;
  const isEditor = !!editor && !editor.revoked_at
    && (!editor.expires_at || new Date(editor.expires_at) > now);
  const canEdit = activeMember && (isAuthor || isEditor);
  const canRequest = activeMember && !isAuthor && !isEditor && !pending;
  const highlights = parseHighlights(entry.highlights)?.blocks ?? [];
  const tags = (entry.knowledge_entry_tags ?? []).map((t) => t.tag).sort();
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const avatar = profile?.avatar_path
    ? (await signMany(supabase, 'member-media', [profile.avatar_path])).get(profile.avatar_path)
    : undefined;

  const related = tags.length > 0
    ? ((await supabase.from('knowledge_entries')
      .select('id,slug,title,tagline,visibility,knowledge_entry_tags(tag)')
      .eq('status', 'published').in('visibility', ['public', 'class_only'])
      .neq('id', entry.id).order('updated_at', { ascending: false }).limit(30)).data ?? []) as
      { id: string; slug: string; title: string; tagline: string | null; knowledge_entry_tags: { tag: string }[] | null }[]
    : [];
  const relatedRows = related
    .filter((r) => (r.knowledge_entry_tags ?? []).some((t) => tags.includes(t.tag)))
    .slice(0, 3);

  const restricted = entry.status !== 'published' || entry.visibility !== 'public';
  const back = `/knowledge/${entry.slug}`;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Knowledge', href: '/knowledge' }, { label: entry.title }]}
        icon="book-open" title={entry.title}
        description={entry.tagline ?? undefined}
        actions={
          <>
            <CopyButton label="Salin tautan" />
            {canEdit && <LinkButton href={`/knowledge/${entry.slug}/edit`} icon="pencil" variant="secondary">Ubah</LinkButton>}
            {canRequest && <LinkButton href={`/knowledge/${entry.slug}/request-edit`} icon="key">Minta akses edit</LinkButton>}
          </>
        } />

      {restricted && (
        <div className="stack stack--sm kb-entry__notices">
          {entry.status === 'draft' && (
            <Notice tone="warning" role="status">Draf: hanya kamu, editor yang disetujui, dan Ketua yang dapat membuka entri ini.</Notice>
          )}
          {entry.status === 'archived' && (
            <Notice tone="info" role="status">Entri ini diarsipkan dan tidak muncul di penjelajah.</Notice>
          )}
          {entry.status === 'published' && entry.visibility === 'unlisted' && (
            <Notice tone="info" role="status">Tautan saja: entri ini tidak muncul di penjelajah, tetapi siapa pun yang punya tautan dapat membacanya.</Notice>
          )}
          {entry.status === 'published' && entry.visibility === 'class_only' && (
            <Notice tone="info" role="status">Entri ini hanya dapat dibaca anggota kelas yang aktif.</Notice>
          )}
          {entry.status === 'published' && entry.visibility === 'private' && (
            <Notice tone="info" role="status">Pribadi: hanya penulis, editor yang disetujui, dan Ketua yang dapat membuka entri ini.</Notice>
          )}
        </div>
      )}

      <div className="kb-entry">
        <article className="card kb-entry__main" aria-labelledby="kb-content-title">
          <h2 id="kb-content-title" className="sr-only">Isi entri</h2>
          <div className="kb-byline">
            {profile ? (
              <Link href={`/members/${profile.username}`} className="kb-byline__author">
                <Avatar name={profile.full_name} src={avatar} size="sm" />
                <span><strong>{profile.full_name}</strong><span className="muted">@{profile.username}</span></span>
              </Link>
            ) : (
              <span className="kb-byline__author"><Avatar name="Anggota" size="sm" /><span><strong>Anggota kelas</strong><span className="muted">Penulis</span></span></span>
            )}
            <div className="meta">
              {entry.published_at && <span><Icon name="calendar" size={14} />Terbit {formatDay(entry.published_at, tz)}</span>}
              <span><Icon name="clock" size={14} />Diperbarui {formatWhen(entry.updated_at, tz)}</span>
              {(isAuthor || isLeader) && <KnowledgeStatusChip status={entry.status} />}
              {(isAuthor || isLeader) && <KnowledgeVisibilityChip visibility={entry.visibility} />}
              {entry.edited_at && <Chip tone="warning" icon="pencil">Diedit</Chip>}
            </div>
          </div>

          {(entry.category || tags.length > 0) && (
            <div className="cluster kb-entry__taxonomy">
              {entry.category && <Chip tone="accent" icon="folder">{entry.category}</Chip>}
              <KnowledgeTags tags={tags} />
            </div>
          )}

          <HighlightToggle count={highlights.length}>
            <Markdown source={entry.content_md} highlights={highlights} />
          </HighlightToggle>
        </article>

        <aside className="stack kb-entry__aside">
          <MarkdownToc source={entry.content_md} />

          {(pending || isEditor) && (
            <section className="card" aria-labelledby="kb-access-title">
              <h2 id="kb-access-title" className="card__title"><Icon name="key" size={20} />Akses edit</h2>
              {isEditor && (
                <p className="muted">Kamu punya akses edit dari penulis{editor?.expires_at ? ` sampai ${formatDay(editor.expires_at, tz)}` : ''}. Akses ini bisa dicabut penulis atau Ketua.</p>
              )}
              {pending && (
                <div className="stack stack--sm">
                  <p className="muted">Permintaanmu: <strong>{KB_REQUEST_LABEL[pending.status] ?? pending.status}</strong>.</p>
                  {pending.status === 'pending_author' && (
                    <EscalateForm action={escalateRequest} requestId={pending.id} />
                  )}
                </div>
              )}
            </section>
          )}

          {(isAuthor || isLeader) && (
            <section className="card" aria-labelledby="kb-visibility-title">
              <div className="card__head">
                <h2 id="kb-visibility-title" className="card__title"><Icon name="eye" size={20} />Visibilitas</h2>
              </div>
              <p className="muted kb-entry__hint">
                {isLeader && !isAuthor
                  ? 'Sebagai Ketua kamu dapat menyembunyikan entri tanpa otomatis mendapat hak menulis isinya.'
                  : `Saat ini ${KB_VISIBILITY_LABEL[entry.visibility] ?? entry.visibility}.${entry.status === 'draft' ? ' Draf tetap hanya terlihat oleh pihak berwenang sampai diterbitkan.' : ''}`}
              </p>
              <VisibilityForm action={changeKnowledgeVisibility} entryId={entry.id}
                current={entry.visibility} back={back} allowReason={isLeader} />
            </section>
          )}

          {canEdit && (
            <section className="card" aria-labelledby="kb-edit-title">
              <h2 id="kb-edit-title" className="card__title"><Icon name="pencil" size={20} />Kelola entri</h2>
              <p className="muted">Status saat ini: {KB_STATUS_LABEL[entry.status] ?? entry.status}.</p>
              <div className="cluster">
                <LinkButton href={`/knowledge/${entry.slug}/edit`} variant="secondary" icon="pencil">Ubah isi</LinkButton>
                {isAuthor && entry.status !== 'archived' && (
                  <ArchiveForm action={archiveKnowledge} entryId={entry.id} />
                )}
              </div>
            </section>
          )}

          {relatedRows.length > 0 && (
            <nav className="card" aria-labelledby="kb-related-title">
              <h2 id="kb-related-title" className="card__title"><Icon name="link" size={20} />Terkait</h2>
              <ul className="aside-list">
                {relatedRows.map((r) => (
                  <li key={r.id}>
                    <Icon name="book-open" size={16} />
                    <span>
                      <Link href={`/knowledge/${r.slug}`}>{r.title}</Link>
                      {r.tagline && <span className="kb-related__desc">{r.tagline}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
      </div>
    </>
  );
}
