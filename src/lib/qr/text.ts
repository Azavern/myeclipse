import { QR_MAX_TEXT_BYTES, textByteLength } from './style';

// Validasi teks dipisah dari encoder supaya halaman tamu bisa memakainya tanpa
// mengirim modul pembuat matriks QR ke browser.
export function validateQrText(text: string): string | null {
  if (!text.trim()) return 'Isi teks atau tautan yang ingin dijadikan QR.';
  if (textByteLength(text) > QR_MAX_TEXT_BYTES) {
    return `Teks terlalu panjang (${textByteLength(text)} byte). Maksimal ${QR_MAX_TEXT_BYTES} byte pada koreksi galat H.`;
  }
  return null;
}
