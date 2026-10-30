import * as QRCode from 'qrcode';
import { QR_MAX_TEXT_BYTES, textByteLength } from './style';

export type QrMatrix = {
  size: number;
  version: number;
  modules: boolean[][];
};

// Parameter sama dengan skrip: koreksi galat H, versi otomatis, tanpa batas
// manual. Matriks tanpa quiet zone; renderer menambahkan border 4 modul.
export function encodeQr(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const { modules } = qr;
  const rows = Array.from({ length: modules.size }, (_, y) =>
    Array.from({ length: modules.size }, (_, x) => modules.get(y, x) === 1));
  return { size: modules.size, version: qr.version, modules: rows };
}

// Pesan yang ditampilkan ke pengguna, bukan error internal library.
export function validateQrText(text: string): string | null {
  if (!text.trim()) return 'Isi teks atau tautan yang ingin dijadikan QR.';
  if (textByteLength(text) > QR_MAX_TEXT_BYTES) {
    return `Teks terlalu panjang (${textByteLength(text)} byte). Maksimal ${QR_MAX_TEXT_BYTES} byte pada koreksi galat H.`;
  }
  return null;
}
