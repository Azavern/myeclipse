import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AUDIENCES, allowedFor } from '@/lib/visibility/audiences';
import { apiJson, bodyOf, dbFailure, ApiFailure } from '@/lib/api/http';
import { withApi } from '@/lib/api/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  rules: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    audience: z.enum([...AUDIENCES]).nullable(),
  })).min(1, 'Kirim minimal satu aturan.').max(60),
}).strict();

const RULE_FIELDS = 'key,audience,updated_at';

function readRules(admin: SupabaseClient, classId: string) {
  return admin.from('visibility_rules').select(RULE_FIELDS)
    .eq('class_id', classId).is('owner_id', null).order('key');
}

export async function GET(request: Request) {
  return withApi(request, { resource: 'visibility', action: 'read' }, async ({ principal }) => {
    const [catalog, rules] = await Promise.all([
      principal.admin.from('visibility_catalog')
        .select('key,kind,scope,widest_audience,default_audience').order('key'),
      readRules(principal.admin, principal.classId),
    ]);
    if (catalog.error) dbFailure(catalog.error);
    if (rules.error) dbFailure(rules.error);
    return apiJson({ data: { catalog: catalog.data ?? [], rules: rules.data ?? [] } });
  });
}

export async function PATCH(request: Request) {
  return withApi(request, { resource: 'visibility', action: 'update' }, async ({ principal }) => {
    const input = await bodyOf(request, patchSchema);
    const { data: catalog, error } = await principal.admin.from('visibility_catalog')
      .select('key,scope,widest_audience');
    if (error) dbFailure(error);
    const catalogMap = new Map((catalog ?? []).map((row) => {
      const item = row as { key: string; scope: string; widest_audience: string };
      return [item.key, item] as const;
    }));

    for (const rule of input.rules) {
      const item = catalogMap.get(rule.key);
      if (!item || item.scope !== 'class') {
        throw new ApiFailure(400, 'validation', `Kunci visibilitas tidak dikenal: ${rule.key}.`);
      }
      if (rule.audience !== null && !allowedFor(item.widest_audience).includes(rule.audience)) {
        throw new ApiFailure(400, 'validation', `Pilihan visibilitas terlalu luas untuk ${rule.key}.`);
      }
    }

    const { data: existing, error: existingError } = await principal.admin.from('visibility_rules')
      .select('id,key').eq('class_id', principal.classId).is('owner_id', null);
    if (existingError) dbFailure(existingError);
    const existingKeys = new Map((existing ?? []).map((row) => {
      const item = row as { id: string; key: string };
      return [item.key, item.id] as const;
    }));

    for (const rule of input.rules) {
      if (rule.audience === null) {
        const result = await principal.admin.from('visibility_rules').delete()
          .eq('class_id', principal.classId).eq('key', rule.key).is('owner_id', null);
        if (result.error) dbFailure(result.error);
        continue;
      }
      const id = existingKeys.get(rule.key);
      const result = id
        ? await principal.admin.from('visibility_rules').update({ audience: rule.audience }).eq('id', id)
        : await principal.admin.from('visibility_rules').insert({
          class_id: principal.classId, key: rule.key, owner_id: null, audience: rule.audience,
        });
      if (result.error) dbFailure(result.error);
    }

    const { data: rules, error: rulesError } = await readRules(principal.admin, principal.classId);
    if (rulesError) dbFailure(rulesError);
    return apiJson({ data: rules ?? [] });
  });
}
