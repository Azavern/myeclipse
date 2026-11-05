// Resize/crop gambar di peramban. Hanya untuk UX dan ukuran unggahan; server
// tetap memvalidasi tipe, ukuran, dan isi berkas.

export type ImageSpec = { maxSide?: number; crop?: [number, number] };

export async function compressImage(file: File, spec: ImageSpec = {}): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  try {
    let [sx, sy, sw, sh, dw, dh] = [0, 0, bmp.width, bmp.height, 0, 0];
    if (spec.crop) {
      [dw, dh] = spec.crop;
      const ratio = dw / dh;
      if (sw / sh > ratio) {
        const nw = sh * ratio;
        sx = (sw - nw) / 2;
        sw = nw;
      } else {
        const nh = sw / ratio;
        sy = (sh - nh) / 2;
        sh = nh;
      }
    } else {
      const scale = Math.min(1, (spec.maxSide ?? 1600) / Math.max(sw, sh));
      dw = Math.round(sw * scale);
      dh = Math.round(sh * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    canvas.getContext('2d')?.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob) throw new Error('toBlob');
    return blob;
  } finally {
    bmp.close();
  }
}
