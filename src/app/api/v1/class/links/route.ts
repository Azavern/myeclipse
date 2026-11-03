import { apiJson, bodyOf, dbFailure } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';
import { CLASS_LINK_FIELDS, classLinkSchema } from '@/lib/api/class-links';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: 'class_links', action: 'read' }, async ({ principal }) => {
    const { data, error } = await principal.admin.from('class_links').select(CLASS_LINK_FIELDS)
      .eq('class_id', principal.classId).order('created_at').limit(100);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [] });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'class_links', action: 'create' }, async ({ principal }) => {
    const input = await bodyOf(request, classLinkSchema);
    const { data, error } = await principal.admin.from('class_links').insert({
      class_id: principal.classId,
      platform: input.platform,
      label: input.label ?? null,
      url: input.url,
    }).select(CLASS_LINK_FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
