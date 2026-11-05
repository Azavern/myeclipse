// Aturan murni Library media. Tanpa 'server-only' supaya dipakai klien, server,
// dan tes Vitest sekaligus.

export const LIBRARY_VISIBILITIES = ['private', 'all', 'specific'] as const;
export type LibraryVisibility = (typeof LIBRARY_VISIBILITIES)[number];

export const LIBRARY_VISIBILITY_LABEL: Record<LibraryVisibility, string> = {
  private: 'Hanya saya',
  all: 'Semua anggota',
  specific: 'Anggota tertentu',
};

export const LIBRARY_MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
export const LIBRARY_MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
export const LIBRARY_MAX_TITLE = 120;
export const LIBRARY_CATEGORY = 'pictures';

export const isLibraryVisibility = (value: unknown): value is LibraryVisibility =>
  typeof value === 'string' && (LIBRARY_VISIBILITIES as readonly string[]).includes(value);

const stripExtension = (name: string) => name.replace(/\.[A-Za-z0-9]{1,10}$/, '');

// Judul awal dari nama file: ekstensi dibuang, pemisah dirapikan, panjang dibatasi.
export function libraryTitle(name: string): string {
  const base = stripExtension(name)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const title = base || 'Gambar';
  return title.length > LIBRARY_MAX_TITLE
    ? `${title.slice(0, LIBRARY_MAX_TITLE - 1).trimEnd()}…`
    : title;
}

const cleanSegment = (raw: string, fallback: string) => {
  const clean = raw.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '');
  return clean || fallback;
};

// Nama folder Drive per anggota. Hanya mengganti nama folder, tidak pernah
// menyentuh file di dalamnya.
export function libraryFolderName(username: string): string {
  return cleanSegment(username, 'anggota').slice(0, 80);
}

// Nama file asli yang diunggah ke Drive: ekstensi asli dipertahankan.
export function libraryDriveName(originalName: string, ext: string): string {
  const base = cleanSegment(stripExtension(originalName), 'gambar');
  const suffix = `.${ext}`;
  return `${base.slice(0, 180 - suffix.length)}${suffix}`;
}

export function libraryDownloadName(originalName: string | null, title: string, ext: string | null): string {
  const base = cleanSegment(stripExtension(originalName || title), 'gambar');
  return `${base.slice(0, 150)}.${ext ?? 'webp'}`;
}

// Header Content-Disposition aman: fallback ASCII + nama UTF-8 (RFC 5987).
export function contentDisposition(name: string): string {
  const fallback = cleanSegment(name, 'media')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
