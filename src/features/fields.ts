import type { IconName } from '@/components/ui/icon';
import { DAYS, hm, utcToLocal } from '@/lib/time';
import { AUDIENCE_LABEL, audienceOptions } from '@/lib/visibility/audiences';

// Definisi satu isian formulir. `max`/`min` mencerminkan skema Zod di server (UX saja; server tetap memvalidasi).
export type Field = {
  name: string; label: string;
  type: 'text' | 'email' | 'url' | 'textarea' | 'datetime' | 'time' | 'date' | 'password' | 'select';
  required?: boolean; hint?: string; options?: [string, string][]; value?: string;
  max?: number; min?: number; group?: string; full?: boolean; placeholder?: string; autoComplete?: string;
};
export type Row = Record<string, unknown>;
const s = (r: Row | null, k: string) => (r?.[k] == null ? '' : String(r[k]));

// tz diterima agar bentuknya sama dengan eventFields/taskFields; jadwal kuliah memakai jam dinding tanpa konversi.
export const scheduleFields = (r: Row | null, _tz?: string): Field[] => [
  { name: 'title', label: 'Mata kuliah / kegiatan', type: 'text', required: true, max: 120, full: true, value: s(r, 'title'), group: 'Informasi utama' },
  { name: 'type', label: 'Jenis', type: 'select', value: s(r, 'type') || 'class', options: [['class', 'Kuliah'], ['activity', 'Kegiatan']] },
  { name: 'semester', label: 'Semester', type: 'text', required: true, hint: 'Contoh: 2026/2027 Ganjil', max: 20, value: s(r, 'semester') },
  { name: 'day_of_week', label: 'Hari', type: 'select', value: s(r, 'day_of_week') || '1', options: DAYS.map((d, i) => [String(i + 1), d]), group: 'Waktu dan tempat' },
  { name: 'start_time', label: 'Jam mulai', type: 'time', required: true, value: r ? hm(s(r, 'start_time')) : '' },
  { name: 'end_time', label: 'Jam selesai', type: 'time', required: true, value: r ? hm(s(r, 'end_time')) : '' },
  { name: 'location', label: 'Lokasi', type: 'text', max: 120, value: s(r, 'location') },
  { name: 'url', label: 'Tautan (https)', type: 'url', max: 2048, placeholder: 'https://', value: s(r, 'url'), group: 'Tambahan' },
  { name: 'description', label: 'Keterangan', type: 'textarea', max: 1000, full: true, value: s(r, 'description') },
];
export const eventFields = (r: Row | null, tz: string): Field[] => [
  { name: 'title', label: 'Judul event', type: 'text', required: true, max: 120, full: true, value: s(r, 'title'), group: 'Informasi utama' },
  { name: 'start_at', label: 'Mulai', type: 'datetime', required: true, value: r ? utcToLocal(s(r, 'start_at'), tz) : '', group: 'Waktu dan tempat' },
  { name: 'end_at', label: 'Selesai', type: 'datetime', required: true, value: r ? utcToLocal(s(r, 'end_at'), tz) : '' },
  { name: 'location', label: 'Lokasi', type: 'text', max: 120, value: s(r, 'location') },
  { name: 'organizer', label: 'Penyelenggara', type: 'text', max: 80, value: s(r, 'organizer') },
  { name: 'url', label: 'Tautan (https)', type: 'url', max: 2048, placeholder: 'https://', value: s(r, 'url'), group: 'Tambahan' },
  { name: 'description', label: 'Deskripsi', type: 'textarea', max: 2000, full: true, value: s(r, 'description') },
];
export const taskFields = (r: Row | null, tz: string): Field[] => [
  { name: 'title', label: 'Judul tugas', type: 'text', required: true, max: 120, full: true, value: s(r, 'title'), group: 'Informasi utama' },
  { name: 'course', label: 'Mata kuliah', type: 'text', required: true, max: 80, value: s(r, 'course') },
  { name: 'target', label: 'Untuk', type: 'text', required: true, max: 80, value: s(r, 'target') || 'Seluruh kelas' },
  { name: 'deadline', label: 'Tenggat', type: 'datetime', required: true, value: r ? utcToLocal(s(r, 'deadline'), tz) : '', group: 'Tenggat dan status' },
  { name: 'status', label: 'Status', type: 'select', value: s(r, 'status') || 'active',
    options: [['active', 'Aktif'], ['completed', 'Selesai'], ['archived', 'Diarsipkan']] },
  { name: 'url', label: 'Tautan (https)', type: 'url', max: 2048, placeholder: 'https://', value: s(r, 'url'), group: 'Tambahan' },
  { name: 'description', label: 'Keterangan', type: 'textarea', max: 2000, full: true, value: s(r, 'description') },
];

const itemVisibility = (r: Row | null): Field => ({
  name: 'visibility', label: 'Siapa yang boleh melihat', type: 'select', value: s(r, 'visibility'), full: true,
  hint: 'Tidak pernah lebih terbuka dari halaman Anggota (diatur Ketua).',
  options: [['', 'Ikuti pengaturan bagian ini'], ...audienceOptions()],
});
export const KIND_LABEL: Record<string, string> = {
  project: 'Proyek', achievement: 'Prestasi', organization: 'Organisasi', competition: 'Lomba',
  creative_work: 'Karya kreatif', certificate: 'Sertifikat', experience: 'Pengalaman',
};
export const KIND_ICON: Record<string, IconName> = {
  project: 'folder', achievement: 'trophy', organization: 'flag', competition: 'award',
  creative_work: 'sparkles', certificate: 'award', experience: 'briefcase',
};
export const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram', linkedin: 'LinkedIn', github: 'GitHub', tiktok: 'TikTok', x: 'X', website: 'Situs web', custom: 'Lainnya',
};
export const PLATFORM_ICON: Record<string, IconName> = {
  instagram: 'camera', linkedin: 'briefcase', github: 'code', tiktok: 'music', x: 'at', website: 'globe', custom: 'link',
};
export const portfolioFields = (r: Row | null, _tz?: string): Field[] => [
  { name: 'title', label: 'Judul', type: 'text', required: true, max: 100, full: true, value: s(r, 'title') },
  { name: 'kind', label: 'Jenis', type: 'select', value: s(r, 'kind') || 'project', options: Object.entries(KIND_LABEL) },
  { name: 'occurred_on', label: 'Tanggal', type: 'date', required: true, value: s(r, 'occurred_on') },
  { name: 'url', label: 'Tautan (https)', type: 'url', max: 2048, placeholder: 'https://', full: true, value: s(r, 'url') },
  { name: 'description', label: 'Deskripsi', type: 'textarea', max: 1000, full: true, value: s(r, 'description') },
  itemVisibility(r),
];
export const socialFields = (r: Row | null, _tz?: string): Field[] => [
  { name: 'platform', label: 'Platform', type: 'select', value: s(r, 'platform') || 'instagram', options: Object.entries(PLATFORM_LABEL) },
  { name: 'label', label: 'Nama tautan', type: 'text', max: 40, hint: 'Wajib bila platform "Lainnya".', value: s(r, 'label') },
  { name: 'url', label: 'Tautan (https)', type: 'url', required: true, max: 2048, placeholder: 'https://', full: true, value: s(r, 'url') },
  itemVisibility(r),
];
export const profileFields = (r: Row | null): Field[] => [
  { name: 'full_name', label: 'Nama lengkap', type: 'text', required: true, max: 80, value: s(r, 'full_name') },
  { name: 'nickname', label: 'Nama panggilan', type: 'text', max: 40, value: s(r, 'nickname') },
  { name: 'bio', label: 'Bio', type: 'textarea', max: 500, full: true, hint: 'Ceritakan dirimu dalam beberapa kalimat.', value: s(r, 'bio') },
];

const MEMBER_GROUP = (key: string) => (key.startsWith('field.') ? 'Data profil' : 'Bagian profil');
export const visibilityFields = (keys: [string, string][], current: Record<string, string>): Field[] =>
  keys.map(([key, label]) => ({
    name: `v:${key}`, label, type: 'select' as const, value: current[key] ?? '', group: MEMBER_GROUP(key),
    options: [['', 'Gunakan default kelas'], ...audienceOptions()],
  }));
export { AUDIENCE_LABEL };

export const accountFields = (): Field[] => [
  { name: 'current', label: 'Kata sandi lama', type: 'password', required: true, max: 72, full: true, autoComplete: 'current-password' },
  { name: 'password', label: 'Kata sandi baru', type: 'password', required: true, min: 10, max: 72, hint: 'Minimal 10 karakter.', autoComplete: 'new-password' },
  { name: 'confirm', label: 'Ulangi kata sandi baru', type: 'password', required: true, max: 72, autoComplete: 'new-password' },
];
export const accountEmailFields = (): Field[] => [
  { name: 'email', label: 'Email baru', type: 'email', required: true, max: 254, full: true, placeholder: 'nama@email.com', autoComplete: 'email', hint: 'Langsung berlaku; tidak ada email konfirmasi.' },
  { name: 'current', label: 'Kata sandi saat ini', type: 'password', required: true, max: 72, full: true, autoComplete: 'current-password', hint: 'Untuk memastikan yang mengganti memang kamu.' },
];
export const classFields = (r: Row | null, _tz?: string): Field[] => [
  { name: 'name', label: 'Nama kelas', type: 'text', required: true, max: 60, value: s(r, 'name'), group: 'Identitas' },
  { name: 'code', label: 'Kode kelas', type: 'text', max: 20, hint: '2–20 karakter: huruf, angka, tanda hubung.', value: s(r, 'code') },
  { name: 'tagline', label: 'Tagline', type: 'text', max: 120, full: true, value: s(r, 'tagline') },
  { name: 'description', label: 'Deskripsi', type: 'textarea', max: 800, full: true, value: s(r, 'description') },
  { name: 'highlight_text', label: 'Teks sorotan', type: 'text', max: 160, value: s(r, 'highlight_text'), group: 'Sorotan dan waktu' },
  { name: 'highlight_url', label: 'Tautan sorotan (https)', type: 'url', max: 2048, placeholder: 'https://', value: s(r, 'highlight_url') },
  { name: 'timezone', label: 'Zona waktu kelas', type: 'select', value: s(r, 'timezone') || 'Asia/Jakarta', full: true,
    hint: 'Mengubah ini hanya mengubah tampilan waktu, bukan data tersimpan.',
    options: [['Asia/Jakarta', 'WIB (Asia/Jakarta)'], ['Asia/Makassar', 'WITA (Asia/Makassar)'], ['Asia/Jayapura', 'WIT (Asia/Jayapura)']] },
];

const CLASS_GROUPS = ['Halaman', 'Bagian Beranda', 'Halaman Kelas'] as const;
const classGroup = (key: string) => (key.startsWith('page.') ? CLASS_GROUPS[0] : key.startsWith('section.home') ? CLASS_GROUPS[1] : CLASS_GROUPS[2]);
export const classVisibilityFields = (
  keys: [string, string, string][], current: Record<string, string>, effective: Record<string, string>,
  allowed: (widest: string) => readonly string[],
): Field[] => keys.map(([key, label, widest]): Field => ({
  name: `v:${key}`, label, type: 'select', value: current[key] ?? '', group: classGroup(key),
  hint: `Efektif saat ini: ${AUDIENCE_LABEL[effective[key] ?? ''] ?? '—'}. Batas terluas: ${AUDIENCE_LABEL[widest] ?? widest}.`,
  options: [['', 'Gunakan default'], ...allowed(widest).map((a): [string, string] => [a, AUDIENCE_LABEL[a] ?? a])],
})).sort((a, b) => CLASS_GROUPS.indexOf(a.group as never) - CLASS_GROUPS.indexOf(b.group as never));

export const memberIdentityFields = (r: Row | null, _tz?: string): Field[] => [
  { name: 'full_name', label: 'Nama lengkap', type: 'text', required: true, max: 80, value: s(r, 'full_name') },
  { name: 'username', label: 'Username', type: 'text', required: true, min: 3, max: 30, hint: '3–30 karakter: huruf kecil, angka, garis bawah. Menjadi alamat profil.', value: s(r, 'username') },
];
export const memberRoleFields = (r: Row | null, roles: [string, string][]): Field[] => [
  { name: 'role_id', label: 'Role', type: 'select', value: s(r, 'role_id'), options: roles, full: true,
    hint: 'Ketua hanya satu: memilih Ketua memindahkan Ketua sebelumnya ke Wakil Ketua. Batas: Wakil Ketua 3, Sekretaris 5, Bendahara 2.' },
];
export const memberStatusFields = (r: Row | null): Field[] => [
  { name: 'status', label: 'Status akun', type: 'select', value: s(r, 'status') === 'inactive' ? 'inactive' : 'active', full: true,
    hint: 'Nonaktif: tidak bisa masuk dan hanya melihat konten publik. Bisa diaktifkan kembali.',
    options: [['active', 'Aktif'], ['inactive', 'Nonaktif']] },
];
