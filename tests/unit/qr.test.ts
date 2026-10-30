import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUSTOM_STYLE, QR_BOX, QR_BORDER, QR_MAX_TEXT_BYTES, parseQrColor, qrContrast, textByteLength,
} from '../../src/lib/qr/style';
import {
  borderThickness, finderOrigins, iconFootprint, isFinderCell, qrPixelSize, shapeBounds, triangleGeometry,
} from '../../src/lib/qr/geometry';
import { encodeQr, validateQrText } from '../../src/lib/qr/matrix';
import { isQrPngSize, pngDimensions } from '../../src/lib/qr/png';

describe('palet QR', () => {
  it('menerima nama warna skrip dan menormalkan hex', () => {
    expect(parseQrColor('biru')).toBe('#4da3d9');
    expect(parseQrColor('ORENS')).toBe('#f39c12');
    expect(parseQrColor('#ABC')).toBe('#aabbcc');
    expect(parseQrColor('12d463')).toBe('#12d463');
  });
  it('menolak nilai yang bukan warna', () => {
    for (const value of ['', 'transparan', '#12', '#12345', 'javascript:alert(1)', '#gggggg']) {
      expect(parseQrColor(value), value).toBeNull();
    }
  });
  it('menghitung kontras dan byte UTF-8', () => {
    expect(qrContrast('#000000', '#ffffff')).toBeGreaterThan(20);
    expect(textByteLength('é')).toBe(2);
  });
});

describe('geometri QR', () => {
  it('ukuran modul dan quiet zone sama dengan skrip', () => {
    expect(QR_BOX).toBe(12);
    expect(QR_BORDER).toBe(4);
    expect(qrPixelSize(21)).toBe(348);
    expect(qrPixelSize(177)).toBe(2220);
    expect(iconFootprint(348)).toBe(80);
  });
  it('balok memakai orientasi horizontal sebagai bawaan', () => {
    expect(DEFAULT_CUSTOM_STYLE.barOrientation).toBe('horizontal');
  });
  it('finder pattern berada di tiga sudut', () => {
    expect(finderOrigins(37)).toEqual([[4, 4], [26, 4], [4, 26]]);
    expect(isFinderCell(4, 4, 37)).toBe(true);
    expect(isFinderCell(10, 10, 37)).toBe(true);
    expect(isFinderCell(11, 11, 37)).toBe(false);
    expect(isFinderCell(26, 4, 37)).toBe(true);
    expect(isFinderCell(26, 26, 37)).toBe(false);
  });
  it('ketebalan border tumbuh ke dalam dan segitiga punya inradius sendiri', () => {
    const triangle = triangleGeometry(100);
    expect(triangle.inradius).toBeCloseTo((100 * Math.sqrt(3) / 2) / 3);
    expect(borderThickness('circle', 100, 1)).toBe(1);
    expect(borderThickness('circle', 100, 100)).toBe(25);
    expect(borderThickness('triangle', 100, 100)).toBeCloseTo(triangle.inradius / 2);
    expect(shapeBounds('square', 100, 10)).toEqual([10, 10, 90, 90]);
    expect(shapeBounds('triangle', 100, 0)[1]).toBeGreaterThan(0);
  });
});

describe('matriks QR', () => {
  it('memakai koreksi galat H dan versi otomatis', () => {
    const matrix = encodeQr('https://example.com');
    expect(matrix.version).toBe(3);
    expect(matrix.size).toBe(29);
    expect(matrix.modules).toHaveLength(29);
    expect(matrix.modules[0]).toHaveLength(29);
  });
  it('menolak teks kosong dan teks melebihi batas byte', () => {
    expect(validateQrText('   ')).not.toBeNull();
    expect(validateQrText('a'.repeat(QR_MAX_TEXT_BYTES + 1))).not.toBeNull();
    expect(validateQrText('https://example.com')).toBeNull();
  });
});

describe('validasi PNG unggahan', () => {
  const png = (width: number, height: number) => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return bytes;
  };
  it('membaca dimensi dari IHDR', () => {
    expect(pngDimensions(png(348, 348))).toEqual({ width: 348, height: 348 });
  });
  it('menolak bukan PNG atau data pendek', () => {
    expect(pngDimensions(new Uint8Array(12))).toBeNull();
    expect(pngDimensions(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]))).toBeNull();
  });
  it('hanya menerima sisi (modul + 8) × 12 untuk versi 1-40', () => {
    expect(isQrPngSize(348, 348)).toBe(true);
    expect(isQrPngSize(444, 444)).toBe(true);
    expect(isQrPngSize(2220, 2220)).toBe(true);
    expect(isQrPngSize(348, 444)).toBe(false);
    expect(isQrPngSize(360, 360)).toBe(false);
    expect(isQrPngSize(324, 324)).toBe(false);
    expect(isQrPngSize(2232, 2232)).toBe(false);
  });
});
