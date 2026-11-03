import { z } from 'zod';
import { apiJson, bodyOf, dbFailure, pageMeta, pagination, ApiFailure } from '@/lib/api/http';
import { httpsUrl } from '@/lib/api/fields';
import { readScope, requireSelfWrite, withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FIELDS = 'id,owner_id,url,created_at';
const createSchema = z.object({ url: httpsUrl }).strict();

export async function GET(request: Request) {
  return withApi(request, { resource: 'inventory', action: 'read' }, async ({ principal }) => {
    const url = new URL(request.url);
    const scope = readScope(principal, 'inventory');
    // Inventory bersifat pribadi: satu-satunya jalan membaca milik orang lain
    // adalah inv_key yang dibuat pemiliknya, bukan API key kelas.
    if (scope !== 'self') {
      throw new ApiFailure(403, 'scope', 'Inventory hanya dapat diakses dengan cakupan pemilik API key.');
    }
    const { limit, offset } = pagination(url);

    const { data, error, count } = await principal.admin.from('inventory_items')
      .select(FIELDS, { count: 'exact' }).eq('class_id', principal.classId)
      .eq('owner_id', principal.ownerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) dbFailure(error);
    return apiJson({ data: data ?? [], pagination: pageMeta(limit, offset, count) });
  });
}

export async function POST(request: Request) {
  return withApi(request, { resource: 'inventory', action: 'create' }, async ({ principal }) => {
    const ownerId = requireSelfWrite(principal, 'inventory');
    const input = await bodyOf(request, createSchema);
    const { data, error } = await principal.admin.from('inventory_items').insert({
      class_id: principal.classId, owner_id: ownerId, url: input.url,
    }).select(FIELDS).single();
    if (error) dbFailure(error);
    return apiJson({ data }, 201);
  });
}
