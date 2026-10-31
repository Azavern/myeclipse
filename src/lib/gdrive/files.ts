// Aturan murni Google Drive Uploader: kategori, ekstensi, signature, penamaan,
// parser link folder, dan batas slot per pengguna. Tanpa 'server-only' supaya
// dipakai bersama UI dan server sekaligus bisa diuji Vitest.

export type Category = 'pictures' | 'videos' | 'audios' | 'documents' | 'archives';

export const CATEGORY_LABEL: Record<Category, string> = {
  pictures: 'Gambar', videos: 'Video', audios: 'Audio', documents: 'Dokumen', archives: 'Arsip',
};

export const CATEGORY_EXT = {
  pictures: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  videos: ['mp4', 'mkv', 'mov'],
  audios: ['mp3', 'm4a', 'aac', 'wav', 'flac'],
  documents: ['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  archives: ['zip', 'rar'],
} as const satisfies Record<Category, readonly string[]>;

export const GDRIVE_MAX_FOLDERS = 20;
export const GDRIVE_MAX_FILE_MB = 2048;
export const GDRIVE_DEFAULT_MAX_MB = 500;
export const GDRIVE_CHUNK_BYTES = 8 * 1024 * 1024;
export const GDRIVE_MAX_FILENAME = 180;

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mkv: 'video/x-matroska', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', rar: 'application/vnd.rar',
};

export function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function categoryForExt(ext: string | null): Category | null {
  if (!ext) return null;
  for (const category of Object.keys(CATEGORY_EXT) as Category[]) {
    if ((CATEGORY_EXT[category] as readonly string[]).includes(ext)) return category;
  }
  return null;
}

export function mimeForExt(ext: string): string {
  return MIME[ext] ?? 'application/octet-stream';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

// ── Signature / magic bytes ───────────────────────────────────────────────

export type SignatureKind =
  | 'jpeg' | 'png' | 'webp' | 'heic' | 'mp4' | 'mov' | 'mkv'
  | 'mp3' | 'm4a' | 'aac' | 'wav' | 'flac'
  | 'pdf' | 'text' | 'zip' | 'rar' | 'ole';

const SIG_EXT: Record<SignatureKind, readonly string[]> = {
  jpeg: ['jpg', 'jpeg'], png: ['png'], webp: ['webp'], heic: ['heic', 'heif'],
  mp4: ['mp4'], mov: ['mov'], mkv: ['mkv'],
  mp3: ['mp3'], m4a: ['m4a'], aac: ['aac'], wav: ['wav'], flac: ['flac'],
  pdf: ['pdf'], text: ['txt', 'md'],
  // DOCX/XLSX/PPTX adalah arsip ZIP; signature-nya memang sama dengan ZIP.
  zip: ['zip', 'docx', 'xlsx', 'pptx'], rar: ['rar'], ole: ['doc', 'xls', 'ppt'],
};

const ascii = (bytes: Uint8Array, at: number, text: string) =>
  text.split('').every((ch, i) => bytes[at + i] === ch.charCodeAt(0));

const brandAt = (bytes: Uint8Array) =>
  bytes.length >= 12 && ascii(bytes, 4, 'ftyp') ? String.fromCharCode(...bytes.slice(8, 12)) : '';

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  let control = 0;
  for (const b of bytes.slice(0, 4096)) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / Math.min(bytes.length, 4096) < 0.02;
}

export function detectSignature(bytes: Uint8Array): SignatureKind | null {
  if (bytes.length === 0) return null;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 12 && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'webp';
  if (bytes.length >= 12 && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')) return 'wav';
  if (bytes.length >= 4 && ascii(bytes, 0, 'fLaC')) return 'flac';
  if (bytes.length >= 4 && ascii(bytes, 0, 'Rar!')) return 'rar';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [3, 5, 7].includes(bytes[2] ?? 0) && [4, 6, 8].includes(bytes[3] ?? 0)) return 'zip';
  if (bytes.length >= 8 && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((b, i) => bytes[i] === b)) return 'ole';
  if (bytes.length >= 4 && ascii(bytes, 0, '%PDF')) return 'pdf';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'mkv';
  if (bytes.length >= 3 && ascii(bytes, 0, 'ID3')) return 'mp3';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) return 'mp3';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) return 'aac';

  const brand = brandAt(bytes);
  if (brand) {
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)) return 'heic';
    if (brand === 'qt  ') return 'mov';
    if (brand === 'M4A ' || brand === 'M4B ') return 'm4a';
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'].includes(brand)) return 'mp4';
  }
  return looksLikeText(bytes) ? 'text' : null;
}

export function signatureMatches(ext: string, kind: SignatureKind): boolean {
  return SIG_EXT[kind].includes(ext);
}

export type FileIssue =
  | 'empty' | 'too_large' | 'extension' | 'archive_disabled' | 'signature' | 'mismatch' | 'name';

export const FILE_ISSUE_MESSAGE: Record<FileIssue, string> = {
  empty: 'File kosong tidak bisa diunggah.',
  too_large: 'Ukuran file melebihi batas yang diizinkan.',
  extension: 'Jenis file ini tidak diizinkan.',
  archive_disabled: 'Ketua kelas menonaktifkan unggahan file arsip.',
  signature: 'Isi file tidak dikenali, jadi formatnya tidak bisa dipastikan.',
  mismatch: 'Isi file tidak sesuai dengan ekstensinya.',
  name: 'Nama file tidak valid.',
};

export type FileCheck =
  | { ok: true; ext: string; category: Category; mime: string; signature: SignatureKind }
  | { ok: false; issue: FileIssue };

// Validasi lengkap satu file. `bytes` cukup beberapa KB pertama untuk signature.
export function checkFile(o: {
  name: string; size: number; bytes: Uint8Array; maxBytes: number; archivesEnabled: boolean;
}): FileCheck {
  if (!Number.isFinite(o.size) || o.size <= 0) return { ok: false, issue: 'empty' };
  if (o.size > o.maxBytes) return { ok: false, issue: 'too_large' };
  const ext = extensionOf(o.name);
  const category = categoryForExt(ext);
  if (!ext || !category) return { ok: false, issue: 'extension' };
  if (category === 'archives' && !o.archivesEnabled) return { ok: false, issue: 'archive_disabled' };
  const signature = detectSignature(o.bytes);
  if (!signature) return { ok: false, issue: 'signature' };
  if (!signatureMatches(ext, signature)) return { ok: false, issue: 'mismatch' };
  return { ok: true, ext, category, mime: mimeForExt(ext), signature };
}

// ── Nama file ────────────────────────────────────────────────────────────

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function cleanBase(raw: string): string {
  let base = raw.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .trim();
  if (!base) return '';
  if (RESERVED.test(base)) base = `_${base}`;
  return base;
}

export function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,10}$/, '');
}

// Menjaga ekstensi asli tetap di ujung nama; nama custom tidak boleh mengganti format.
export function buildFinalName(o: { originalName: string; customName?: string; timestamp: string; ext: string }): string {
  const custom = cleanBase(stripExtension(o.customName ?? ''));
  const original = cleanBase(stripExtension(o.originalName)) || 'berkas';
  const base = custom || `${original} — ${o.timestamp}`;
  return fitName(base, o.ext);
}

function fitName(base: string, ext: string): string {
  const suffix = `.${ext}`;
  const maxBase = GDRIVE_MAX_FILENAME - suffix.length;
  const safe = base.slice(0, Math.max(1, maxBase)).replace(/[\s.-]+$/g, '') || 'berkas';
  return `${safe}${suffix}`;
}

export function collisionName(name: string, index: number): string {
  const ext = extensionOf(name);
  if (!ext) return `${name} (${index})`.slice(0, GDRIVE_MAX_FILENAME);
  const stem = name.slice(0, -(ext.length + 1));
  return fitName(`${stem} (${index})`, ext);
}

// ── Link / ID folder ─────────────────────────────────────────────────────

const FOLDER_ID = /^[A-Za-z0-9_-]{10,200}$/;

// Menerima ID langsung atau link folder Drive. Link file/dokumen ditolak.
export function parseFolderRef(input: string): string | null {
  const value = input.trim();
  if (!value || value.length > 2048) return null;
  if (FOLDER_ID.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.hostname !== 'drive.google.com') return null;
  const match = /^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})\/?$/.exec(url.pathname)
    ?? /^\/folders\/([A-Za-z0-9_-]{10,200})\/?$/.exec(url.pathname);
  return match?.[1] ?? null;
}

// ── Batas unggahan bersamaan ─────────────────────────────────────────────

const MIB = 1024 * 1024;

// Slot dihitung per kelas ukuran file: file yang lebih besar mendapat slot lebih sedikit.
export function uploadSlotLimit(bytes: number): number {
  if (bytes > 99 * MIB) return 1;
  if (bytes > 50 * MIB) return 2;
  if (bytes > 25 * MIB) return 3;
  if (bytes > 10 * MIB) return 4;
  if (bytes > 1 * MIB) return 5;
  return 10;
}

export function slotHint(): string {
  return 'Maksimal bersamaan per anggota: 1 file >99 MB, 2 file >50 MB, 3 file >25 MB, 4 file >10 MB, 5 file >1 MB, atau 10 file ≤1 MB.';
}
