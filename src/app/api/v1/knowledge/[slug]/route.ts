import { apiJson, dbFailure, ApiFailure } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = 'id,slug,title,tagline,content_md,category,status,visibility,version,published_at,edited_at,last_edited_by,author_id,created_at,updated_at';

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'knowledge', action: 'read' }, async ({ principal }) => {
    const { slug } = await params;
    const visible = `and(status.eq.published,visibility.in.(public,class_only)),author_id.eq.${principal.ownerId}`;
    const { data, error } = await principal.admin.from('knowledge_entries')
      .select(FIELDS).eq('class_id', principal.classId).eq('slug', slug).or(visible).maybeSingle();
    if (error) dbFailure(error);
    if (!data) throw new ApiFailure(404, 'not_found', 'Entri tidak ditemukan.');

    const { data: tagRows, error: tagError } = await principal.admin.from('knowledge_entry_tags')
      .select('tag').eq('entry_id', (data as { id: string }).id).order('tag');
    if (tagError) dbFailure(tagError);

    return apiJson({
      data: { ...data, tags: (tagRows ?? []).map((row) => (row as { tag: string }).tag) },
    });
  });
}
