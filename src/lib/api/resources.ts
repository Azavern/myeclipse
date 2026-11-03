// Katalog resource Developer API. Modul ini dipakai server dan UI, jadi tidak
// boleh mengimpor server-only atau Node API.

export const API_ACTIONS = ['read', 'create', 'update', 'delete'] as const;
export type ApiAction = (typeof API_ACTIONS)[number];

export type ApiResourceKey =
  | 'class_profile'
  | 'class_links'
  | 'members'
  | 'portfolio'
  | 'social_links'
  | 'schedules'
  | 'events'
  | 'tasks'
  | 'knowledge'
  | 'visibility'
  | 'activity'
  | 'inventory';

export type ScopeValue = 'none' | 'all' | 'selected' | 'self' | 'public';

export type ApiResource = {
  key: ApiResourceKey;
  label: string;
  description: string;
  actions: readonly ApiAction[];
  /** Punya cakupan subjek (anggota/baris) terpisah dari izin operasi. */
  scoped: boolean;
  scopeOptions: readonly ScopeValue[];
};

const ALL_SCOPES: readonly ScopeValue[] = ['none', 'all', 'selected', 'self', 'public'];

// Operasi yang benar-benar tersedia di domain. Centang yang tidak didukung tidak
// dirender dan tidak disimpan.
export const API_RESOURCES: readonly ApiResource[] = [
  {
    key: 'class_profile', label: 'Profil kelas',
    description: 'Nama, kode, tagline, deskripsi, sorotan, dan zona waktu kelas.',
    actions: ['read', 'update'], scoped: false, scopeOptions: [],
  },
  {
    key: 'class_links', label: 'Tautan kelas',
    description: 'Tautan sosial resmi yang tampil di halaman Kelas.',
    actions: ['read', 'create', 'update', 'delete'], scoped: false, scopeOptions: [],
  },
  {
    key: 'members', label: 'Anggota',
    description: 'Daftar anggota, jabatan, status keanggotaan, dan profil yang boleh dibaca. Hanya baca.',
    actions: ['read'], scoped: true, scopeOptions: ALL_SCOPES,
  },
  {
    key: 'portfolio', label: 'Portofolio',
    description: 'Item portofolio (tanpa gambar). Penulisan hanya untuk data pemilik key.',
    actions: ['read', 'create', 'update', 'delete'], scoped: true, scopeOptions: ALL_SCOPES,
  },
  {
    key: 'social_links', label: 'Tautan sosial',
    description: 'Tautan sosial anggota (tanpa media). Penulisan hanya untuk data pemilik key.',
    actions: ['read', 'create', 'update', 'delete'], scoped: true, scopeOptions: ALL_SCOPES,
  },
  {
    key: 'schedules', label: 'Jadwal',
    description: 'Jadwal kuliah mingguan per semester.',
    actions: ['read', 'create', 'update', 'delete'], scoped: false, scopeOptions: [],
  },
  {
    key: 'events', label: 'Event',
    description: 'Kegiatan kelas (tanpa gambar sampul).',
    actions: ['read', 'create', 'update', 'delete'], scoped: false, scopeOptions: [],
  },
  {
    key: 'tasks', label: 'Tugas',
    description: 'Tugas, mata kuliah, tenggat, dan status.',
    actions: ['read', 'create', 'update', 'delete'], scoped: false, scopeOptions: [],
  },
  {
    key: 'knowledge', label: 'Pengetahuan',
    description: 'Entri pengetahuan yang sudah published atau milik pemilik key. Hanya baca.',
    actions: ['read'], scoped: false, scopeOptions: [],
  },
  {
    key: 'visibility', label: 'Visibilitas',
    description: 'Aturan visibilitas tingkat kelas.',
    actions: ['read', 'update'], scoped: false, scopeOptions: [],
  },
  {
    key: 'activity', label: 'Aktivitas',
    description: 'Jejak aktivitas kelas yang dibuat trigger. Hanya baca.',
    actions: ['read'], scoped: false, scopeOptions: [],
  },
  {
    key: 'inventory', label: 'Inventory',
    description: 'Daftar tautan pribadi pemilik key. inv_key tidak termasuk; hanya cakupan pemilik.',
    actions: ['read', 'create', 'delete'], scoped: true,
    scopeOptions: ['none', 'self'],
  },
];

export const RESOURCE_BY_KEY = new Map(API_RESOURCES.map((resource) => [resource.key, resource]));

export const SCOPED_RESOURCES = API_RESOURCES.filter((resource) => resource.scoped);

export const SCOPE_LABEL: Record<ScopeValue, string> = {
  none: 'Tidak ada akses',
  all: 'Seluruh kelas',
  selected: 'Anggota tertentu',
  self: 'Pemilik API key',
  public: 'Data publik saja',
};

export const DEFAULT_SCOPE: Record<string, ScopeValue> = Object.fromEntries(
  SCOPED_RESOURCES.map((resource) => [resource.key, 'none']),
);

export const API_RATE_LIMIT_PER_MINUTE = 120;
