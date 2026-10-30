const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Membaca lebar/tinggi dari chunk IHDR. Dipakai untuk memastikan unggahan
// benar-benar PNG persegi seukuran keluaran renderer QR (348–2220 px).
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

// Renderer selalu memakai modul 12 px dan quiet zone 4 modul, jadi sisi PNG
// harus (modul + 8) × 12 dengan modul QR versi 1–40 (21–177, kelipatan 4).
export function isQrPngSize(width: number, height: number): boolean {
  if (width !== height || width % 12 !== 0) return false;
  const modules = width / 12 - 8;
  return modules >= 21 && modules <= 177 && (modules - 21) % 4 === 0;
}
