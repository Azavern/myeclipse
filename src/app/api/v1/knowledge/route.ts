import { searchTerm } from '@/lib/api/fields';
import { apiJson, dbFailure, pageMeta, pagination } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = 'id,slug,title,tagline,category,status,visibility,version,published_at,edited_at,author_id,created_at,updated_at';

export async function GET(request: Request) {
  return withApi(request, { resource: 'knowledge', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const { limit, offset } = pagination(url);
    const q = searchTerm(url.searchParams.get('q'));

    // Aturan baca sama dengan app.knowledge_can_read untuk API key: entri
    // published yang public/class_only, ditambah semua entri milik pemilik key.
    const visible = `and(status.eq.published,visibility.in.(public,class_only)),author_id.eq.${principal.ownerId}`;
    let query = principal.admin.from('knowledge_entries')
      .select(FIELDS, { count: 'exact' }).eq('class_id', principal.classId).or(visible);
    if (q) query = query.or(`title.ilike.%${q}%,tagline.ilike.%${q}%,category.ilike.%${q}%`);

    const { data, error, count } = await query.order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    const rows = (data ?? []) as Record<string, unknown>[];

    const ids = rows.map((row) => String(row.id));
    const tags = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: tagRows, error: tagError } = await principal.admin.from('knowledge_entry_tags')
        .select('entry_id,tag').in('entry_id', ids);
      if (tagError) dbFailure(tagError);
      for (const row of tagRows ?? []) {
        const tag = row as { entry_id: string; tag: string };
        tags.set(tag.entry_id, [...(tags.get(tag.entry_id) ?? []), tag.tag]);
      }
    }

    return apiJson({
      data: rows.map((row) => ({ ...row, tags: tags.get(String(row.id)) ?? [] })),
      pagination: pageMeta(limit, offset, count),
    });
  });
}
