import { describe, expect, it } from 'vitest';
import { pngDimensions } from '../../src/lib/qr/png';
import { renderQrPng } from '../../src/lib/qr/server-render';
import { DEFAULT_CUSTOM_STYLE, DEFAULT_QR_STYLE, composeQrStyle } from '../../src/lib/qr/style';

describe('renderer QR server', () => {
  it('menghasilkan PNG RGBA persegi dengan versi yang sama seperti matriks', () => {
    const result = renderQrPng({ text: 'https://example.com', style: DEFAULT_QR_STYLE });
    expect(result.version).toBe(3);
    expect(result.width).toBe(444);
    expect(pngDimensions(result.bytes)).toEqual({ width: 444, height: 444 });
    expect(Array.from(result.bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('mendukung custom beserta ikon RGBA', () => {
    const side = 8;
    const data = new Uint8Array(side * side * 4);
    for (let i = 0; i < side * side; i++) {
      data[i * 4] = 220;
      data[i * 4 + 1] = 60;
      data[i * 4 + 2] = 40;
      data[i * 4 + 3] = 255;
    }
    const style = composeQrStyle({
      mode: 'custom',
      dotShape: 'circle',
      barOrientation: 'horizontal',
      fillColor: '#4da3d9',
      backColor: '#ffffff',
      icon: { ...DEFAULT_CUSTOM_STYLE.icon!, shape: 'rounded', fit: 'crop', gap: true, thickness: 20 },
    });
    const result = renderQrPng({ text: 'https://example.com/icon', style, icon: { width: side, height: side, data } });
    expect(pngDimensions(result.bytes)).toEqual({ width: result.width, height: result.width });
    expect(result.bytes.byteLength).toBeGreaterThan(1000);
  });

  it('mode normal tidak membawa pengaturan bentuk custom', () => {
    const style = composeQrStyle({
      mode: 'normal',
      dotShape: 'block',
      barOrientation: 'diagonal_down',
      fillColor: '#000000',
      backColor: '#ffffff',
      icon: DEFAULT_CUSTOM_STYLE.icon,
    });
    expect(style).toEqual({ mode: 'normal', dotShape: 'square', fillColor: '#000000', backColor: '#ffffff' });
  });
});
