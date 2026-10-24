// Parser Markdown kecil dan aman untuk Eclipse Knowledge. Tidak mendukung HTML
// mentah sama sekali: keluaran selalu React element dari token di bawah, sehingga
// tidak ada jalur innerHTML. Hanya tautan https yang menjadi tautan.

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'hr' };

export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; v: InlineToken[] }
  | { t: 'em'; v: InlineToken[] }
  | { t: 'del'; v: InlineToken[] }
  | { t: 'link'; v: InlineToken[]; href: string };

// https saja, tanpa kredensial, host bertitik — sama dengan optUrl di formulir.
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.')) return u.toString();
  } catch { /* bukan URL */ }
  return null;
}

const BARE_URL = /https:\/\/[^\s<>{}[\]]+/i;

function trimUrlPunctuation(url: string) {
  let u = url;
  while (/[.,;:!?]$/.test(u)) u = u.slice(0, -1);
  // Tutup kurung hanya dibuang bila jumlahnya tidak seimbang (URL berisi kurung).
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
  return u;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

export function parseInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  const pushText = (v: string) => { if (v) out.push({ t: 'text', v }); };
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    pushText(text.slice(last, start));
    last = start + m[0].length;
    const raw = m[0];
    if (m[1]) out.push({ t: 'code', v: raw.slice(1, -1) });
    else if (m[2] || m[3]) out.push({ t: 'strong', v: parseInline(raw.slice(2, -2)) });
    else if (m[4]) out.push({ t: 'del', v: parseInline(raw.slice(2, -2)) });
    else if (m[5]) {
      const label = raw.slice(1, raw.indexOf(']('));
      const href = safeHref(raw.slice(raw.indexOf('](') + 2, -1));
      if (href) out.push({ t: 'link', v: parseInline(label), href });
      else pushText(raw);
    } else if (m[6] || m[7]) out.push({ t: 'em', v: parseInline(raw.slice(1, -1)) });
  }
  // URL telanjang di sisa teks tetap dapat diklik.
  let rest = text.slice(last);
  while (rest) {
    const found = rest.match(BARE_URL);
    if (!found || found.index === undefined) { pushText(rest); break; }
    pushText(rest.slice(0, found.index));
    const rawUrl = trimUrlPunctuation(found[0]);
    const href = safeHref(rawUrl);
    if (href) out.push({ t: 'link', v: [{ t: 'text', v: rawUrl }], href });
    else pushText(rawUrl);
    rest = rest.slice(found.index + rawUrl.length);
  }
  return out;
}

// Blok dipisah baris kosong, tetapi pagar kode (```) tetap satu blok.
export function splitRawBlocks(src: string): string[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let cur: string[] = [];
  let fence = false;
  const flush = () => { if (cur.length) { blocks.push(cur.join('\n')); cur = []; } };
  for (const line of lines) {
    const isFence = line.trimStart().startsWith('```');
    if (isFence) {
      if (fence) { cur.push(line); flush(); fence = false; }
      else { flush(); cur.push(line); fence = true; }
      continue;
    }
    if (fence) { cur.push(line); continue; }
    if (line.trim() === '') flush();
    else cur.push(line);
  }
  flush();
  return blocks;
}

const headingSlug = (text: string) =>
  text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bagian';

const LIST_ITEM = /^(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdown(src: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const used = new Map<string, number>();
  const addHeading = (level: 2 | 3 | 4, text: string) => {
    const base = headingSlug(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    blocks.push({ kind: 'heading', level, text, id: seen === 0 ? base : `${base}-${seen + 1}` });
  };
  const addParagraph = (text: string) => {
    const t = text.trim();
    if (t) blocks.push({ kind: 'paragraph', text: t });
  };

  for (const raw of splitRawBlocks(src)) {
    const lines = raw.split('\n');
    const first = lines[0] ?? '';

    if (first.trimStart().startsWith('```')) {
      const lang = first.trim().slice(3).trim();
      const body = lines.slice(1);
      if (body.length && (body[body.length - 1] ?? '').trim() === '```') body.pop();
      blocks.push({ kind: 'code', lang, code: body.join('\n') });
      continue;
    }

    const heading = first.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(4, Math.max(2, (heading[1] ?? '#').length)) as 2 | 3 | 4;
      addHeading(level, (heading[2] ?? '').trim());
      const rest = lines.slice(1).join('\n');
      if (rest.trim()) addParagraph(rest);
      continue;
    }

    if (lines.length === 1 && /^(?:-{3,}|\*{3,}|_{3,})$/.test(first.trim())) {
      blocks.push({ kind: 'hr' });
      continue;
    }

    const nonEmpty = lines.filter((l) => l.trim() !== '');
    if (nonEmpty.length > 0 && nonEmpty.every((l) => /^>\s?/.test(l))) {
      blocks.push({ kind: 'quote', text: nonEmpty.map((l) => l.replace(/^>\s?/, '')).join(' ') });
      continue;
    }

    const listItems = nonEmpty.map((l) => l.match(LIST_ITEM));
    if (listItems.every((m) => m !== null)) {
      const ordered = listItems[0]?.[2] !== undefined;
      blocks.push({
        kind: 'list',
        ordered,
        items: listItems.map((m) => (m?.[3] ?? '').trim()).filter(Boolean),
      });
      continue;
    }

    addParagraph(lines.join(' '));
  }
  return blocks;
}

export function tocOf(blocks: MarkdownBlock[]) {
  return blocks.flatMap((b) => (b.kind === 'heading' ? [{ id: b.id, text: b.text, level: b.level }] : []));
}
