import { dbFailure, ApiFailure } from '@/lib/api/http';
import { requireSelfWrite, withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  return withApi(request, { resource: 'inventory', action: 'delete' }, async ({ principal }) => {
    const { id } = await params;
    const ownerId = requireSelfWrite(principal, 'inventory');
    const { data, error } = await principal.admin.from('inventory_items')
      .delete().eq('id', id).eq('class_id', principal.classId).eq('owner_id', ownerId).select('id');
    if (error) dbFailure(error);
    if (!data?.length) throw new ApiFailure(404, 'not_found', 'Item inventory tidak ditemukan.');
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  });
}
