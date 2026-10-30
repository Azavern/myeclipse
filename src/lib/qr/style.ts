import { contrastRatio } from '../theme/contrast';

// Nilai tetap mengikuti commands/qr_custom.py: modul 12 px, quiet zone 4 modul,
// koreksi galat H, dan warna bawaan biru #4da3d9 di atas putih.
export const QR_BOX = 12;
export const QR_BORDER = 4;
export const QR_TTL_HOURS = 6;
export const QR_MAX_TEXT_BYTES = 1200;
export const QR_MAX_ICON_BYTES = 5 * 1024 * 1024;

export type QrMode = 'normal' | 'custom';
export type QrDotShape = 'square' | 'circle' | 'block';
// Orientasi balok mengikuti qr_custom-add_direction_dots.py; bawaannya horizontal
// (rounded + varied) supaya keluaran balok yang lama tidak berubah.
export type QrBarOrientation = 'horizontal' | 'vertical' | 'diagonal_down' | 'diagonal_up';
export type QrIconShape = 'square' | 'rounded' | 'circle' | 'triangle' | 'outline';
export type QrIconFit = 'crop' | 'shrink';

export type QrIconStyle = {
  shape: QrIconShape;
  fit: QrIconFit;
  gap: boolean;
  thickness: number;
  borderColor: string;
};

export type QrStyle = {
  mode: QrMode;
  dotShape: QrDotShape;
  barOrientation?: QrBarOrientation;
  fillColor: string;
  backColor: string;
  icon?: QrIconStyle;
};

// Nama warna yang dikenal skrip CLI. Nilai hex-nya sama persis.
const NAMED_COLORS: Record<string, string> = {
  hitam: '#000000', black: '#000000',
  putih: '#ffffff', white: '#ffffff',
  biru: '#4da3d9', blue: '#4da3d9',
  merah: '#f62d16', red: '#f62d16',
  hijau: '#12d463', green: '#12d463',
  kuning: '#f1c40f', yellow: '#f1c40f',
  ungu: '#9b59b6', purple: '#9b59b6',
  orange: '#f39c12', orens: '#f39c12',
  abu: '#95a5a6', grey: '#95a5a6', gray: '#95a5a6',
};

export const QR_COLOR_PRESETS: { name: string; label: string; value: string }[] = [
  { name: 'hitam', label: 'Hitam', value: '#000000' },
  { name: 'putih', label: 'Putih', value: '#ffffff' },
  { name: 'biru', label: 'Biru', value: '#4da3d9' },
  { name: 'merah', label: 'Merah', value: '#f62d16' },
  { name: 'hijau', label: 'Hijau', value: '#12d463' },
  { name: 'kuning', label: 'Kuning', value: '#f1c40f' },
  { name: 'ungu', label: 'Ungu', value: '#9b59b6' },
  { name: 'orange', label: 'Orens', value: '#f39c12' },
  { name: 'abu', label: 'Abu', value: '#95a5a6' },
];

// Menerima nama warna skrip, #rgb, #rrggbb, atau tanpa tanda #. Selain itu null,
// supaya nilai yang tidak valid tidak pernah sampai ke canvas.
export function parseQrColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const named = NAMED_COLORS[value];
  if (named) return named;
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join('')}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return null;
}

// Kontras rendah tidak dilarang (skrip CLI juga tidak melarangnya), tetapi UI
// memperingatkannya karena QR bisa gagal dipindai.
export function qrContrast(fillColor: string, backColor: string): number {
  return contrastRatio(fillColor, backColor);
}

export const DEFAULT_QR_STYLE: QrStyle = {
  mode: 'normal',
  dotShape: 'square',
  fillColor: '#000000',
  backColor: '#ffffff',
};

export const DEFAULT_ICON_STYLE: QrIconStyle = {
  shape: 'rounded', fit: 'crop', gap: true, thickness: 20, borderColor: '#ffffff',
};

export const DEFAULT_CUSTOM_STYLE: QrStyle = {
  mode: 'custom',
  dotShape: 'square',
  barOrientation: 'horizontal',
  fillColor: '#4da3d9',
  backColor: '#ffffff',
  icon: DEFAULT_ICON_STYLE,
};

export function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
