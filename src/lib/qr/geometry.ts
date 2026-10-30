import { QR_BOX, QR_BORDER, type QrIconShape } from './style';

// Geometri yang dipakai renderer. Semua angka diturunkan dari qr_custom.py:
// box 12 px, quiet zone 4 modul, padding titik 12% (minimal 1 px), balok 55%
// tinggi modul, ikon 23% lebar QR, dan ketebalan border 50% jari-jari bentuk.
export const DOT_PAD = Math.max(1, Math.trunc(QR_BOX * 0.12));
export const BLOCK_HEIGHT = Math.max(2, Math.trunc(QR_BOX * 0.55));
export const BLOCK_RADIUS = Math.trunc(BLOCK_HEIGHT / 2);
export const ICON_FOOTPRINT_RATIO = 0.23;
export const ICON_ROUNDED_RADIUS = 0.2;
export const ICON_GAP_RATIO = 0.05;
export const BORDER_MAX_RATIO = 0.5;

export const qrPixelSize = (moduleCount: number): number => (moduleCount + 2 * QR_BORDER) * QR_BOX;

// Tiga finder pattern 7x7, memakai koordinat modul termasuk quiet zone.
export function isFinderCell(x: number, y: number, size: number): boolean {
  const b = QR_BORDER;
  if (b <= x && x < b + 7 && b <= y && y < b + 7) return true;
  if (size - b - 7 <= x && x < size - b && b <= y && y < b + 7) return true;
  if (b <= x && x < b + 7 && size - b - 7 <= y && y < size - b) return true;
  return false;
}

export const finderOrigins = (size: number): [number, number][] => [
  [QR_BORDER, QR_BORDER],
  [size - QR_BORDER - 7, QR_BORDER],
  [QR_BORDER, size - QR_BORDER - 7],
];

export const iconFootprint = (qrWidth: number): number => Math.trunc(qrWidth * ICON_FOOTPRINT_RATIO);

// Segitiga sama sisi dengan alas = sisi area ikon, dipusatkan vertikal.
export function triangleGeometry(size: number) {
  const height = (size * Math.sqrt(3)) / 2;
  const top = (size - height) / 2;
  const points: [number, number][] = [
    [size / 2, top],
    [0, top + height],
    [size, top + height],
  ];
  return { points, centroid: [size / 2, top + (2 * height) / 3] as [number, number], inradius: height / 3 };
}

export function shapeInradius(shape: QrIconShape, size: number): number {
  return shape === 'triangle' ? triangleGeometry(size).inradius : size / 2;
}

export function shapeCenter(shape: QrIconShape, size: number): [number, number] {
  if (shape === 'triangle') return triangleGeometry(size).centroid;
  return [size / 2, size / 2];
}

// Nilai 1-100 dipetakan ke ketebalan px; area ikon tetap, ketebalan tumbuh ke
// dalam sehingga total area QR yang tertutup tidak berubah.
export function borderThickness(shape: QrIconShape, size: number, percent: number): number {
  const p = Math.min(100, Math.max(1, Math.round(percent)));
  return Math.max(1, shapeInradius(shape, size) * BORDER_MAX_RATIO * (p / 100));
}

export function iconGap(size: number, fit: 'crop' | 'shrink', gap: boolean): number {
  return fit === 'crop' && gap ? Math.max(2, size * ICON_GAP_RATIO) : 0;
}

export function iconBadgeSize(qrWidth: number): number {
  return iconFootprint(qrWidth);
}

// Kotak pembatas bentuk yang di-inset, dipakai mode crop supaya gambar memenuhi
// bentuk (bukan seluruh kotak area ikon).
export function shapeBounds(shape: QrIconShape, size: number, inset: number): [number, number, number, number] {
  if (shape !== 'triangle') return [inset, inset, size - inset, size - inset];
  const { points, centroid, inradius } = triangleGeometry(size);
  const k = Math.max(0, (inradius - inset) / inradius);
  const [cx, cy] = centroid;
  const scaled = points.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as const);
  const xs = scaled.map(([x]) => x);
  const ys = scaled.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function roundedCornerRadius(size: number, inset: number): number {
  return Math.max(0, size * ICON_ROUNDED_RADIUS - inset);
}
