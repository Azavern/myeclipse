import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pickUsername, slugifyUsername } from '../../src/lib/username';
import { safeRedirect } from '../../src/lib/safe-redirect';
import { dateParts, formatClock, formatRange, formatShortDate, formatWhen, isoWeekday, localToUtc, relativeTime, utcToLocal } from '../../src/lib/time';
import { isFlashKey, withFlash } from '../../src/lib/flash';
import { taskDisplayStatus } from '../../src/lib/tasks';
import { contrastRatio, contrastReport, mixHex, onColor } from '../../src/lib/theme/contrast';
import { buildThemeCss } from '../../src/lib/theme/css';
import { DEFAULT_THEME, LEGACY_THEME_V1 } from '../../src/lib/theme/defaults';
import { THEME_PRESETS } from '../../src/lib/theme/presets';
import { ThemeSchema } from '../../src/lib/theme/schema';
import { detectImage } from '../../src/lib/storage/magic-bytes';
import { buildCsp, makeNonce, originOf } from '../../src/lib/security/csp';
import { CLASS_KEYS, MEMBER_KEYS } from '../../src/lib/visibility/audiences';
import { parseInline, parseMarkdown, safeHref, splitRawBlocks, tocOf } from '../../src/lib/knowledge/markdown';
import { computeHighlights, parseHighlights } from '../../src/lib/knowledge/diff';
import { normalizeTag, normalizeTags, parseTagsJson } from '../../src/lib/knowledge/tags';

const sql = readFileSync(new URL('../../supabase/migrations/20261005120700_reference_data.sql', import.meta.url), 'utf8');
const sqlV2 = readFileSync(new URL('../../supabase/migrations/20261012120000_theme_default_v2.sql', import.meta.url), 'utf8');
const sqlKnowledge = readFileSync(new URL('../../supabase/migrations/20261023120000_knowledge.sql', import.meta.url), 'utf8');

describe('username', () => {
  it('menghilangkan diakritik dan simbol', () => {
    expect(slugifyUsername('Ánita Dwi Pütri')).toBe('anita_dwi_putri');
    expect(slugifyUsername('Budi, S.Kom')).toBe('budi_s_kom');
  });
  it('selalu memenuhi ^[a-z0-9_]{3,30}$', () => {
    for (const n of ['Al', '  ', '###', 'a'.repeat(50)]) expect(/^[a-z0-9_]{3,30}$/.test(slugifyUsername(n))).toBe(true);
  });
  it('menambah sufiks saat bentrok, tetap ≤30 karakter', () => {
    expect(pickUsername('budi', new Set())).toBe('budi');
    expect(pickUsername('budi', new Set(['budi']))).toBe('budi_2');
    expect(pickUsername('budi', new Set(['budi', 'budi_2']))).toBe('budi_3');
    const long = 'a'.repeat(30);
    expect(pickUsername(long, new Set([long])).length).toBe(30);
  });
});

describe('safeRedirect', () => {
  it('menolak target eksternal dan trik slash', () => {
    for (const x of ['//evil.com', '/\\evil', 'https://evil.com', 'evil', '', null, undefined]) expect(safeRedirect(x)).toBe('/');
  });
  it('mempertahankan path internal', () => expect(safeRedirect('/tasks?status=completed')).toBe('/tasks?status=completed'));
});

describe('waktu zona kelas', () => {
  it('mengonversi waktu dinding ke UTC', () => {
    expect(localToUtc('2026-10-05T08:00', 'Asia/Jakarta')).toBe('2026-10-05T01:00:00.000Z');
    expect(localToUtc('2026-10-05T08:00', 'Asia/Makassar')).toBe('2026-10-05T00:00:00.000Z');
    expect(localToUtc('2026-10-05T08:00', 'Asia/Jayapura')).toBe('2026-10-04T23:00:00.000Z');
  });
  it('utcToLocal adalah kebalikannya', () => {
    for (const tz of ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']) expect(utcToLocal(localToUtc('2026-12-31T23:30', tz), tz)).toBe('2026-12-31T23:30');
  });
});

describe('tampilan tanggal', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  it('relativeTime memakai bahasa Indonesia', () => {
    expect(relativeTime('2026-10-12T00:00:20Z', now)).toBe('sekarang');
    expect(relativeTime('2026-10-12T00:30:00Z', now)).toBe('30 menit lagi');
    expect(relativeTime('2026-10-12T05:00:00Z', now)).toBe('5 jam lagi');
    expect(relativeTime('2026-10-13T00:00:00Z', now)).toBe('besok');
    expect(relativeTime('2026-10-11T00:00:00Z', now)).toBe('kemarin');
    expect(relativeTime('2026-10-09T00:00:00Z', now)).toBe('3 hari lalu');
    expect(relativeTime('2026-10-20T00:00:00Z', now)).toBe('8 hari lagi');
    expect(relativeTime('2026-12-12T00:00:00Z', now)).toBe('2 bulan lagi');
  });
  it('dateParts, formatClock, isoWeekday mengikuti zona kelas', () => {
    expect(dateParts('2026-10-12T17:30:00Z', 'Asia/Jakarta').day).toBe('13'); // lewat tengah malam WIB
    expect(formatClock('2026-10-12T01:05:00Z', 'Asia/Jakarta')).toBe('08:05');
    expect(isoWeekday('Asia/Jakarta', new Date('2026-10-12T00:00:00Z'))).toBe(1); // Senin
    expect(isoWeekday('Asia/Jayapura', new Date('2026-10-11T16:00:00Z'))).toBe(1);
    expect(isoWeekday('Asia/Jakarta', new Date('2026-10-11T16:00:00Z'))).toBe(7);
  });
  it('formatRange: satu hari dipadatkan, lintas hari menyebut dua tanggal; jam selalu bertitik dua', () => {
    expect(formatRange('2026-10-12T01:00:00Z', '2026-10-12T03:00:00Z', 'Asia/Jakarta')).toBe('Senin, 12 Oktober 2026 · 08:00–10:00 WIB');
    expect(formatRange('2026-10-12T01:00:00Z', '2026-10-13T03:00:00Z', 'Asia/Jakarta')).toBe('Sen, 12 Okt, 08:00 WIB – Sel, 13 Okt, 10:00 WIB');
    // 23:30 WIB dan 00:30 WIB hari berikutnya berbeda hari menurut zona kelas, meski sama-sama 12 Oktober UTC
    expect(formatRange('2026-10-12T16:30:00Z', '2026-10-12T17:30:00Z', 'Asia/Jakarta')).toContain(' – ');
  });
  it('formatWhen dan formatShortDate', () => {
    expect(formatWhen('2026-10-12T01:05:00Z', 'Asia/Jakarta')).toBe('Sen, 12 Okt, 08:05 WIB');
    expect(formatShortDate('2026-10-12')).toBe('12 Okt');
  });
});

describe('flash', () => {
  it('withFlash menyisipkan parameter sebelum hash dan memakai & bila sudah ada query', () => {
    expect(withFlash('/tasks', 'saved')).toBe('/tasks?flash=saved');
    expect(withFlash('/tasks?status=done', 'deleted')).toBe('/tasks?status=done&flash=deleted');
    expect(withFlash('/members/x#top', 'created')).toBe('/members/x?flash=created#top');
  });
  it('isFlashKey hanya menerima kunci yang dikenal (bukan properti Object atau teks bebas)', () => {
    expect(isFlashKey('saved')).toBe(true);
    for (const bad of ['toString', '__proto__', '<script>', '', null]) expect(isFlashKey(bad)).toBe(false);
  });
});

describe('taskDisplayStatus', () => {
  const now = new Date('2026-10-05T00:00:00Z');
  const at = (ms: number) => ({ status: 'active' as const, deadline: new Date(now.getTime() + ms) });
  const H72 = 72 * 3_600_000;
  it('batas 72 jam dan lewat tenggat', () => {
    expect(taskDisplayStatus(at(H72), now)).toBe('due_soon');
    expect(taskDisplayStatus(at(H72 + 1), now)).toBe('active');
    expect(taskDisplayStatus(at(0), now)).toBe('due_soon');
    expect(taskDisplayStatus(at(-1), now)).toBe('overdue');
  });
  it('status tersimpan menang atas tenggat', () => {
    const past = new Date(now.getTime() - 1000);
    expect(taskDisplayStatus({ status: 'completed', deadline: past }, now)).toBe('completed');
    expect(taskDisplayStatus({ status: 'archived', deadline: past }, now)).toBe('archived');
  });
});

describe('tema', () => {
  it('rumus kontras WCAG', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeGreaterThanOrEqual(20.99);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });
  it('tema bawaan lolos semua pasangan', () => {
    expect(contrastReport(DEFAULT_THEME.palette).filter((r) => !r.ok)).toEqual([]);
    expect(onColor(DEFAULT_THEME.palette.primary, DEFAULT_THEME.palette.text_primary)).toBe('#FFFFFF');
  });
  it('DEFAULT_THEME identik dengan migrasi v2 dan tema lama identik dengan seed 0008', () => {
    const pal = (text: string) => Object.fromEntries([...text.matchAll(/"(\w+)": "(#[0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]));
    const [setPart, wherePart] = sqlV2.split('where theme =');
    expect(pal(setPart ?? '')).toEqual(DEFAULT_THEME.palette);
    expect(pal(wherePart ?? '')).toEqual(LEGACY_THEME_V1.palette);
    expect(pal(sql)).toEqual(LEGACY_THEME_V1.palette);
    expect(sqlV2).toContain(`"font_preset": "${DEFAULT_THEME.font_preset}"`);
  });
  it('preset palet lolos ThemeSchema dan unik', () => {
    for (const p of THEME_PRESETS) {
      expect(ThemeSchema.safeParse({ layout: 'standard', font_preset: 'rounded', palette: p.palette }).success, p.id).toBe(true);
    }
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(THEME_PRESETS.length);
  });
  it('onColor memilih kandidat berkontras tertinggi; mixHex bekerja di sRGB', () => {
    expect(onColor('#F59E0B', '#EAF0FB', '#0B1220')).toBe('#0B1220');
    expect(onColor('#0F766E', '#0E1F1D')).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#336699', '#336699', 0.7)).toBe('#336699');
  });
  it('CSS tema: variabel dan gradien menjaga kontras teks', () => {
    for (const p of THEME_PRESETS) {
      const css = buildThemeCss({ layout: 'standard', font_preset: 'rounded', palette: p.palette });
      const get = (k: string) => css.match(new RegExp(`--${k}:(#[0-9A-F]{6})`))?.[1] ?? '';
      expect(contrastRatio(get('theme-on-primary'), p.palette.primary), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(get('theme-on-primary'), get('theme-primary-deep')), p.id).toBeGreaterThanOrEqual(4.5);
      expect(css).toContain(`color-scheme:${p.id === 'gerhana' ? 'dark' : 'light'}`);
    }
  });
});

describe('detectImage', () => {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  it('mengenali JPEG, PNG, WebP dari isi file', () => {
    expect(detectImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(detectImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe('image/png');
    expect(detectImage(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP')]))?.mime).toBe('image/webp');
  });
  it('menolak SVG, WAV, dan data kosong', () => {
    expect(detectImage(new Uint8Array(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBeNull();
    expect(detectImage(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE')]))).toBeNull();
    expect(detectImage(new Uint8Array([]))).toBeNull();
  });
});

describe('paritas katalog visibility (kode vs migrasi 0008 + 0014)', () => {
  const cat = new Map([...`${sql}\n${sqlKnowledge}`.matchAll(/\('((?:page|section|field|item)\.[a-z_.]+)'\s*,\s*'\w+'\s*,\s*'\w+'\s*,\s*(?:null|'[a-z_.]+')\s*,\s*(?:null|'\w+')\s*,\s*'(\w+)'\)/g)].map((m) => [m[1], m[2]]));
  it('semua kunci ada di DB dengan batas terluas yang sama', () => {
    expect(cat.size).toBe(28);
    for (const [k, , widest] of CLASS_KEYS) expect(cat.get(k)).toBe(widest);
    for (const [k] of MEMBER_KEYS) expect(cat.has(k)).toBe(true);
  });
});

describe('Markdown pengetahuan yang aman', () => {
  it('HTML mentah tetap teks, bukan markup', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'paragraph', text: '<script>alert(1)</script>' });
  });
  it('hanya tautan https yang sah', () => {
    expect(safeHref('https://contoh.id/a?b=1')).toBe('https://contoh.id/a?b=1');
    for (const bad of ['javascript:alert(1)', 'http://contoh.id', 'https://user:pass@contoh.id', 'https://localhost']) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });
  it('tautan berbahaya tidak menjadi token link', () => {
    const tokens = parseInline('[klik](javascript:alert(1)) dan **aman**');
    expect(tokens.some((t) => t.t === 'link')).toBe(false);
    expect(tokens.some((t) => t.t === 'strong')).toBe(true);
  });
  it('tebal, miring, kode, dan URL telanjang dikenali', () => {
    const tokens = parseInline('**a** *b* `c` https://contoh.id/x.');
    expect(tokens.map((t) => t.t)).toEqual(['strong', 'text', 'em', 'text', 'code', 'text', 'link', 'text']);
    const link = tokens.find((t) => t.t === 'link');
    expect(link && 'href' in link ? link.href : '').toBe('https://contoh.id/x');
  });
  it('heading dipetakan ke h2–h4 dengan id unik dan TOC', () => {
    const blocks = parseMarkdown('# Satu\n\n## Satu\n\n### Tiga');
    expect(blocks.filter((b) => b.kind === 'heading').map((b) => b.kind === 'heading' && [b.level, b.id]))
      .toEqual([[2, 'satu'], [2, 'satu-2'], [3, 'tiga']]);
    expect(tocOf(blocks).map((h) => h.id)).toEqual(['satu', 'satu-2', 'tiga']);
  });
  it('blok kode tetap utuh meski berisi baris kosong', () => {
    const raw = splitRawBlocks('```js\nconst a = 1;\n\nconst b = 2;\n```\n\nTeks');
    expect(raw).toHaveLength(2);
    const blocks = parseMarkdown(raw.join('\n\n'));
    expect(blocks[0]).toMatchObject({ kind: 'code', lang: 'js', code: 'const a = 1;\n\nconst b = 2;' });
    expect(blocks[1]).toMatchObject({ kind: 'paragraph', text: 'Teks' });
  });
  it('daftar berpoin dan bernomor', () => {
    expect(parseMarkdown('- a\n- b')[0]).toMatchObject({ kind: 'list', ordered: false, items: ['a', 'b'] });
    expect(parseMarkdown('1. a\n2. b')[0]).toMatchObject({ kind: 'list', ordered: true, items: ['a', 'b'] });
  });
});

describe('Penyorotan suntingan pengetahuan', () => {
  it('menandai blok yang ditambah atau diubah, bukan blok yang sama', () => {
    expect(computeHighlights('A\n\nB', 'A\n\nB\n\nC', '2026-10-23T00:00:00.000Z'))
      .toEqual({ blocks: [2], at: '2026-10-23T00:00:00.000Z' });
    expect(computeHighlights('A\n\nB', 'A\n\nB diubah', 'x')).toEqual({ blocks: [1], at: 'x' });
  });
  it('tanpa perubahan berarti tanpa anotasi', () => {
    expect(computeHighlights('A\n\nB', 'A\n\nB')).toBeNull();
  });
  it('anotasi dari DB divalidasi dan diurutkan', () => {
    expect(parseHighlights({ blocks: [3, 1, 1, -1, '2', 2.5], at: 'x' })).toEqual({ blocks: [1, 3], at: 'x' });
    expect(parseHighlights({ blocks: [] })).toBeNull();
    expect(parseHighlights({ blocks: 'x' })).toBeNull();
    expect(parseHighlights(null)).toBeNull();
  });
});

describe('Normalisasi hashtag pengetahuan', () => {
  it('menyeragamkan #, spasi, dan simbol', () => {
    expect(normalizeTag(' #UI/UX ')).toBe('ui-ux');
    expect(normalizeTag('Belajar  Python')).toBe('belajar-python');
    expect(normalizeTag('###')).toBe('');
  });
  it('menghapus duplikat dan membatasi sepuluh tag', () => {
    expect(normalizeTags(['UI/UX', 'ui ux', 'UI-UX', 1, 'Go'])).toEqual(['ui-ux', 'go']);
    expect(normalizeTags(Array.from({ length: 15 }, (_, i) => `tag-${i}`))).toHaveLength(10);
  });
  it('JSON rusak tidak melempar galat', () => {
    expect(parseTagsJson('bukan json')).toEqual([]);
    expect(parseTagsJson('["A B","a-b"]')).toEqual(['a-b']);
  });
});

describe('CSP bernonce', () => {
  const prod = buildCsp({ nonce: 'abc123', supabaseUrl: 'https://proj.supabase.co/rest/v1' });
  const dir = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
  it('skrip dan gaya hanya boleh dari self dan nonce; tanpa unsafe-inline/eval di produksi', () => {
    expect(dir(prod, 'script-src')).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(dir(prod, 'style-src')).toBe("style-src 'self' 'nonce-abc123'");
    expect(prod).not.toMatch(/unsafe-inline|unsafe-eval/);
  });
  it('img-src memuat asal Supabase saja (tanpa path); connect-src hanya self', () => {
    expect(dir(prod, 'img-src')).toBe("img-src 'self' data: blob: https://proj.supabase.co");
    expect(dir(prod, 'connect-src')).toBe("connect-src 'self'");
  });
  it('menutup framing, plugin, dan form ke luar', () => {
    expect(dir(prod, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(dir(prod, 'object-src')).toBe("object-src 'none'");
    expect(dir(prod, 'form-action')).toBe("form-action 'self'");
    expect(dir(prod, 'base-uri')).toBe("base-uri 'self'");
  });
  it('mode dev menambah unsafe-eval dan ws: saja', () => {
    const dev = buildCsp({ nonce: 'n', dev: true });
    expect(dir(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(dir(dev, 'connect-src')).toBe("connect-src 'self' ws: wss:");
    expect(dir(dev, 'style-src')).not.toContain('unsafe-inline');
  });
  it('URL Supabase tidak valid atau bukan http(s) tidak membuka asal tambahan', () => {
    for (const bad of [undefined, '', 'bukan url', 'javascript:alert(1)', 'ftp://x.example']) {
      expect(dir(buildCsp({ nonce: 'n', supabaseUrl: bad }), 'img-src')).toBe("img-src 'self' data: blob:");
    }
    expect(originOf('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
  });
  it('nonce acak, base64, dan berbeda tiap pemanggilan', () => {
    const a = makeNonce(); const b = makeNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});
