// Pesan singkat setelah aksi berhasil. Server Action me-redirect dengan ?flash=<kunci>; FlashToast (klien) menampilkannya sekali
// lalu menghapus parameter dari URL. Hanya kunci yang dikenal yang dirender, jadi teks tidak bisa disuntikkan lewat URL.
export const FLASH = {
  saved: 'Perubahan disimpan.',
  created: 'Berhasil ditambahkan.',
  deleted: 'Data dihapus.',
  uploaded: 'Gambar diperbarui.',
  removed: 'Gambar dihapus.',
  password: 'Kata sandi diperbarui.',
} as const;

export type FlashKey = keyof typeof FLASH;

export const isFlashKey = (k: string | null): k is FlashKey => k !== null && Object.prototype.hasOwnProperty.call(FLASH, k);

export const withFlash = (to: string, key: FlashKey) => {
  const hash = to.indexOf('#');
  const base = hash === -1 ? to : to.slice(0, hash);
  const tail = hash === -1 ? '' : to.slice(hash);
  return `${base}${base.includes('?') ? '&' : '?'}flash=${key}${tail}`;
};
