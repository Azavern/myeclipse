export const AUDIENCES = ['public', 'authenticated', 'class_member', 'class_admin', 'self'] as const;
export const AUDIENCE_LABEL: Record<string, string> = {
  public: 'Siapa saja (publik)', authenticated: 'Semua yang sudah masuk',
  class_member: 'Anggota kelas', class_admin: 'Pengelola kelas', self: 'Hanya saya',
};
export const audienceOptions = (): [string, string][] => AUDIENCES.map((a) => [a, AUDIENCE_LABEL[a] ?? a]);
// Kunci visibility milik anggota (scope member) yang boleh diatur dari profil; harus ada di visibility_catalog.
export const MEMBER_KEYS: [string, string][] = [
  ['field.member.avatar', 'Foto profil'], ['field.member.nickname', 'Nama panggilan'], ['field.member.bio', 'Bio'],
  ['section.member.portfolio', 'Portofolio (semua item)'], ['section.member.social', 'Tautan sosial (semua tautan)'],
];

// Kunci scope class yang boleh diatur Ketua: [key, label, widest]. Harus sama dengan visibility_catalog (migrasi 0008).
export const CLASS_KEYS: [string, string, string][] = [
  ['page.home', 'Halaman Beranda', 'public'], ['section.home.identity', 'Beranda: identitas kelas', 'public'],
  ['section.home.schedule', 'Beranda: jadwal hari ini', 'public'], ['section.home.events', 'Beranda: event', 'public'],
  ['section.home.tasks', 'Beranda: tugas', 'class_member'], ['section.home.overview', 'Beranda: ringkasan', 'public'],
  ['section.home.activity', 'Beranda: aktivitas', 'public'], ['section.home.members', 'Beranda: anggota terbaru', 'public'],
  ['page.class_about', 'Halaman Kelas', 'public'], ['section.class.links', 'Tautan kelas', 'public'],
  ['field.class.code', 'Kode kelas', 'public'], ['field.class.tagline', 'Tagline', 'public'],
  ['field.class.description', 'Deskripsi kelas', 'public'], ['field.class.highlight', 'Sorotan', 'public'],
  ['field.class.logo', 'Logo', 'public'], ['field.class.cover', 'Cover', 'public'],
  ['page.schedule', 'Halaman Jadwal', 'public'], ['page.events', 'Halaman Event', 'public'],
  ['page.tasks', 'Halaman Tugas', 'class_member'], ['page.members', 'Halaman Anggota', 'public'],
];
// Pilihan yang sah untuk satu kunci kelas: tidak lebih luas dari `widest`, dan `self` tidak berlaku untuk kelas.
export const allowedFor = (widest: string) => AUDIENCES.filter((a) => AUDIENCES.indexOf(a) >= AUDIENCES.indexOf(widest as never) && a !== 'self');
