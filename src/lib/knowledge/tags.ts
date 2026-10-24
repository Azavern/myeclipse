export const MAX_TAGS = 10;

// Hashtag dinormalisasi agar "UI/UX", "#ui ux", dan "ui-ux" tidak menjadi tiga tag.
export function normalizeTag(raw: string): string {
  return raw.toLowerCase().trim().replace(/^#+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

export function normalizeTags(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const tag = normalizeTag(item);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

export function parseTagsJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return normalizeTags(JSON.parse(raw)); } catch { return []; }
}
