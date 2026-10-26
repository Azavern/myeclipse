// Penyisipan sintaks Markdown untuk editor Knowledge. Fungsi murni supaya
// perilaku tombol dan pintasan (seleksi, bungkus, lepas bungkus) dapat dites.

export type EditSelection = { start: number; end: number };
export type EditResult = { value: string; start: number; end: number };

export type LineKind = 'heading' | 'unordered' | 'ordered' | 'task' | 'quote';

const LINE_PATTERN: Record<LineKind, RegExp> = {
  heading: /^\s*#{1,6}\s+/,
  unordered: /^\s*[-*+]\s+(?!\[[ xX]\]\s)/,
  ordered: /^\s*\d+[.)]\s+/,
  task: /^\s*[-*+]\s+\[[ xX]\]\s+/,
  quote: /^\s*>\s?/,
};

// Saat mengganti jenis awalan (mis. H3 pada baris H2, atau daftar bernomor pada
// daftar berpoin), awalan lama dibuang dulu agar tidak menumpuk.
const STRIP_ON_ADD: Record<LineKind, RegExp> = {
  heading: /^#{1,6}\s+/,
  unordered: /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/,
  ordered: /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/,
  task: /^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/,
  quote: /^>\s?/,
};

const PREFIX: Record<Exclude<LineKind, 'heading' | 'ordered'>, string> = {
  unordered: '- ',
  task: '- [ ] ',
  quote: '> ',
};

function normalize(value: string, { start, end }: EditSelection): { s: number; e: number } {
  const s = Math.max(0, Math.min(value.length, Math.min(start, end)));
  const e = Math.max(s, Math.min(value.length, Math.max(start, end)));
  return { s, e };
}

// Angkup teks terpilih dengan penanda; menekan perintah yang sama dua kali melepasnya.
export function applyWrap(
  value: string, selection: EditSelection, before: string, after: string, placeholder: string,
): EditResult {
  const { s, e } = normalize(value, selection);
  const selected = value.slice(s, e);

  // Penanda berada tepat di luar pilihan (mis. teks di dalam **...**).
  if (s >= before.length && value.slice(s - before.length, s) === before
    && value.slice(e, e + after.length) === after) {
    const start = s - before.length;
    return {
      value: value.slice(0, start) + selected + value.slice(e + after.length),
      start,
      end: e - before.length,
    };
  }

  // Penanda ikut terpilih.
  if (selected.length >= before.length + after.length
    && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return { value: value.slice(0, s) + inner + value.slice(e), start: s, end: s + inner.length };
  }

  // Pilihan beberapa baris: setiap baris berisi dibungkus sendiri agar tetap valid.
  if (selected.includes('\n')) {
    const replacement = selected.split('\n')
      .map((line) => (line.trim() === '' ? line : `${before}${line}${after}`))
      .join('\n');
    return {
      value: value.slice(0, s) + replacement + value.slice(e),
      start: s,
      end: s + replacement.length,
    };
  }

  const text = selected || placeholder;
  return {
    value: value.slice(0, s) + before + text + after + value.slice(e),
    start: s + before.length,
    end: s + before.length + text.length,
  };
}

// Nomor urut melanjutkan item sebelumnya pada indentasi yang sama, bukan selalu
// mulai dari 1. Baris kosong dianggap batas daftar baru.
export function nextOrderedNumber(value: string, lineStart: number, indent: string): number {
  if (lineStart === 0) return 1;
  const previous = value.slice(0, lineStart - 1).split('\n').at(-1) ?? '';
  const match = /^(\s*)(\d+)[.)]\s+/.exec(previous);
  return match && match[1] === indent ? Number(match[2]) + 1 : 1;
}

// Beri awalan pada baris terpilih (judul, daftar, kutipan, checklist).
// Bila semua baris sudah memakai jenis yang sama, awalan dilepas.
export function applyLine(
  value: string, selection: EditSelection, kind: LineKind, headingLevel: 2 | 3 | 4 = 2,
): EditResult {
  const { s, e } = normalize(value, selection);
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  // Pilihan yang berakhir tepat di awal baris berikutnya tidak ikut baris itu.
  const focusEnd = e > s && value[e - 1] === '\n' ? e - 1 : e;
  const nextBreak = value.indexOf('\n', focusEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const pattern = LINE_PATTERN[kind];
  const sameHeading = new RegExp(`^\\s*#{${headingLevel}}\\s+`);
  const meaningful = lines.filter((line) => line.trim() !== '');
  const alreadyApplied = meaningful.length > 0 && meaningful.every((line) =>
    (kind === 'heading' ? sameHeading : pattern).test(line));

  const caretLine = block.slice(0, Math.max(0, s - lineStart)).split('\n').length - 1;
  let addedAtCaret = 0;
  let removedAtCaret = 0;
  const firstIndent = /^\s*/.exec(meaningful[0] ?? '')?.[0] ?? '';
  let orderedIndex = nextOrderedNumber(value, lineStart, firstIndent);

  const replacement = lines.map((line, i) => {
    if (alreadyApplied) {
      const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
      const stripped = indent + line.slice(indent.length).replace(pattern, '');
      if (i === caretLine) removedAtCaret = line.length - stripped.length;
      return stripped;
    }
    if (line.trim() === '') return line;
    const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
    const marker = kind === 'heading'
      ? `${'#'.repeat(headingLevel)} `
      : kind === 'ordered' ? `${orderedIndex++}. ` : PREFIX[kind];
    if (i === caretLine) addedAtCaret = marker.length;
    return indent + marker + line.slice(indent.length).replace(STRIP_ON_ADD[kind], '');
  }).join('\n');

  const next = value.slice(0, lineStart) + replacement + value.slice(lineEnd);
  if (e > s) return { value: next, start: lineStart, end: lineStart + replacement.length };
  const caret = Math.max(0, Math.min(replacement.length + lineStart,
    lineStart + (s - lineStart) + addedAtCaret - removedAtCaret));
  return { value: next, start: caret, end: caret };
}

// Sisipkan potongan blok (tabel, blok kode, garis) dengan satu baris kosong di sekitarnya.
export function insertSnippet(
  value: string, selection: EditSelection, snippet: string,
  selectFrom?: number, selectTo?: number,
): EditResult {
  const { s, e } = normalize(value, selection);
  const before = value.slice(0, s);
  const after = value.slice(e);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const inserted = `${lead}${snippet}${trail}`;
  const base = s + lead.length;
  const start = selectFrom === undefined ? base + snippet.length : base + selectFrom;
  const end = selectFrom === undefined || selectTo === undefined ? start : base + selectTo;
  return { value: before + inserted + after, start, end };
}

// Enter pada item bernomor menambahkan nomor berikutnya. Item kosong mengakhiri
// daftar dengan melepas nomornya, sama seperti editor teks lain.
export function continueList(value: string, selection: EditSelection): EditResult | null {
  const { s, e } = normalize(value, selection);
  if (s !== e) return null;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const lineEnd = value.indexOf('\n', s);
  const block = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const match = /^(\s*)(\d+)([.)])(\s+)(.*)$/.exec(block);
  if (!match) return null;
  const [, indent = '', number = '1', delimiter = '.', , rest = ''] = match;
  const prefixLength = block.length - rest.length;
  if (s < lineStart + prefixLength) return null;
  if (rest.trim() === '') {
    const caret = lineStart + indent.length;
    return { value: value.slice(0, lineStart) + indent + value.slice(lineStart + prefixLength), start: caret, end: caret };
  }
  const inserted = `\n${indent}${Number(number) + 1}${delimiter} `;
  const caret = s + inserted.length;
  return { value: value.slice(0, s) + inserted + value.slice(s), start: caret, end: caret };
}

export type CommandId =
  | 'heading2' | 'heading3' | 'heading4'
  | 'bold' | 'italic' | 'strike' | 'codeInline' | 'link' | 'image'
  | 'unordered' | 'ordered' | 'task' | 'quote'
  | 'codeBlock' | 'table' | 'hr';

export function runCommand(id: CommandId, value: string, selection: EditSelection): EditResult {
  switch (id) {
    case 'heading2': return applyLine(value, selection, 'heading', 2);
    case 'heading3': return applyLine(value, selection, 'heading', 3);
    case 'heading4': return applyLine(value, selection, 'heading', 4);
    case 'bold': return applyWrap(value, selection, '**', '**', 'teks tebal');
    case 'italic': return applyWrap(value, selection, '*', '*', 'teks miring');
    case 'strike': return applyWrap(value, selection, '~~', '~~', 'teks dicoret');
    case 'codeInline': return applyWrap(value, selection, '`', '`', 'kode');
    case 'link': return applyWrap(value, selection, '[', '](https://)', 'teks tautan');
    case 'image': return applyWrap(value, selection, '![', '](https://)', 'teks alternatif');
    case 'unordered': return applyLine(value, selection, 'unordered');
    case 'ordered': return applyLine(value, selection, 'ordered');
    case 'task': return applyLine(value, selection, 'task');
    case 'quote': return applyLine(value, selection, 'quote');
    case 'codeBlock': {
      const snippet = '```\nkode\n```';
      return insertSnippet(value, selection, snippet, 4, 8);
    }
    case 'table': {
      const snippet = '| Judul | Nilai |\n| --- | --- |\n| Isi | Isi |';
      return insertSnippet(value, selection, snippet, 2, 7);
    }
    case 'hr': return insertSnippet(value, selection, '---');
  }
}
