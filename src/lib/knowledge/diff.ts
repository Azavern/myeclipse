import { parseMarkdown, type MarkdownBlock } from './markdown';

// Hanya anotasi blok yang berubah pada suntingan terakhir. Bukan arsip revisi:
// konten lama dibuang setelah perbandingan singkat ini.
export type KnowledgeHighlights = { blocks: number[]; at: string };

const normalize = (block: string) => block.replace(/\s+/g, ' ').trim();

// Kunci blok harus sama dengan unit yang dirender Markdown agar indeks sorotan
// menunjuk blok yang benar, termasuk blok kode dan daftar.
const keyOf = (b: MarkdownBlock): string => {
  if (b.kind === 'code') return `code:${b.lang}\n${b.code}`;
  if (b.kind === 'list') return `list:${b.ordered}:${b.items.join('\n')}`;
  if (b.kind === 'hr') return 'hr';
  if (b.kind === 'heading') return `heading:${b.level}:${b.text}`;
  return `${b.kind}:${b.text}`;
};

// LCS blok: blok baru yang tidak punya pasangan di versi lama dianggap berubah.
// Perubahan di dalam satu paragraf menyorot paragraf itu, bukan karakter.
export function computeHighlights(previous: string, next: string, at = new Date().toISOString()): KnowledgeHighlights | null {
  const before = parseMarkdown(previous).map((b) => normalize(keyOf(b)));
  const after = parseMarkdown(next).map((b) => normalize(keyOf(b)));
  if (before.length === after.length && before.every((b, i) => b === after[i])) return null;

  const rows = before.length;
  const cols = after.length;
  const dp = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    const row = dp[i];
    const below = dp[i + 1];
    if (!row || !below) continue;
    for (let j = cols - 1; j >= 0; j -= 1) {
      row[j] = before[i] === after[j] ? (below[j + 1] ?? 0) + 1 : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const changed: number[] = [];
  let i = 0;
  let j = 0;
  while (j < cols) {
    if (i < rows && before[i] === after[j]) { i += 1; j += 1; continue; }
    const skipBefore = i < rows && (dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0);
    if (skipBefore) i += 1;
    else { changed.push(j); j += 1; }
  }
  return { blocks: changed, at };
}

// Anotasi dari DB adalah data yang tidak dipercaya: batasi bentuk dan jumlahnya.
export function parseHighlights(raw: unknown): KnowledgeHighlights | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { blocks?: unknown; at?: unknown };
  if (!Array.isArray(value.blocks)) return null;
  const blocks = [...new Set(value.blocks.filter((b): b is number =>
    typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < 5000))].sort((a, b) => a - b);
  if (blocks.length === 0) return null;
  return { blocks, at: typeof value.at === 'string' ? value.at : '' };
}
