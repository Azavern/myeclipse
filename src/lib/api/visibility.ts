import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// API key tidak punya auth.uid(), jadi app.can_view tidak bisa dipakai langsung.
// Evaluator ini meniru app.own_audience + app.effective_audience (migration 0003)
// untuk audiens `self`: satu-satunya tingkat yang tidak boleh dibaca pengelola.
// Tingkat lain (public/authenticated/class_member/class_admin) memang terlihat
// oleh pemilik key yang memegang class.manage.

const ORDER = ['public', 'authenticated', 'class_member', 'class_admin', 'self'] as const;
type Audience = (typeof ORDER)[number];

type CatalogRow = {
  key: string;
  parent_key: string | null;
  default_audience: string | null;
  widest_audience: string;
  kind: string;
  scope: string;
};

export type VisibilityContext = {
  catalog: Map<string, CatalogRow>;
  classRules: Map<string, string>;
  ownerRules: Map<string, string>;
};

const rank = (value: string) => {
  const index = ORDER.indexOf(value as Audience);
  return index < 0 ? ORDER.length - 1 : index;
};
const greatest = (a: string, b: string) => (rank(a) >= rank(b) ? a : b);

export async function visibilityContext(admin: SupabaseClient, classId: string): Promise<VisibilityContext> {
  const [catalogResult, rulesResult] = await Promise.all([
    admin.from('visibility_catalog')
      .select('key,parent_key,default_audience,widest_audience,kind,scope'),
    admin.from('visibility_rules').select('key,owner_id,audience').eq('class_id', classId),
  ]);
  if (catalogResult.error) throw new Error('visibility catalog');
  if (rulesResult.error) throw new Error('visibility rules');

  const catalog = new Map<string, CatalogRow>();
  for (const row of catalogResult.data ?? []) {
    const item = row as CatalogRow;
    catalog.set(item.key, item);
  }
  const classRules = new Map<string, string>();
  const ownerRules = new Map<string, string>();
  for (const row of rulesResult.data ?? []) {
    const rule = row as { key: string; owner_id: string | null; audience: string };
    if (rule.owner_id) ownerRules.set(`${rule.key}\u0000${rule.owner_id}`, rule.audience);
    else classRules.set(rule.key, rule.audience);
  }
  return { catalog, classRules, ownerRules };
}

function ownAudience(
  ctx: VisibilityContext, key: string, ownerId: string | null, item: string | null,
): string {
  if (item) return item;
  let current: string | null = key;
  let depth = 0;
  while (current && depth < 6) {
    const catalog = ctx.catalog.get(current);
    if (!catalog) break;
    if (catalog.scope === 'member' && ownerId) {
      const ownerRule = ctx.ownerRules.get(`${current}\u0000${ownerId}`);
      if (ownerRule) return ownerRule;
    }
    const classRule = ctx.classRules.get(current);
    if (classRule) return classRule;
    if (catalog.default_audience) return catalog.default_audience;
    current = catalog.parent_key;
    depth += 1;
  }
  return 'class_admin';
}

export function effectiveAudience(
  ctx: VisibilityContext, key: string, ownerId: string | null, item: string | null = null,
): string {
  const catalog = ctx.catalog.get(key);
  if (!catalog) return 'class_admin';
  let own = greatest(ownAudience(ctx, key, ownerId, item), catalog.widest_audience);
  let current = catalog.parent_key;
  let depth = 0;
  while (current && depth < 6) {
    const ancestor = ctx.catalog.get(current);
    if (!ancestor) break;
    if (ancestor.kind === 'page') {
      own = greatest(own, greatest(ownAudience(ctx, ancestor.key, null, null), ancestor.widest_audience));
      break;
    }
    current = ancestor.parent_key;
    depth += 1;
  }
  return own;
}

// Pemilik key adalah Ketua (class.manage). Ia boleh melihat semua audiens kecuali
// `self` milik anggota lain. Baris miliknya sendiri tetap boleh.
export function canViewAsAdmin(
  ctx: VisibilityContext, key: string, rowOwnerId: string,
  itemVisibility: string | null, viewerId: string,
): boolean {
  const audience = effectiveAudience(ctx, key, rowOwnerId, itemVisibility);
  return audience !== 'self' || rowOwnerId === viewerId;
}
