import type { IconName } from '@/components/ui/icon';

// Akses yang dapat diatur Ketua untuk jabatan di bawahnya (migrasi 0016).
// `members.request` sengaja terpisah dari `members.manage`: yang pertama hanya
// mengajukan promosi/demosi jabatan dan menunggu persetujuan Ketua.
export type AccessKey = 'class.manage' | 'schedule.manage' | 'events.manage' | 'tasks.manage' | 'members.request' | 'kas.manage';

export const ACCESS_ITEMS: { key: AccessKey; label: string; hint: string; icon: IconName }[] = [
  { key: 'class.manage', label: 'Kelola kelas', hint: 'Profil kelas, tema, dan visibilitas halaman.', icon: 'book' },
  { key: 'schedule.manage', label: 'Kelola jadwal', hint: 'Tambah, ubah, dan hapus jadwal kuliah atau kegiatan.', icon: 'calendar' },
  { key: 'events.manage', label: 'Kelola event', hint: 'Tambah, ubah, dan hapus event kelas.', icon: 'calendar-days' },
  { key: 'tasks.manage', label: 'Kelola tugas', hint: 'Tambah, ubah, dan hapus tugas.', icon: 'tasks' },
  {
    key: 'members.request', label: 'Kelola anggota', icon: 'users',
    hint: 'Hanya mengajukan promosi atau demosi jabatan anggota. Setiap pengajuan baru berlaku setelah disetujui Ketua.',
  },
  {
    key: 'kas.manage', label: 'Kelola kas', icon: 'wallet',
    hint: 'Membuat tagihan, memverifikasi setoran, mencatat pemasukan/pengeluaran, dan mengelola QRIS. Ketua tetap dapat melihat tanpa izin ini.',
  },
];

// Akses penuh kelola anggota; hanya Ketua yang memegangnya dan tidak dapat diberikan lewat checklist.
export const FULL_MEMBER_ACCESS = { key: 'members.manage', label: 'Kelola anggota penuh' } as const;

// Akses tambahan untuk anggota dengan role `member` (migrasi 0026). Berbeda dari
// akses jabatan: tugas yang dibuat tetap menunggu persetujuan Ketua, dan event
// hanya dapat diubah untuk event buatannya sendiri.
export const MEMBER_ACCESS_ITEMS = [
  { key: 'events.manage', label: 'Kelola event', hint: 'Membuat event sendiri dan mengatur fotonya.' },
  { key: 'tasks.manage', label: 'Kelola tugas', hint: 'Membuat tugas; tugas baru tampil setelah disetujui Ketua.' },
] as const;
