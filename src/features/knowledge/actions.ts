'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, dbMessage, failState, formValues, invalid, type FormState } from '@/lib/form-state';
import { computeHighlights } from '@/lib/knowledge/diff';
import { shortcutCardsFromUnknown, validateShortcutCards, type ShortcutCard } from '@/lib/knowledge/shortcuts';
import { parseTagsJson } from '@/lib/knowledge/tags';
import { safeRedirect } from '@/lib/safe-redirect';
import { optText, reqText } from '@/lib/zod-fields';

const visibility = z.enum(['public', 'unlisted', 'class_only', 'private']);
const entrySchema = z.object({
  title: reqText(50, 'Judul'),
  tagline: optText(150),
  content: z.string().max(50000, 'Maksimal 50.000 karakter.').optional().default(''),
  category: z.enum(['knowledge', 'shortcut']),
  shortcuts: z.string().max(60000).optional(),
  tags: z.string().max(1000).optional(),
  visibility,
  intent: z.enum(['draft', 'publish']).optional(),
  id: z.string().optional(),
  version: z.string().optional(),
});

const uuid = z.string().uuid();
const backPath = (fd: FormData) => {
  const raw = String(fd.get('back') ?? '');
  const safe = safeRedirect(raw);
  return safe.startsWith('/knowledge') ? safe : '/knowledge';
};

function paths(slug?: string | null) {
  ['/knowledge', '/knowledge/manage', '/knowledge/manage/requests'].forEach((p) => revalidatePath(p));
  if (slug) revalidatePath(`/knowledge/${slug}`);
}

export async function saveKnowledge(_p: FormState, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd);
  const allIntents = fd.getAll('intent');
  raw.intent = String(allIntents[allIntents.length - 1] ?? 'publish');
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error, fd);
  const d = parsed.data;
  let shortcuts: ShortcutCard[] = [];
  if (d.category === 'shortcut') {
    try {
      shortcuts = shortcutCardsFromUnknown(JSON.parse(d.shortcuts ?? '[]'));
    } catch {
      return { error: 'Kartu shortcut tidak valid.', fieldErrors: { shortcuts: ['Kartu shortcut tidak valid.'] }, values: formValues(fd) };
    }
    const shortcutError = validateShortcutCards(shortcuts);
    if (shortcutError) {
      return { error: shortcutError, fieldErrors: { shortcuts: [shortcutError] }, values: formValues(fd) };
    }
  }
  if (d.category === 'knowledge' && d.content.trim().length === 0) {
    return { error: 'Isi entri wajib diisi.', fieldErrors: { content: ['Isi entri wajib diisi.'] }, values: formValues(fd) };
  }
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const tags = parseTagsJson(d.tags);
  const status = d.intent === 'draft' ? 'draft' : 'published';
  const content = d.category === 'shortcut' ? '' : d.content;
  const payloadShortcuts = d.category === 'shortcut' ? shortcuts : [];

  if (!d.id) {
    const { data, error } = await ctx.supabase.rpc('create_knowledge_entry', {
      p_title: d.title, p_tagline: d.tagline, p_content: content, p_category: d.category,
      p_status: status, p_visibility: d.visibility, p_tags: tags, p_shortcuts: payloadShortcuts,
    });
    if (error) { console.error('knowledge', 'create', error.code); return failState(dbMessage(error), fd); }
    const row = ((data ?? []) as { id: string; slug: string }[])[0];
    if (!row) return failState('Entri gagal disimpan.', fd);
    paths(row.slug);
    redirect(status === 'published'
      ? withFlash(`/knowledge/${row.slug}`, 'created')
      : withFlash('/knowledge/manage', 'draft'));
  }

  if (!uuid.safeParse(d.id).success) return failState('Data tidak ditemukan.', fd);
  const version = Number(d.version);
  if (!Number.isInteger(version) || version < 1) return failState('Data tidak ditemukan.', fd);
  const { data: old, error: readError } = await ctx.supabase.from('knowledge_entries')
    .select('content_md,status,author_id,slug,version').eq('id', d.id).maybeSingle();
  const row = old as { content_md: string; status: string; author_id: string; slug: string; version: number } | null;
  if (readError || !row) return failState('Data tidak ditemukan.', fd);
  if (row.version !== version) return failState('Entri ini sudah diubah di tempat lain. Muat ulang halaman sebelum menyimpan.', fd);

  const highlights = d.category === 'knowledge' ? computeHighlights(row.content_md, content) : null;
  const { error } = await ctx.supabase.rpc('update_knowledge_entry', {
    p_id: d.id, p_version: version, p_title: d.title, p_tagline: d.tagline,
    p_content: content, p_category: d.category, p_status: status,
    p_tags: tags, p_highlights: highlights, p_shortcuts: payloadShortcuts,
  });
  if (error) { console.error('knowledge', 'update', error.code); return failState(dbMessage(error), fd); }
  paths(row.slug);
  redirect(status === 'published'
    ? withFlash(`/knowledge/${row.slug}`, 'saved')
    : withFlash('/knowledge/manage', 'draft'));
}

export async function archiveKnowledge(_p: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return failState('Data tidak ditemukan.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { data, error: readError } = await ctx.supabase.from('knowledge_entries')
    .select('title,tagline,content_md,category,status,version,slug,author_id,knowledge_entry_tags(tag)')
    .eq('id', id.data).maybeSingle();
  const row = data as {
    title: string; tagline: string | null; content_md: string; category: string | null;
    status: string; version: number; slug: string; author_id: string;
    knowledge_entry_tags: { tag: string }[] | null;
  } | null;
  if (readError || !row) return failState('Data tidak ditemukan.', fd);
  if (row.author_id !== ctx.user.id) return failState(FORBIDDEN, fd);
  if (row.status === 'archived') return failState('Entri ini sudah diarsipkan.', fd);
  const { error } = await ctx.supabase.rpc('update_knowledge_entry', {
    p_id: id.data, p_version: row.version, p_title: row.title, p_tagline: row.tagline,
    p_content: row.content_md, p_category: row.category, p_status: 'archived',
    p_tags: (row.knowledge_entry_tags ?? []).map((t) => t.tag), p_highlights: null,
  });
  if (error) { console.error('knowledge', 'archive', error.code); return failState(dbMessage(error), fd); }
  paths(row.slug);
  redirect(withFlash(`/knowledge/${row.slug}`, 'saved'));
}

export async function deleteKnowledge(_p: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) return failState('Data tidak ditemukan.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { data, error } = await ctx.supabase.from('knowledge_entries').delete()
    .eq('id', id.data).eq('author_id', ctx.user.id).select('id');
  if (error) { console.error('knowledge', 'delete', error.code); return failState(dbMessage(error), fd); }
  if (!data?.length) return failState('Data tidak ditemukan.', fd);
  paths();
  redirect(withFlash('/knowledge/manage', 'deleted'));
}

export async function changeKnowledgeVisibility(_p: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get('id'));
  const audience = visibility.safeParse(fd.get('visibility'));
  const reason = z.string().max(300).optional().safeParse(fd.get('reason') ?? undefined);
  if (!id.success || !audience.success || !reason.success) return failState('Pilihan visibilitas tidak valid.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('set_knowledge_visibility', {
    p_id: id.data, p_visibility: audience.data, p_reason: reason.data || null,
  });
  if (error) { console.error('knowledge', 'visibility', error.code); return failState(dbMessage(error), fd); }
  paths();
  const back = backPath(fd);
  revalidatePath(back.split('?')[0] ?? back);
  redirect(withFlash(back, 'saved'));
}

export async function requestEdit(_p: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get('id'));
  const reason = z.string().trim().min(5, 'Tulis alasan minimal 5 karakter.').max(500, 'Maksimal 500 karakter.')
    .safeParse(fd.get('reason'));
  if (!id.success) return failState('Data tidak ditemukan.', fd);
  if (!reason.success) return invalid(reason.error, fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { data } = await ctx.supabase.from('knowledge_entries').select('slug').eq('id', id.data).maybeSingle();
  const slug = (data as { slug: string } | null)?.slug;
  if (!slug) return failState('Data tidak ditemukan.', fd);
  const { error } = await ctx.supabase.rpc('request_knowledge_edit', { p_id: id.data, p_reason: reason.data });
  if (error) { console.error('knowledge', 'request', error.code); return failState(dbMessage(error), fd); }
  paths(slug);
  redirect(withFlash(`/knowledge/${slug}`, 'requested'));
}

export async function escalateRequest(_p: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get('id'));
  const reason = z.string().trim().min(5, 'Tulis alasan minimal 5 karakter.').max(500, 'Maksimal 500 karakter.')
    .safeParse(fd.get('reason'));
  if (!id.success) return failState('Data tidak ditemukan.', fd);
  if (!reason.success) return invalid(reason.error, fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('escalate_knowledge_request', { p_request: id.data, p_reason: reason.data });
  if (error) { console.error('knowledge', 'escalate', error.code); return failState(dbMessage(error), fd); }
  paths();
  redirect(withFlash('/knowledge/manage/requests', 'escalated'));
}

export async function decideRequest(_p: FormState, fd: FormData): Promise<FormState> {
  const id = uuid.safeParse(fd.get('id'));
  const decision = z.enum(['approve', 'reject']).safeParse(fd.get('decision'));
  if (!id.success || !decision.success) return failState('Data tidak ditemukan.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const approve = decision.data === 'approve';
  const { error } = await ctx.supabase.rpc('decide_knowledge_request', { p_request: id.data, p_approve: approve });
  if (error) { console.error('knowledge', 'decide', error.code); return failState(dbMessage(error), fd); }
  paths();
  redirect(withFlash('/knowledge/manage/requests', approve ? 'approved' : 'rejected'));
}

export async function revokeEditor(_p: FormState, fd: FormData): Promise<FormState> {
  const entry = uuid.safeParse(fd.get('entry'));
  const user = uuid.safeParse(fd.get('user'));
  if (!entry.success || !user.success) return failState('Data tidak ditemukan.', fd);
  const ctx = await requireActionContext();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('revoke_knowledge_editor', { p_entry: entry.data, p_user: user.data });
  if (error) { console.error('knowledge', 'revoke', error.code); return failState(dbMessage(error), fd); }
  paths();
  redirect(withFlash('/knowledge/manage/requests', 'revoked'));
}
