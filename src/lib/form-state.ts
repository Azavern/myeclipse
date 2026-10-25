import type { ZodError } from 'zod';

export type FormState = { error?: string; fieldErrors?: Record<string, string[]>; values?: Record<string, string> } | null;
export const FORBIDDEN = 'Kamu tidak punya izin untuk tindakan ini.';

export function formValues(fd: FormData) { // echo input non-rahasia agar isi form tidak hilang saat error
  const v: Record<string, string> = {};
  fd.forEach((x, k) => { if (typeof x === 'string') v[k] = x; });
  return v;
}
export const failState = (error: string, fd: FormData): FormState => ({ error, values: formValues(fd) });
export const invalid = (e: ZodError, fd: FormData): FormState => ({
  error: 'Periksa kembali isian yang ditandai.',
  fieldErrors: e.flatten().fieldErrors as Record<string, string[]>, values: formValues(fd),
});
export function dbMessage(e: { code?: string }): string { // blueprint §9.7; detail teknis hanya di log
  if (e.code === '42501') return FORBIDDEN;
  if (e.code === '23514' || e.code === '22P02' || e.code === '22007' || e.code === '22023') return 'Isian tidak memenuhi aturan.';
  if (e.code === '40001') return 'Entri ini sudah diubah di tempat lain. Muat ulang sebelum menyimpan.';
  if (e.code === 'EC055') return 'Akses edit untuk entri ini sudah ada.';
  if (e.code === 'EC056') return 'Permintaan edit untuk entri ini masih menunggu.';
  if (e.code === 'EC057') return 'Permintaan ini sudah diputuskan atau tidak dapat diteruskan.';
  if (e.code === 'EC050' || e.code === 'EC051' || e.code === 'EC052' || e.code === 'EC053' || e.code === 'EC054') return 'Tindakan ini tidak diizinkan untuk entri ini.';
  if (e.code === '23505') return 'Data yang sama sudah ada.';
  if (e.code === 'P0002') return 'Data tidak ditemukan.';
  if (e.code === 'EC020') return 'Akun ini sudah aktif.';
  if (e.code === 'EC021') return 'Perubahan status tidak diizinkan.';
  if (e.code === 'EC030' || e.code === 'EC031' || e.code === 'EC032') return 'Kolom ini tidak dapat diubah.';
  if (e.code?.startsWith('EC01')) return 'Pengaturan visibilitas tidak valid.';
  if (e.code === 'EC040') return 'Batas jumlah item tercapai.';
  if (e.code === 'EC001') return 'Kelas harus punya minimal satu pengelola aktif.';
  return 'Terjadi kesalahan. Coba lagi.';
}
