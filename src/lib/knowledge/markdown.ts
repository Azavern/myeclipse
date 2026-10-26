// Parser Markdown kecil dan aman untuk Eclipse Knowledge. Tidak mendukung HTML
// mentah sama sekali: keluaran selalu React element dari token di bawah, sehingga
// tidak ada jalur innerHTML. Hanya tautan dan gambar https yang diterima.

export type TableAlign = 'left' | 'center' | 'right';

export type ListItem = {
  text: string;
  /** null = bukan item checklist. */
  checked: boolean | null;
  /** Biasanya daftar bertingkat. */
  children: MarkdownBlock[];
};

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3 | 4 | 5 | 6; text: string; id: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: ListItem[] }
  | { kind: 'quote'; blocks: MarkdownBlock[] }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'table'; header: string[]; align: TableAlign[]; rows: string[][] }
  | { kind: 'hr' };

export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'strong'; v: InlineToken[] }
  | { t: 'em'; v: InlineToken[] }
  | { t: 'del'; v: InlineToken[] }
  | { t: 'link'; v: InlineToken[]; href: string; title?: string }
  | { t: 'image'; alt: string; src: string; title?: string };

// https saja, tanpa kredensial, host bertitik — sama dengan optUrl di formulir.
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.')) return u.toString();
  } catch { /* bukan URL */ }
  return null;
}

// Gambar dimuat otomatis oleh browser pembaca, jadi alamat lokal/IP literal
// ditolak agar entri tidak bisa memindai jaringan pembaca lewat <img>.
export function safeImageSrc(raw: string): string | null {
  const href = safeHref(raw);
  if (!href) return null;
  const host = new URL(href).hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return null;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return null;
  return href;
}

// Escape Markdown: karakter setelah garis miring tidak boleh ikut ditafsirkan.
// Karakter yang di-escape diganti penanda privat (U+E000 + kode ASCII) agar tidak
// tertangkap regex inline; teks keluaran mengembalikannya menjadi karakter asli.
const ESC_BASE = 0xe000;
const ESCAPABLE = '\\\\`*_{}\\[\\]()#+\\-.!|>~';

export function protectEscapes(text: string): string {
  return text.replace(new RegExp(`\\\\([${ESCAPABLE}])`, 'g'), (_m, ch: string) =>
    String.fromCharCode(ESC_BASE + ch.charCodeAt(0)));
}

export function unescapeMarkdown(text: string): string {
  return text.replace(/[\uE000-\uE0FF]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - ESC_BASE));
}

const BARE_URL = /https:\/\/[^\s<>{}[\]]+/i;

function trimUrlPunctuation(url: string) {
  let u = url;
  while (/[.,;:!?]$/.test(u)) u = u.slice(0, -1);
  // Tutup kurung hanya dibuang bila jumlahnya tidak seimbang (URL berisi kurung).
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
  return u;
}

// Urutan alternatif penting: *** sebelum **, gambar sebelum tautan.
const INLINE = new RegExp(
  [
    '(?<code>`[^`\\n]+`)',
    '(?<image>!\\[[^\\]\\n]*\\]\\(\\S+?(?:\\s+"[^"\\n]*")?\\))',
    '(?<bolditalic>\\*\\*\\*[^*\\n]+\\*\\*\\*)',
    '(?<bolditalic2>___[^_\\n]+___)',
    '(?<bold>\\*\\*[^*\\n]+\\*\\*)',
    '(?<bold2>__[^_\\n]+__)',
    '(?<strike>~~[^~\\n]+~~)',
    '(?<link>\\[[^\\]\\n]*\\]\\(\\S+?(?:\\s+"[^"\\n]*")?\\))',
    '(?<em>\\*[^*\\n]+\\*)',
    '(?<em2>_[^_\\n]+_)',
  ].join('|'),
  'g',
);

// Isi tanda kurung: URL lalu judul opsional dalam tanda kutip.
function parseTarget(raw: string, image = false): { href: string; title?: string } | null {
  const m = /^\((\S+?)(?:\s+"([^"\n]*)")?\)$/.exec(raw);
  if (!m) return null;
  const href = (image ? safeImageSrc(m[1] ?? '') : safeHref(m[1] ?? ''));
  if (!href) return null;
  return m[2] === undefined ? { href } : { href, title: unescapeMarkdown(m[2]) };
}

export function parseInline(source: string): InlineToken[] {
  const text = protectEscapes(source);
  const out: InlineToken[] = [];
  let last = 0;
  const pushText = (v: string) => { if (v) out.push({ t: 'text', v: unescapeMarkdown(v) }); };
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    pushText(text.slice(last, start));
    last = start + m[0].length;
    const raw = m[0];
    const g = m.groups ?? {};
    if (g.code) {
      out.push({ t: 'code', v: unescapeMarkdown(raw.slice(1, -1)) });
    } else if (g.image) {
      const labelEnd = raw.indexOf('](');
      const target = parseTarget(raw.slice(labelEnd + 1), true);
      if (target) {
        out.push({
          t: 'image',
          alt: unescapeMarkdown(raw.slice(2, labelEnd)),
          src: target.href,
          ...(target.title !== undefined ? { title: target.title } : {}),
        });
      } else pushText(raw);
    } else if (g.bolditalic || g.bolditalic2) {
      out.push({ t: 'strong', v: [{ t: 'em', v: parseInline(raw.slice(3, -3)) }] });
    } else if (g.bold || g.bold2) {
      out.push({ t: 'strong', v: parseInline(raw.slice(2, -2)) });
    } else if (g.strike) {
      out.push({ t: 'del', v: parseInline(raw.slice(2, -2)) });
    } else if (g.link) {
      const labelEnd = raw.indexOf('](');
      const target = parseTarget(raw.slice(labelEnd + 1));
      if (target) {
        out.push({
          t: 'link',
          v: parseInline(raw.slice(1, labelEnd)),
          href: target.href,
          ...(target.title !== undefined ? { title: target.title } : {}),
        });
      } else pushText(raw);
    } else if (g.em || g.em2) {
      out.push({ t: 'em', v: parseInline(raw.slice(1, -1)) });
    }
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
  unescapeMarkdown(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'bagian';

const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const HEADING_MARK = /^(#{1,6})\s+(.+)$/;

type ListBlock = Extract<MarkdownBlock, { kind: 'list' }>;

// Daftar bertingkat dibangun dari indentasi: 2 spasi per tingkat (tab = 2 spasi).
function parseList(lines: string[]): ListBlock | null {
  let root: ListBlock | null = null;
  const stack: { indent: number; list: ListBlock }[] = [];
  for (const line of lines) {
    const m = LIST_ITEM.exec(line);
    if (!m) return null;
    const indent = (m[1] ?? '').replace(/\t/g, '  ').length;
    const ordered = m[2] === undefined;
    let text = (m[4] ?? '').trim();
    let checked: boolean | null = null;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (task) {
      checked = (task[1] ?? ' ').toLowerCase() === 'x';
      text = task[2] ?? '';
    }
    while (stack.length > 0 && indent < (stack[stack.length - 1]?.indent ?? 0)) stack.pop();
    const top = stack[stack.length - 1];
    if (!top) {
      root ??= { kind: 'list', ordered, items: [] };
      stack.push({ indent, list: root });
    } else if (indent > top.indent) {
      const parent = top.list.items[top.list.items.length - 1];
      if (!parent) return null;
      const child: ListBlock = { kind: 'list', ordered, items: [] };
      parent.children.push(child);
      stack.push({ indent, list: child });
    }
    const current = stack[stack.length - 1];
    current?.list.items.push({ text, checked, children: [] });
  }
  return root;
}

function splitRow(line: string): string[] {
  // Pipa yang di-escape (\|) tidak boleh memecah sel.
  let row = protectEscapes(line.trim());
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function delimiterAlign(line: string): TableAlign[] | null {
  const cells = splitRow(line);
  if (cells.length === 0 || !cells.every((cell) => /^:?-+:?$/.test(cell))) return null;
  return cells.map((cell) =>
    cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
}

// Dua spasi atau garis miring di akhir baris memaksa baris baru tanpa paragraf baru.
function joinParagraph(lines: string[]): string {
  return lines.map((line, i) => {
    if (i === lines.length - 1) return line;
    const hard = /(?:\\| {2,})$/.test(line);
    const body = hard ? line.replace(/(?:\\| {2,})$/, '') : line;
    return body + (hard ? '\n' : ' ');
  }).join('');
}

export function parseMarkdown(src: string): MarkdownBlock[] {
  return parseBlocks(src, new Map());
}

function parseBlocks(src: string, used: Map<string, number>): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const addHeading = (level: 2 | 3 | 4 | 5 | 6, text: string) => {
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

    const heading = HEADING_MARK.exec(first.trimStart());
    if (heading) {
      const marks = (heading[1] ?? '#').length;
      // Halaman entri sudah punya h1 sendiri; tingkat 1 dan 2 sama-sama jadi h2.
      const level = (marks <= 2 ? 2 : Math.min(6, marks)) as 2 | 3 | 4 | 5 | 6;
      addHeading(level, (heading[2] ?? '').trim());
      const rest = lines.slice(1).join('\n');
      if (rest.trim()) addParagraph(rest);
      continue;
    }

    if (lines.length === 1 && /^(?:-{3,}|\*{3,}|_{3,})$/.test(first.trim())) {
      blocks.push({ kind: 'hr' });
      continue;
    }

    if (first.includes('|')) {
      const align = delimiterAlign(lines[1] ?? '');
      if (align) {
        const header = splitRow(first);
        const rows = lines.slice(2)
          .filter((line) => line.trim() !== '')
          .map((line) => {
            const cells = splitRow(line);
            return header.map((_, i) => cells[i] ?? '');
          });
        if (header.length > 0) {
          blocks.push({ kind: 'table', header, align, rows });
          continue;
        }
      }
    }

    const nonEmpty = lines.filter((l) => l.trim() !== '');
    if (nonEmpty.length > 0 && nonEmpty.every((l) => /^>\s?/.test(l))) {
      const inner = lines.map((l) => l.replace(/^>\s?/, '')).join('\n');
      blocks.push({ kind: 'quote', blocks: parseBlocks(inner, used) });
      continue;
    }

    if (nonEmpty.length > 0) {
      const list = parseList(nonEmpty);
      if (list) {
        blocks.push(list);
        continue;
      }
    }

    addParagraph(joinParagraph(lines));
  }
  return blocks;
}

export function tocOf(blocks: MarkdownBlock[]) {
  return blocks.flatMap((b) => (b.kind === 'heading' ? [{ id: b.id, text: b.text, level: b.level }] : []));
}
