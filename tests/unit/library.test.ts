import { describe, expect, it } from 'vitest';
import {
  contentDisposition, isLibraryVisibility, libraryDownloadName, libraryDriveName,
  libraryFolderName, libraryTitle, LIBRARY_MAX_TITLE,
} from '../../src/lib/library/shared';

describe('Library media', () => {
  it('judul diambil dari nama file tanpa ekstensi dan pemisah dirapikan', () => {
    expect(libraryTitle('foto_liburan-bali.PNG')).toBe('foto liburan bali');
    expect(libraryTitle('.jpg')).toBe('Gambar');
    expect(libraryTitle('a'.repeat(200) + '.jpg')).toHaveLength(LIBRARY_MAX_TITLE);
    expect(libraryTitle('a'.repeat(200) + '.jpg').endsWith('…')).toBe(true);
  });

  it('nama folder Drive aman dan dibatasi 80 karakter', () => {
    expect(libraryFolderName('budi')).toBe('budi');
    expect(libraryFolderName('a/b:c*d?"<e>|f')).toBe('a-b-c-d-e-f');
    expect(libraryFolderName('   ')).toBe('anggota');
    expect(libraryFolderName('x'.repeat(200))).toHaveLength(80);
  });

  it('nama file asli mempertahankan ekstensi (png tetap png)', () => {
    expect(libraryDriveName('Foto Liburan.PNG', 'png')).toBe('Foto Liburan.png');
    expect(libraryDriveName('a/b.jpg', 'jpg')).toBe('a-b.jpg');
    const long = libraryDriveName('x'.repeat(300) + '.webp', 'webp');
    expect(long.length).toBeLessThanOrEqual(180);
    expect(long.endsWith('.webp')).toBe(true);
  });

  it('nama unduhan memakai ekstensi asli, atau judul bila nama asli tidak ada', () => {
    expect(libraryDownloadName('foto.png', 'Judul', 'png')).toBe('foto.png');
    expect(libraryDownloadName(null, 'Judul Kita', 'jpg')).toBe('Judul Kita.jpg');
    expect(libraryDownloadName(null, 'Judul', null)).toBe('Judul.webp');
  });

  it('Content-Disposition memuat fallback ASCII dan nama UTF-8 tanpa baris baru', () => {
    const header = contentDisposition('Foto "A" ✓.png');
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain('%E2%9C%93');
    expect(header).not.toContain('\n');
    expect(header).not.toContain('\r');
  });

  it('hanya nilai visibilitas yang dikenal diterima', () => {
    for (const value of ['private', 'all', 'specific']) expect(isLibraryVisibility(value)).toBe(true);
    for (const value of ['public', 'authenticated', '', null, undefined, 1]) {
      expect(isLibraryVisibility(value), String(value)).toBe(false);
    }
  });
});
