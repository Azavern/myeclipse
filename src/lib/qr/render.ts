import { QR_BOX, QR_BORDER, type QrBarOrientation, type QrIconShape, type QrIconStyle, type QrStyle } from './style';
import {
  BLOCK_HEIGHT, BLOCK_RADIUS, DOT_PAD,
  borderThickness, finderOrigins, iconFootprint, iconGap, isFinderCell, qrPixelSize,
  roundedCornerRadius, shapeBounds, shapeCenter, triangleGeometry,
} from './geometry';
import { encodeQr, type QrMatrix } from './matrix';

export type QrRenderInput = {
  text: string;
  style: QrStyle;
  icon?: ImageBitmap | null;
};

export type QrRenderResult = { width: number; moduleCount: number; version: number };

const SUPERSAMPLE = 4;

function surface(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  return ctx;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function shapePath(ctx: CanvasRenderingContext2D, shape: QrIconShape, size: number, inset: number) {
  ctx.beginPath();
  if (shape === 'circle') {
    const radius = Math.max(0, size / 2 - inset);
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    return;
  }
  if (shape === 'triangle') {
    const { points, centroid, inradius } = triangleGeometry(size);
    const k = Math.max(0, (inradius - inset) / inradius);
    const scaled = points.map(([x, y]) => [
      centroid[0] + (x - centroid[0]) * k,
      centroid[1] + (y - centroid[1]) * k,
    ] as const);
    const first = scaled[0];
    if (!first) return;
    ctx.moveTo(first[0], first[1]);
    for (const [x, y] of scaled.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    return;
  }
  const radius = shape === 'rounded' ? roundedCornerRadius(size, inset) : 0;
  ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, radius);
}

// Mask digambar 4x lalu diperkecil, sama seperti SUPERSAMPLE di qr_custom.py,
// supaya tepi bentuk ikon halus.
function shapeMaskHires(shape: QrIconShape, size: number, inset: number): HTMLCanvasElement {
  const big = surface(size * SUPERSAMPLE);
  const bigCtx = context(big);
  bigCtx.fillStyle = '#ffffff';
  shapePath(bigCtx, shape, size * SUPERSAMPLE, inset * SUPERSAMPLE);
  bigCtx.fill();
  return big;
}

function shapeMask(shape: QrIconShape, size: number, inset: number): HTMLCanvasElement {
  const out = surface(size);
  context(out).drawImage(shapeMaskHires(shape, size, inset), 0, 0, size, size);
  return out;
}

function applyMask(layer: HTMLCanvasElement, mask: HTMLCanvasElement) {
  const ctx = context(layer);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function placeCover(icon: ImageBitmap, shape: QrIconShape, size: number, inset: number): HTMLCanvasElement {
  const layer = surface(size);
  const ctx = context(layer);
  const [bx0, by0, bx1, by1] = shapeBounds(shape, size, inset);
  const bw = Math.max(1, bx1 - bx0);
  const bh = Math.max(1, by1 - by0);
  const scale = Math.max(bw / icon.width, bh / icon.height);
  const width = Math.max(1, Math.ceil(icon.width * scale));
  const height = Math.max(1, Math.ceil(icon.height * scale));
  ctx.drawImage(icon, bx0 + (bw - width) / 2, by0 + (bh - height) / 2, width, height);
  applyMask(layer, shapeMask(shape, size, inset));
  return layer;
}

function placeContain(icon: ImageBitmap, shape: QrIconShape, size: number, inset: number): HTMLCanvasElement {
  const high = shapeMaskHires(shape, size, inset);
  const highCtx = context(high);
  const pixels = highCtx.getImageData(0, 0, high.width, high.height).data;
  const [cx, cy] = shapeCenter(shape, size);

  const fits = (scale: number): boolean => {
    const halfW = (icon.width * scale) / 2 + 1;
    const halfH = (icon.height * scale) / 2 + 1;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = Math.trunc((cx + sx * halfW) * SUPERSAMPLE);
        const y = Math.trunc((cy + sy * halfH) * SUPERSAMPLE);
        if (x < 0 || y < 0 || x >= high.width || y >= high.height) return false;
        if ((pixels[(y * high.width + x) * 4 + 3] ?? 0) < 128) return false;
      }
    }
    return true;
  };

  let scale = size / Math.max(icon.width, icon.height);
  if (!fits(scale)) {
    let low = 0;
    let top = scale;
    for (let i = 0; i < 24; i++) {
      const mid = (low + top) / 2;
      if (fits(mid)) low = mid;
      else top = mid;
    }
    scale = low;
  }

  const layer = surface(size);
  const width = Math.max(1, Math.round(icon.width * scale));
  const height = Math.max(1, Math.round(icon.height * scale));
  context(layer).drawImage(icon, Math.round(cx - width / 2), Math.round(cy - height / 2), width, height);
  return layer;
}

// Transformasi jarak Euclidean 1D (Felzenszwalb & Huttenlocher), port dari
// fungsi _squared_edt_1d di qr_custom.py.
function squaredEdt1d(f: Float64Array): Float64Array {
  const n = f.length;
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  z[0] = -Infinity;
  z[1] = Infinity;
  let k = 0;
  for (let q = 1; q < n; q++) {
    let p = v[k] ?? 0;
    let s = ((f[q]! + q * q) - (f[p]! + p * p)) / (2 * q - 2 * p);
    while (s <= (z[k] ?? 0)) {
      k--;
      p = v[k] ?? 0;
      s = ((f[q]! + q * q) - (f[p]! + p * p)) / (2 * q - 2 * p);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  const out = new Float64Array(n);
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? Infinity) < q) k++;
    const p = v[k] ?? 0;
    out[q] = (q - p) ** 2 + f[p]!;
  }
  return out;
}

// Alpha hasil dilasi memakai jarak Euclidean; ini yang membuat outline
// mengikuti siluet gambar, bukan sekadar kotak di belakangnya.
function dilateAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const far = 1e20;
  const grid = new Float64Array(width * height);
  const column = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) column[y] = (alpha[y * width + x] ?? 0) > 8 ? 0 : far;
    const distance = squaredEdt1d(column);
    for (let y = 0; y < height; y++) grid[y * width + x] = distance[y]!;
  }
  const out = new Uint8ClampedArray(width * height);
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = grid[y * width + x]!;
    const distance = squaredEdt1d(row);
    for (let x = 0; x < width; x++) {
      const a = Math.round(255 * Math.max(0, Math.min(1, radius + 0.5 - Math.sqrt(distance[x]!))));
      out[y * width + x] = a;
    }
  }
  return out;
}

function buildOutlineBadge(icon: ImageBitmap, size: number, style: QrIconStyle): HTMLCanvasElement {
  const thickness = Math.round(borderThickness('outline', size, style.thickness));
  const box = Math.max(1, size - 2 * thickness);
  const scale = Math.min(box / icon.width, box / icon.height);
  const width = Math.max(1, Math.round(icon.width * scale));
  const height = Math.max(1, Math.round(icon.height * scale));
  const x = Math.trunc((size - width) / 2);
  const y = Math.trunc((size - height) / 2);

  const iconLayer = surface(size);
  const iconCtx = context(iconLayer);
  iconCtx.drawImage(icon, x, y, width, height);
  const image = iconCtx.getImageData(0, 0, size, size);
  const alpha = new Uint8ClampedArray(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3] ?? 0;

  const dilated = dilateAlpha(alpha, size, size, thickness);
  const [r, g, b] = hexRgb(style.borderColor);
  const silhouette = new ImageData(size, size);
  for (let i = 0; i < dilated.length; i++) {
    silhouette.data[i * 4] = r;
    silhouette.data[i * 4 + 1] = g;
    silhouette.data[i * 4 + 2] = b;
    silhouette.data[i * 4 + 3] = dilated[i]!;
  }

  const badge = surface(size);
  const badgeCtx = context(badge);
  badgeCtx.putImageData(silhouette, 0, 0);
  badgeCtx.drawImage(iconLayer, 0, 0);
  return badge;
}

function buildFramedBadge(icon: ImageBitmap, size: number, style: QrIconStyle, backColor: string): HTMLCanvasElement {
  const badge = surface(size);
  const ctx = context(badge);
  const thickness = borderThickness(style.shape, size, style.thickness);
  const gap = iconGap(size, style.fit, style.gap);

  ctx.fillStyle = style.borderColor;
  shapePath(ctx, style.shape, size, 0);
  ctx.fill();

  ctx.fillStyle = backColor;
  shapePath(ctx, style.shape, size, thickness);
  ctx.fill();

  const photo = style.fit === 'crop'
    ? placeCover(icon, style.shape, size, thickness + gap)
    : placeContain(icon, style.shape, size, thickness);
  ctx.drawImage(photo, 0, 0);
  return badge;
}

function drawCenterIcon(ctx: CanvasRenderingContext2D, qrWidth: number, icon: ImageBitmap, style: QrIconStyle, backColor: string) {
  const size = iconFootprint(qrWidth);
  if (size < 8) return;
  const badge = style.shape === 'outline'
    ? buildOutlineBadge(icon, size, style)
    : buildFramedBadge(icon, size, style, backColor);
  const pos = Math.trunc((qrWidth - size) / 2);
  ctx.drawImage(badge, pos, pos);
}

function drawSquares(ctx: CanvasRenderingContext2D, matrix: QrMatrix, fillColor: string) {
  ctx.fillStyle = fillColor;
  for (let y = 0; y < matrix.size; y++) {
    const row = matrix.modules[y];
    for (let x = 0; x < matrix.size; x++) {
      if (!row?.[x]) continue;
      ctx.fillRect((x + QR_BORDER) * QR_BOX, (y + QR_BORDER) * QR_BOX, QR_BOX, QR_BOX);
    }
  }
}

function drawFinder(ctx: CanvasRenderingContext2D, gridX: number, gridY: number, fillColor: string, backColor: string) {
  const px = gridX * QR_BOX;
  const py = gridY * QR_BOX;
  ctx.fillStyle = fillColor;
  roundRect(ctx, px, py, 7 * QR_BOX - 1, 7 * QR_BOX - 1, Math.trunc(QR_BOX * 1.5));
  ctx.fill();
  ctx.fillStyle = backColor;
  roundRect(ctx, px + QR_BOX, py + QR_BOX, 5 * QR_BOX - 1, 5 * QR_BOX - 1, QR_BOX);
  ctx.fill();
  ctx.fillStyle = fillColor;
  roundRect(ctx, px + 2 * QR_BOX, py + 2 * QR_BOX, 3 * QR_BOX - 1, 3 * QR_BOX - 1, Math.trunc(QR_BOX * 0.5));
  ctx.fill();
}

function drawCircular(ctx: CanvasRenderingContext2D, matrix: QrMatrix, fillColor: string, backColor: string, total: number) {
  const radius = (QR_BOX - 1 - 2 * DOT_PAD) / 2;
  ctx.fillStyle = fillColor;
  for (let y = 0; y < matrix.size; y++) {
    const row = matrix.modules[y];
    for (let x = 0; x < matrix.size; x++) {
      if (!row?.[x] || isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) continue;
      const cx = (x + QR_BORDER) * QR_BOX + (QR_BOX - 1) / 2;
      const cy = (y + QR_BORDER) * QR_BOX + (QR_BOX - 1) / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const [gx, gy] of finderOrigins(total)) drawFinder(ctx, gx, gy, fillColor, backColor);
}

// Orientasi vertikal: geometri horizontal diputar 90°, tebal dan ujung tetap sama.
function drawVerticalBlocks(ctx: CanvasRenderingContext2D, matrix: QrMatrix, fillColor: string, backColor: string, total: number) {
  const hpad = Math.trunc((QR_BOX - BLOCK_HEIGHT) / 2);
  ctx.fillStyle = fillColor;
  for (let x = 0; x < matrix.size; x++) {
    let y = 0;
    while (y < matrix.size) {
      if (!matrix.modules[y]?.[x] || isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) {
        y++;
        continue;
      }
      const start = y;
      while (y < matrix.size && matrix.modules[y]?.[x] && !isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) y++;
      const y1 = (start + QR_BORDER) * QR_BOX;
      const y2 = (y + QR_BORDER) * QR_BOX - 1;
      const x1 = (x + QR_BORDER) * QR_BOX + hpad;
      roundRect(ctx, x1, y1, BLOCK_HEIGHT, y2 - y1 + 1, BLOCK_RADIUS);
      ctx.fill();
    }
  }
  for (const [gx, gy] of finderOrigins(total)) drawFinder(ctx, gx, gy, fillColor, backColor);
}

// Balok diagonal 45°: modul bersebelahan digabung searah orientasi. Digambar 2–4×
// lalu diperkecil, sama seperti render_diagonal_layer di skrip referensi.
function drawDiagonalBlocks(ctx: CanvasRenderingContext2D, matrix: QrMatrix, fillColor: string, backColor: string, total: number, orientation: QrBarOrientation) {
  const width = total * QR_BOX;
  const ss = Math.max(2, Math.min(4, Math.floor(6000 / width)));
  const layer = surface(width * ss);
  const lctx = context(layer);
  lctx.fillStyle = fillColor;

  const root2 = Math.SQRT2;
  const pitch = (QR_BOX * root2) * ss;
  const thick = (0.55 * QR_BOX / root2) * ss;
  const half = Math.max(pitch / 2, thick / 2);
  const r = thick / 2;
  const stepY = orientation === 'diagonal_down' ? 1 : -1;
  const ux = 1 / root2;
  const uy = stepY / root2;
  const nx = -uy;
  const ny = ux;

  const dark = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < total && y < total
    && !isFinderCell(x, y, total) && !!matrix.modules[y - QR_BORDER]?.[x - QR_BORDER];
  const center = (x: number, y: number): [number, number] =>
    [(x + 0.5) * QR_BOX * ss, (y + 0.5) * QR_BOX * ss];

  const bar = (x0: number, y0: number, count: number) => {
    const [cx0, cy0] = center(x0, y0);
    const [cx1, cy1] = center(x0 + count - 1, y0 + stepY * (count - 1));
    let ax = cx0 - ux * half;
    let ay = cy0 - uy * half;
    let bx = cx1 + ux * half;
    let by = cy1 + uy * half;

    // Ujung kapsul: badan balok dipendekkan, lalu ditutup dua lingkaran.
    ax += ux * r;
    ay += uy * r;
    bx -= ux * r;
    by -= uy * r;
    lctx.beginPath();
    lctx.arc(ax, ay, r, 0, Math.PI * 2);
    lctx.fill();
    lctx.beginPath();
    lctx.arc(bx, by, r, 0, Math.PI * 2);
    lctx.fill();
    lctx.beginPath();
    lctx.moveTo(ax + nx * r, ay + ny * r);
    lctx.lineTo(bx + nx * r, by + ny * r);
    lctx.lineTo(bx - nx * r, by - ny * r);
    lctx.lineTo(ax - nx * r, ay - ny * r);
    lctx.closePath();
    lctx.fill();
  };

  for (let y = 0; y < total; y++) {
    for (let x = 0; x < total; x++) {
      if (!dark(x, y) || dark(x - 1, y - stepY)) continue;
      let count = 1;
      while (dark(x + count, y + stepY * count)) count++;
      bar(x, y, count);
    }
  }

  ctx.drawImage(layer, 0, 0, width, width);
  for (const [gx, gy] of finderOrigins(total)) drawFinder(ctx, gx, gy, fillColor, backColor);
}

function drawBlocks(ctx: CanvasRenderingContext2D, matrix: QrMatrix, fillColor: string, backColor: string, total: number) {
  const vpad = Math.trunc((QR_BOX - BLOCK_HEIGHT) / 2);
  ctx.fillStyle = fillColor;
  for (let y = 0; y < matrix.size; y++) {
    const row = matrix.modules[y];
    let x = 0;
    while (x < matrix.size) {
      if (!row?.[x] || isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) {
        x++;
        continue;
      }
      const start = x;
      while (x < matrix.size && row?.[x] && !isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) x++;
      const x1 = (start + QR_BORDER) * QR_BOX;
      const x2 = (x + QR_BORDER) * QR_BOX - 1;
      const y1 = (y + QR_BORDER) * QR_BOX + vpad;
      roundRect(ctx, x1, y1, x2 - x1 + 1, BLOCK_HEIGHT, BLOCK_RADIUS);
      ctx.fill();
    }
  }
  for (const [gx, gy] of finderOrigins(total)) drawFinder(ctx, gx, gy, fillColor, backColor);
}

// Menggambar QR ke canvas dengan geometri yang sama seperti skrip CLI:
// kotak 12 px, quiet zone 4 modul, finder rounded, lalu ikon 23% di tengah.
export function renderQr(canvas: HTMLCanvasElement, input: QrRenderInput): QrRenderResult {
  const matrix = encodeQr(input.text);
  const total = matrix.size + 2 * QR_BORDER;
  const width = qrPixelSize(matrix.size);
  canvas.width = width;
  canvas.height = width;
  const ctx = context(canvas);

  ctx.fillStyle = input.style.backColor;
  ctx.fillRect(0, 0, width, width);

  const custom = input.style.mode === 'custom';
  if (custom && input.style.dotShape === 'circle') {
    drawCircular(ctx, matrix, input.style.fillColor, input.style.backColor, total);
  } else if (custom && input.style.dotShape === 'block') {
    const orientation = input.style.barOrientation ?? 'horizontal';
    if (orientation === 'horizontal') drawBlocks(ctx, matrix, input.style.fillColor, input.style.backColor, total);
    else if (orientation === 'vertical') drawVerticalBlocks(ctx, matrix, input.style.fillColor, input.style.backColor, total);
    else drawDiagonalBlocks(ctx, matrix, input.style.fillColor, input.style.backColor, total, orientation);
  } else {
    drawSquares(ctx, matrix, input.style.fillColor);
  }

  if (custom && input.icon) drawCenterIcon(ctx, width, input.icon, input.style.icon ?? {
    shape: 'square', fit: 'crop', gap: false, thickness: 1, borderColor: '#ffffff',
  }, input.style.backColor);

  return { width, moduleCount: total, version: matrix.version };
}
