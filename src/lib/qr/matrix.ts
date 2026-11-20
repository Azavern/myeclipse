import * as QRCode from 'qrcode';

export { validateQrText } from './text';

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
