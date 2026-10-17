export type ImageType = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };
const ascii = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.slice(s, e));

// Tipe ditentukan dari isi file; `file.type` dan nama file diabaikan. SVG sengaja tidak diterima (blueprint §13.4).
export function detectImage(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}
