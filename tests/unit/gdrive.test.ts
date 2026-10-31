import { describe, expect, it } from 'vitest';
import {
  buildFinalName, categoryForExt, checkFile, collisionName, detectSignature, parseFolderRef, uploadSlotLimit,
} from '../../src/lib/gdrive/files';
import { allowsGoogleUpload, buildCsp } from '../../src/lib/security/csp';

const MiB = 1024 * 1024;
const text = (value: string) => new TextEncoder().encode(value);
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
// Box ftyp ISO-BMFF minimal; `leadingFree` menambahkan box free sebelum ftyp.
function mp4(brand: string, leadingFree = 0): Uint8Array {
  const bytes = new Uint8Array(leadingFree + 16);
  const view = new DataView(bytes.buffer);
  if (leadingFree > 0) view.setUint32(0, leadingFree);
  view.setUint32(leadingFree, 16);
  [...'ftyp', ...brand].forEach((ch, i) => { bytes[leadingFree + 4 + i] = ch.charCodeAt(0); });
  return bytes;
}

describe('kategori dan ekstensi Google Drive', () => {
  it('memetakan ekstensi yang diizinkan ke kategori yang benar', () => {
    expect(categoryForExt('jpg')).toBe('pictures');
    expect(categoryForExt('heif')).toBe('pictures');
    expect(categoryForExt('mkv')).toBe('videos');
    expect(categoryForExt('m4a')).toBe('audios');
    expect(categoryForExt('docx')).toBe('documents');
    expect(categoryForExt('rar')).toBe('archives');
  });
  it('menolak ekstensi di luar allowlist', () => {
    for (const ext of ['exe', 'sh', 'js', 'html', 'svg', 'php']) expect(categoryForExt(ext), ext).toBeNull();
  });
});

describe('nama file final', () => {
  it('mempertahankan nama asli dan menambahkan timestamp', () => {
    expect(buildFinalName({ originalName: 'Laporan Praktikum.pdf', timestamp: '2026-10-31 10.00.00', ext: 'pdf' }))
      .toBe('Laporan Praktikum — 2026-10-31 10.00.00.pdf');
  });
  it('nama custom tetap memakai ekstensi dari format yang divalidasi', () => {
    expect(buildFinalName({ originalName: 'Laporan Praktikum.pdf', customName: 'Laporan Final', timestamp: 'x', ext: 'pdf' }))
      .toBe('Laporan Final.pdf');
    expect(buildFinalName({ originalName: 'Laporan.pdf', customName: 'Laporan Final.exe', timestamp: 'x', ext: 'pdf' }))
      .toBe('Laporan Final.pdf');
  });
  it('membersihkan path traversal dan karakter berbahaya', () => {
    const name = buildFinalName({ originalName: '../../etc/passwd.pdf', timestamp: 'x', ext: 'pdf' });
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name.endsWith('.pdf')).toBe(true);
  });
  it('memotong nama panjang dan menangani benturan nama', () => {
    const long = buildFinalName({ originalName: `${'a'.repeat(300)}.pdf`, timestamp: 'x', ext: 'pdf' });
    expect(long.length).toBeLessThanOrEqual(180);
    expect(collisionName('Laporan.pdf', 2)).toBe('Laporan (2).pdf');
    expect(collisionName('Laporan Final 2026.pdf', 3).endsWith('.pdf')).toBe(true);
  });
});

describe('parser folder Google Drive', () => {
  it('menerima ID langsung dan variasi link folder', () => {
    expect(parseFolderRef('1AbCdEfGhIjKlMnOpQrSt')).toBe('1AbCdEfGhIjKlMnOpQrSt');
    expect(parseFolderRef('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt?usp=sharing'))
      .toBe('1AbCdEfGhIjKlMnOpQrSt');
    expect(parseFolderRef('https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOpQrSt/'))
      .toBe('1AbCdEfGhIjKlMnOpQrSt');
  });
  it('menolak link file, dokumen, host lain, dan URL tidak aman', () => {
    for (const value of [
      'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view',
      'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrSt/edit',
      'https://example.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt',
      'http://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt',
      'bukan id atau link',
    ]) expect(parseFolderRef(value), value).toBeNull();
  });
});

describe('signature file', () => {
  it('mengenali format yang diizinkan', () => {
    expect(detectSignature(jpeg)).toBe('jpeg');
    expect(detectSignature(png)).toBe('png');
    expect(detectSignature(pdf)).toBe('pdf');
    expect(detectSignature(text('halo, ini catatan biasa'))).toBe('text');
  });
  it('mengenali MP4 dengan brand selain daftar umum', () => {
    // intro.mp4 memakai brand iso4 dan sebelumnya ditolak sebagai tidak dikenali.
    expect(detectSignature(mp4('iso4'))).toBe('mp4');
    expect(checkFile({ name: 'intro.mp4', size: 16, bytes: mp4('iso4'), maxBytes: MiB, archivesEnabled: true }))
      .toMatchObject({ ok: true, ext: 'mp4', category: 'videos', signature: 'mp4' });
    expect(detectSignature(mp4('iso4', 8))).toBe('mp4');
    expect(detectSignature(mp4('qt  '))).toBe('mov');
    expect(detectSignature(mp4('M4A '))).toBe('m4a');
  });
  it('menolak file yang isinya tidak sesuai ekstensi', () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect(detectSignature(exe)).toBeNull();
    expect(checkFile({ name: 'aman.pdf', size: 4, bytes: exe, maxBytes: 500 * MiB, archivesEnabled: true }))
      .toEqual({ ok: false, issue: 'signature' });
    expect(checkFile({ name: 'gambar.png', size: pdf.length, bytes: pdf, maxBytes: 500 * MiB, archivesEnabled: true }))
      .toEqual({ ok: false, issue: 'mismatch' });
  });
  it('menolak file kosong, terlalu besar, dan arsip saat dinonaktifkan', () => {
    expect(checkFile({ name: 'a.pdf', size: 0, bytes: pdf, maxBytes: MiB, archivesEnabled: true }))
      .toEqual({ ok: false, issue: 'empty' });
    expect(checkFile({ name: 'a.pdf', size: 2 * MiB, bytes: pdf, maxBytes: MiB, archivesEnabled: true }))
      .toEqual({ ok: false, issue: 'too_large' });
    expect(checkFile({ name: 'a.zip', size: 4, bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), maxBytes: MiB, archivesEnabled: false }))
      .toEqual({ ok: false, issue: 'archive_disabled' });
  });
  it('menerima file yang ekstensi dan signature-nya konsisten', () => {
    expect(checkFile({ name: 'Laporan.pdf', size: pdf.length, bytes: pdf, maxBytes: MiB, archivesEnabled: true }))
      .toMatchObject({ ok: true, ext: 'pdf', category: 'documents', mime: 'application/pdf' });
  });
});

describe('slot unggahan bersamaan', () => {
  it('membatasi sesuai kelas ukuran', () => {
    expect(uploadSlotLimit(100 * MiB)).toBe(1);
    expect(uploadSlotLimit(99 * MiB)).toBe(2);
    expect(uploadSlotLimit(51 * MiB)).toBe(2);
    expect(uploadSlotLimit(50 * MiB)).toBe(3);
    expect(uploadSlotLimit(26 * MiB)).toBe(3);
    expect(uploadSlotLimit(10 * MiB)).toBe(5);
    expect(uploadSlotLimit(MiB)).toBe(10);
    expect(uploadSlotLimit(1024)).toBe(10);
  });
});

describe('CSP unggahan langsung Google Drive', () => {
  const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? '';
  it('hanya /cloud yang membuka koneksi ke googleapis.com', () => {
    expect(allowsGoogleUpload('/cloud')).toBe(true);
    for (const path of ['/', '/clouds', '/settings/cloud', '/inventory']) {
      expect(allowsGoogleUpload(path), path).toBe(false);
    }
  });
  it('menambah connect-src tanpa membuka skrip Google', () => {
    const csp = buildCsp({ nonce: 'n', googleUpload: true });
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://www.googleapis.com");
    expect(directive(csp, 'script-src')).not.toContain('googleapis');
    expect(directive(csp, 'connect-src')).not.toContain('accounts.google.com');
  });
});
