import { withApi } from '@/lib/api/server';
import { apiJson } from '@/lib/api/http';
import { API_RATE_LIMIT_PER_MINUTE } from '@/lib/api/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withApi(request, { resource: null, action: 'read' }, async ({ principal }) => apiJson({
    key: { name: principal.keyName, class_id: principal.classId, owner_id: principal.ownerId },
    permissions: principal.permissions,
    scope: principal.scope,
    member_ids: principal.memberIds,
    timezone: principal.timezone,
    rate_limit_per_minute: API_RATE_LIMIT_PER_MINUTE,
  }));
}
