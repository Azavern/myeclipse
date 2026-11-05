import 'server-only';
import { env } from '@/lib/env';
import { collisionName, fileInFolderQuery, uploadTagQuery } from './files';
import { resolveUploadOrigin } from './origin';

// Semua kredensial dan ID folder dibaca di sini. Tidak ada varian NEXT_PUBLIC_*:
// nilai ini tidak pernah dikirim ke peramban, log, atau pesan galat.
export class DriveError extends Error {
  constructor(public kind: 'config' | 'auth' | 'quota' | 'rate' | 'forbidden' | 'not_found' | 'folder' | 'cleanup' | 'network' | 'server', message: string) {
    super(message);
    this.name = 'DriveError';
  }
}

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type GdriveStatus = { ready: boolean; missing: string[] };

const REQUIRED = [
  'GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN', 'GDRIVE_ROOT_FOLDER_ID',
] as const;

export function gdriveStatus(): GdriveStatus {
  const missing = REQUIRED.filter((key) => !process.env[key]?.trim());
  return { ready: missing.length === 0, missing: [...missing] };
}

function credentials() {
  const id = env.GDRIVE_CLIENT_ID?.trim();
  const secret = env.GDRIVE_CLIENT_SECRET?.trim();
  const refresh = env.GDRIVE_REFRESH_TOKEN?.trim();
  if (!id || !secret || !refresh) throw new DriveError('config', 'Kredensial Google Drive belum dikonfigurasi.');
  return { id, secret, refresh };
}

export function rootFolderId(): string {
  const id = env.GDRIVE_ROOT_FOLDER_ID?.trim();
  if (!id) throw new DriveError('config', 'Folder utama Google Drive belum dikonfigurasi.');
  return id;
}

const CATEGORY_ENV = {
  pictures: 'GDRIVE_PICTURES', videos: 'GDRIVE_VIDEOS', audios: 'GDRIVE_AUDIOS',
  documents: 'GDRIVE_DOCUMENTS', archives: 'GDRIVE_ARCHIVES_ID',
} as const;

export function categoryFolderId(category: keyof typeof CATEGORY_ENV): string | null {
  const id = env[CATEGORY_ENV[category]]?.trim();
  return id || null;
}

export function customParentId(): string {
  return env.GDRIVE_CUSTOM?.trim() || rootFolderId();
}

// Origin yang dikirim saat inisialisasi sesi resumable harus origin aplikasi sendiri:
// APP_URL, GDRIVE_UPLOAD_ORIGINS (mis. domain pratinjau), atau origin yang host-nya sama
// dengan permintaan. Origin sembarang dari peramban tidak pernah diteruskan ke Google.
export function uploadOrigin(requestOrigin: string | null, requestHost: string | null = null): string | null {
  return resolveUploadOrigin({
    requestOrigin, requestHost, appUrl: env.APP_URL, extraOrigins: process.env.GDRIVE_UPLOAD_ORIGINS,
  });
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const { id, secret, refresh } = credentials();
  let response: Response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DriveError('network', 'Google tidak dapat dihubungi.');
  }
  if (!response.ok) throw new DriveError('auth', 'Google menolak kredensial server.');
  const json = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!json?.access_token) throw new DriveError('auth', 'Google tidak memberi access token.');
  tokenCache = { token: json.access_token, expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000 };
  return json.access_token;
}

function driveError(status: number, body: string): DriveError {
  const lower = body.toLowerCase();
  if (status === 429 || lower.includes('ratelimit') || lower.includes('rate limit')) return new DriveError('rate', 'Google Drive sedang membatasi permintaan.');
  if (status === 403 && (lower.includes('quota') || lower.includes('storagequota'))) return new DriveError('quota', 'Kuota Google Drive penuh.');
  if (status === 403) return new DriveError('forbidden', 'Google Drive menolak akses ke folder tujuan.');
  if (status === 404) return new DriveError('not_found', 'Objek Google Drive tidak ditemukan.');
  if (status === 401) return new DriveError('auth', 'Kredensial Google Drive kedaluwarsa.');
  return new DriveError('server', 'Google Drive sedang bermasalah.');
}

function googleReason(body: string): string {
  return /"reason"\s*:\s*"([A-Za-z0-9_.-]{1,40})"/.exec(body)?.[1] ?? '-';
}

async function request(url: string, init: RequestInit, opts: { label: string; retries?: number; auth?: boolean }): Promise<Response> {
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const headers = new Headers(init.headers);
    if (opts.auth !== false) headers.set('Authorization', `Bearer ${await accessToken()}`);
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    } catch {
      if (attempt < retries) { await sleep(400 * 2 ** attempt); continue; }
      throw new DriveError('network', 'Koneksi ke Google Drive terputus.');
    }
    if (response.ok || response.status === 308) return response;
    if ((response.status === 429 || response.status >= 500) && attempt < retries) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    const body = await response.text().catch(() => '');
    // Alasan Google (notFound, insufficientFilePermissions, ...) dicatat agar kegagalan
    // bisa didiagnosis dari log server tanpa menulis ID, email, atau isi file.
    console.error('gdrive', opts.label, response.status, googleReason(body));
    throw driveError(response.status, body);
  }
}

export type DriveMeta = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  trashed?: boolean;
  parents?: string[];
  permissions?: { type?: string; role?: string }[];
  capabilities?: { canAddChildren?: boolean };
};

export async function getMeta(fileId: string): Promise<DriveMeta> {
  const fields = 'id,name,mimeType,size,trashed,parents,permissions(type,role),capabilities(canAddChildren)';
  const response = await request(`${API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`, { method: 'GET' }, { label: 'meta' });
  return (await response.json()) as DriveMeta;
}

// Metadata file hasil unggahan: hanya field dasar. `permissions` dan `capabilities`
// menyangkut folder tujuan; memintanya untuk file yang dibuat di folder milik akun lain
// bisa dijawab Google sebagai 404 walau file benar-benar ada di sana.
export async function getFileMeta(fileId: string): Promise<DriveMeta> {
  const fields = 'id,name,mimeType,size,trashed,parents';
  const response = await request(`${API}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`, { method: 'GET' }, { label: 'file-meta' });
  return (await response.json()) as DriveMeta;
}

export function canWriteToFolder(meta: DriveMeta): boolean {
  return meta.mimeType === FOLDER_MIME && meta.trashed !== true && meta.capabilities?.canAddChildren === true;
}

// Folder eksternal wajib "Anyone with the link" + Editor (role writer).
export function hasAnyoneWriter(meta: DriveMeta): boolean {
  return (meta.permissions ?? []).some((permission) => permission.type === 'anyone' && permission.role === 'writer');
}

const escapeQuery = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export async function nameExists(parentId: string, name: string): Promise<boolean> {
  const query = `name='${escapeQuery(name)}' and '${escapeQuery(parentId)}' in parents and trashed=false`;
  const params = new URLSearchParams({ q: query, fields: 'files(id)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const response = await request(`${API}/files?${params}`, { method: 'GET' }, { label: 'list-name' });
  const json = (await response.json()) as { files?: { id: string }[] };
  return (json.files?.length ?? 0) > 0;
}

export async function uniqueName(parentId: string, name: string): Promise<string> {
  let candidate = name;
  for (let i = 2; i <= 20; i++) {
    if (!(await nameExists(parentId, candidate))) return candidate;
    candidate = collisionName(name, i);
  }
  return collisionName(name, Date.now() % 1000);
}

// Daftar file (bukan folder) dengan query bebas, dibatasi 10 hasil.
async function listFiles(query: string): Promise<DriveMeta[]> {
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,mimeType,size,trashed,parents)',
    pageSize: '10',
    orderBy: 'createdTime desc',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const response = await request(`${API}/files?${params}`, { method: 'GET' }, { label: 'find-files' });
  const json = (await response.json()) as { files?: DriveMeta[] };
  return json.files ?? [];
}

// ID dari respons sesi tidak selalu bisa dibaca langsung (file dibuat di folder milik
// akun lain dan Drive bisa belum konsisten sesaat). Cari lewat appProperties unggahan,
// lalu lewat nama di folder tujuan; hasil pencarian nama hanya diterima bila ukurannya sama
// supaya file lain dengan nama serupa tidak ikut terverifikasi.
export async function findUploadedFile(o: {
  uploadId: string; name: string; parentId: string; size: number;
}): Promise<DriveMeta | null> {
  const tagged = await listFiles(uploadTagQuery(o.uploadId));
  if (tagged[0]) return tagged[0];
  const named = await listFiles(fileInFolderQuery(o.name, o.parentId));
  return named.find((file) => Number(file.size ?? 0) === o.size) ?? null;
}

export type DriveFolder = { id: string; name: string; owners?: { displayName?: string; emailAddress?: string }[] };

// Anak folder langsung di bawah satu induk, hanya folder (bukan file), urut nama alami
// dan dibatasi 100 baris agar daftar tidak pernah tidak terbatas.
export async function listFolders(parentId: string): Promise<DriveFolder[]> {
  const query = `'${escapeQuery(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,owners(displayName,emailAddress))',
    pageSize: '100',
    orderBy: 'name_natural',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const response = await request(`${API}/files?${params}`, { method: 'GET' }, { label: 'list-folders' });
  const json = (await response.json()) as { files?: DriveFolder[] };
  return json.files ?? [];
}

export async function createFolder(name: string, parentId: string): Promise<{ id: string; name: string }> {
  const body = { name, mimeType: FOLDER_MIME, parents: [parentId] };
  const response = await request(`${API}/files?fields=id,name&supportsAllDrives=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body),
  }, { label: 'create-folder' });
  return (await response.json()) as { id: string; name: string };
}

export async function createResumableSession(o: { name: string; parentId: string; mimeType: string; uploadId: string; origin: string }): Promise<string> {
  const response = await request(`${UPLOAD}?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: 'POST',
    // Origin peramban pengunggah ikut pada inisialisasi sesi: Google mengikat sesi resumable
    // ke origin itu dan hanya mengirim header CORS untuk origin tersebut. Tanpa Origin,
    // respons PUT dari peramban gagal dibaca walau Drive sudah menerima dan membuat file.
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': o.mimeType, Origin: o.origin },
    body: JSON.stringify({
      name: o.name,
      parents: [o.parentId],
      mimeType: o.mimeType,
      appProperties: { eclipseUploadId: o.uploadId },
    }),
  }, { label: 'init-session' });
  const location = response.headers.get('location');
  if (!location) throw new DriveError('server', 'Google Drive tidak memberi sesi unggah.');
  return location;
}

export type SessionState = { done: false; bytesUploaded: number } | { done: true; fileId: string } | { expired: true };

export async function sessionStatus(sessionUri: string, totalSize: number): Promise<SessionState> {
  if (!sessionUri.startsWith('https://www.googleapis.com/')) throw new DriveError('server', 'Sesi unggah tidak valid.');
  let response: Response;
  try {
    response = await fetch(sessionUri, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${totalSize}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DriveError('network', 'Status sesi unggah tidak dapat diperiksa.');
  }
  if (response.status === 404 || response.status === 410) return { expired: true };
  if (response.status === 308) {
    // Range "bytes=0-N" berarti N+1 byte tersimpan. Tanpa Range, protokol berarti
    // belum ada byte yang dikonfirmasi, jadi jangan pernah menganggap potongan terakhir diterima.
    const match = /bytes=0-(\d+)/.exec(response.headers.get('range') ?? '');
    return { done: false, bytesUploaded: match ? Number(match[1]) + 1 : 0 };
  }
  if (response.ok) {
    const json = (await response.json().catch(() => null)) as { id?: string } | null;
    if (!json?.id) throw new DriveError('server', 'Google Drive tidak mengembalikan file.');
    return { done: true, fileId: json.id };
  }
  throw driveError(response.status, '');
}

// true hanya bila sesi benar-benar tidak ada lagi. Kegagalan jaringan atau status lain
// dilaporkan false agar pemanggil tidak menganggap pembatalan berhasil.
export async function cancelSession(sessionUri: string): Promise<boolean> {
  if (!sessionUri.startsWith('https://www.googleapis.com/')) return false;
  try {
    const response = await fetch(sessionUri, { method: 'DELETE', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (response.ok || response.status === 404 || response.status === 410) return true;
    console.error('gdrive cancel session', response.status);
    return false;
  } catch {
    console.error('gdrive cancel session: koneksi gagal');
    return false;
  }
}

export async function deleteFile(fileId: string): Promise<void> {
  await request(`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: 'DELETE' }, { label: 'delete' });
}

// Memindahkan file antar folder. Dipakai untuk folder eksternal: file dibuat di folder
// penampung milik akun server, lalu dipindahkan setelah metadata dan signature lolos.
// Hasilnya mengembalikan `parents` Drive agar pemanggil bisa memastikan perpindahannya.
export async function moveFile(fileId: string, o: { fromParentId: string; toParentId: string }): Promise<string[]> {
  const params = new URLSearchParams({
    addParents: o.toParentId, removeParents: o.fromParentId, supportsAllDrives: 'true', fields: 'id,parents',
  });
  const response = await request(`${API}/files/${encodeURIComponent(fileId)}?${params}`, { method: 'PATCH' }, { label: 'move-file' });
  const json = (await response.json().catch(() => null)) as { parents?: string[] } | null;
  return json?.parents ?? [];
}

// Beberapa KB pertama untuk verifikasi signature setelah file benar-benar ada di Drive.
export async function headBytes(fileId: string, max = 4096): Promise<Uint8Array> {
  const response = await request(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    method: 'GET', headers: { Range: `bytes=0-${max - 1}` },
  }, { label: 'read-head' });
  return new Uint8Array(await response.arrayBuffer());
}

// File uji multipart: hanya metadata + isi kecil, tanpa menyentuh file pengguna.
export async function createTextFile(parentId: string, name: string, text: string): Promise<{ id: string }> {
  const boundary = `eclipse${crypto.randomUUID().replace(/-/g, '')}`;
  const metadata = JSON.stringify({ name, parents: [parentId], mimeType: 'text/plain' });
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', metadata,
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', text,
    `--${boundary}--`, '',
  ].join('\r\n');
  const response = await request(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }, { label: 'dummy-upload' });
  const json = (await response.json()) as { id?: string };
  if (!json.id) throw new DriveError('server', 'Google Drive tidak memberi ID file uji.');
  return { id: json.id };
}

// Mengganti nama file/folder tanpa memindahkan atau menghapus isinya. Dipakai
// saat username berubah agar folder Library ikut berganti nama.
export async function renameFile(fileId: string, name: string): Promise<void> {
  await request(`${API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name }),
  }, { label: 'rename' });
}

// Unggahan kecil (gambar asli Library, maks 10 MB) lewat multipart: satu
// permintaan, tanpa sesi resumable yang hanya berguna untuk file besar.
export async function uploadBytes(o: {
  parentId: string; name: string; mimeType: string; bytes: Uint8Array;
}): Promise<{ id: string; name: string }> {
  const boundary = `eclipse${crypto.randomUUID().replace(/-/g, '')}`;
  const encoder = new TextEncoder();
  const metadata = JSON.stringify({ name: o.name, parents: [o.parentId], mimeType: o.mimeType });
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
    + `--${boundary}\r\nContent-Type: ${o.mimeType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Blob([head, new Uint8Array(o.bytes), tail]);
  const response = await request(
    `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name`,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    { label: 'upload-bytes' },
  );
  const json = (await response.json()) as { id?: string; name?: string };
  if (!json.id) throw new DriveError('server', 'Google Drive tidak memberi ID file.');
  return { id: json.id, name: json.name ?? o.name };
}

// Isi file asli untuk unduhan HD. Token tidak pernah keluar dari server.
export async function fileResponse(fileId: string): Promise<Response> {
  return request(`${API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { method: 'GET' }, { label: 'download' });
}

export const fileLink = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
export const folderLink = (folderId: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
