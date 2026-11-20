import { deflateSync } from 'node:zlib';
import {
  DEFAULT_ICON_STYLE, QR_BOX, QR_BORDER,
  type QrBarOrientation, type QrDotShape, type QrIconShape, type QrIconStyle, type QrStyle,
} from './style';
import {
  BLOCK_HEIGHT, BLOCK_RADIUS, DOT_PAD,
  borderThickness, finderOrigins, iconFootprint, iconGap, isFinderCell, qrPixelSize,
  roundedCornerRadius, shapeBounds, shapeCenter, triangleGeometry,
} from './geometry';
import { encodeQr, type QrMatrix } from './matrix';

export type RgbaIcon = { width: number; height: number; data: Uint8Array };
export type QrServerRenderInput = { text: string; style: QrStyle; icon?: RgbaIcon | null };
export type QrServerRenderResult = { bytes: Uint8Array; width: number; version: number };

type Rgb = [number, number, number];

class Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, fill?: Rgb) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    if (fill) this.fill(fill);
  }

  fill([r, g, b]: Rgb) {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    }
  }

  blend(x: number, y: number, [r, g, b]: Rgb, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || alpha <= 0) return;
    const i = (y * this.width + x) * 4;
    const a = Math.min(1, alpha);
    const da = this.data[i + 3]! / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return;
    this.data[i] = Math.round((r * a + this.data[i]! * da * (1 - a)) / outA);
    this.data[i + 1] = Math.round((g * a + this.data[i + 1]! * da * (1 - a)) / outA);
    this.data[i + 2] = Math.round((b * a + this.data[i + 2]! * da * (1 - a)) / outA);
    this.data[i + 3] = Math.round(outA * 255);
  }

  clear() {
    this.data.fill(0);
  }

  fillRect(x: number, y: number, w: number, h: number, color: Rgb) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) this.blend(px, py, color);
    }
  }

  fillRoundRect(x: number, y: number, w: number, h: number, radius: number, color: Rgb) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      const cy = py + 0.5;
      for (let px = x0; px < x1; px++) {
        const cx = px + 0.5;
        if (!insideRoundedRect(cx, cy, x, y, w, h, r)) continue;
        this.blend(px, py, color);
      }
    }
  }

  fillCircle(cx: number, cy: number, radius: number, color: Rgb) {
    const r = Math.max(0, radius);
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(this.width, Math.ceil(cx + r));
    const y1 = Math.min(this.height, Math.ceil(cy + r));
    const rr = r * r;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if (dx * dx + dy * dy <= rr) this.blend(px, py, color);
      }
    }
  }

  fillCapsule(ax: number, ay: number, bx: number, by: number, radius: number, color: Rgb) {
    const r = Math.max(0, radius);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const x1 = Math.min(this.width, Math.ceil(Math.max(ax, bx) + r));
    const y1 = Math.min(this.height, Math.ceil(Math.max(ay, by) + r));
    const vx = bx - ax;
    const vy = by - ay;
    const len = vx * vx + vy * vy;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / len));
        const dx = cx - (ax + vx * t);
        const dy = cy - (ay + vy * t);
        if (dx * dx + dy * dy <= r * r) this.blend(px, py, color);
      }
    }
  }

  fillPolygon(points: [number, number][], color: Rgb) {
    if (points.length < 3) return;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(this.width, Math.ceil(Math.max(...xs)));
    const y1 = Math.min(this.height, Math.ceil(Math.max(...ys)));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        if (insidePolygon(px + 0.5, py + 0.5, points)) this.blend(px, py, color);
      }
    }
  }

  downsample(scale: number): Raster {
    if (scale === 1) return this;
    const width = Math.round(this.width / scale);
    const height = Math.round(this.height / scale);
    const out = new Raster(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const i = ((y * scale + sy) * this.width + x * scale + sx) * 4;
            r += this.data[i]!;
            g += this.data[i + 1]!;
            b += this.data[i + 2]!;
            a += this.data[i + 3]!;
          }
        }
        const count = scale * scale;
        const o = (y * width + x) * 4;
        out.data[o] = Math.round(r / count);
        out.data[o + 1] = Math.round(g / count);
        out.data[o + 2] = Math.round(b / count);
        out.data[o + 3] = Math.round(a / count);
      }
    }
    return out;
  }
}

function insideRoundedRect(x: number, y: number, rx: number, ry: number, w: number, h: number, r: number): boolean {
  if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insidePolygon(x: number, y: number, points: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function hexRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shapePolygon(shape: QrIconShape, size: number, inset: number): [number, number][] | null {
  if (shape !== 'triangle') return null;
  const { points, centroid, inradius } = triangleGeometry(size);
  const k = Math.max(0, (inradius - inset) / inradius);
  return points.map(([x, y]) => [
    centroid[0] + (x - centroid[0]) * k,
    centroid[1] + (y - centroid[1]) * k,
  ]);
}

function insideShape(shape: QrIconShape, size: number, inset: number, x: number, y: number): boolean {
  const s = size;
  const i = Math.max(0, inset);
  if (shape === 'circle') {
    const r = s / 2 - i;
    const dx = x - s / 2;
    const dy = y - s / 2;
    return r >= 0 && dx * dx + dy * dy <= r * r;
  }
  if (shape === 'triangle') {
    const points = shapePolygon('triangle', s, i);
    return !!points && insidePolygon(x, y, points);
  }
  if (shape === 'rounded') return insideRoundedRect(x, y, i, i, s - i * 2, s - i * 2, roundedCornerRadius(s, i));
  return x >= i && y >= i && x <= s - i && y <= s - i;
}

function fillShape(raster: Raster, shape: QrIconShape, size: number, inset: number, color: Rgb, ox = 0, oy = 0) {
  if (shape === 'triangle') {
    const points = shapePolygon(shape, size, inset);
    if (points) raster.fillPolygon(points.map(([x, y]) => [x + ox, y + oy] as [number, number]), color);
    return;
  }
  if (shape === 'circle') {
    raster.fillCircle(ox + size / 2, oy + size / 2, Math.max(0, size / 2 - inset), color);
    return;
  }
  if (shape === 'rounded') {
    raster.fillRoundRect(ox + inset, oy + inset, size - inset * 2, size - inset * 2, roundedCornerRadius(size, inset), color);
    return;
  }
  raster.fillRect(ox + inset, oy + inset, size - inset * 2, size - inset * 2, color);
}

function sampleIcon(icon: RgbaIcon, x: number, y: number): [number, number, number, number] {
  const sx = Math.max(0, Math.min(icon.width - 1, Math.floor(x)));
  const sy = Math.max(0, Math.min(icon.height - 1, Math.floor(y)));
  const i = (sy * icon.width + sx) * 4;
  return [icon.data[i]!, icon.data[i + 1]!, icon.data[i + 2]!, icon.data[i + 3]! / 255];
}

// Salin gambar RGBA (dari browser tamu) ke layer lokal dengan penskalaan
// bilinear sederhana, lalu mask bentuk ikon.
function drawIconLayer(
  layer: Raster, icon: RgbaIcon, dx: number, dy: number, dw: number, dh: number,
  shape: QrIconShape, size: number, inset: number,
) {
  const x0 = Math.max(0, Math.floor(dx));
  const y0 = Math.max(0, Math.floor(dy));
  const x1 = Math.min(size, Math.ceil(dx + dw));
  const y1 = Math.min(size, Math.ceil(dy + dh));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!insideShape(shape, size, inset, x + 0.5, y + 0.5)) continue;
      const u = (x + 0.5 - dx) / dw;
      const v = (y + 0.5 - dy) / dh;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const sx = u * icon.width - 0.5;
      const sy = v * icon.height - 0.5;
      const xa = Math.floor(sx);
      const ya = Math.floor(sy);
      const fx = sx - xa;
      const fy = sy - ya;
      const p00 = sampleIcon(icon, xa, ya);
      const p10 = sampleIcon(icon, xa + 1, ya);
      const p01 = sampleIcon(icon, xa, ya + 1);
      const p11 = sampleIcon(icon, xa + 1, ya + 1);
      const mix = (a: number, b: number, c: number, d: number) =>
        a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
      const alpha = mix(p00[3], p10[3], p01[3], p11[3]);
      layer.blend(x, y, [
        Math.round(mix(p00[0], p10[0], p01[0], p11[0])),
        Math.round(mix(p00[1], p10[1], p01[1], p11[1])),
        Math.round(mix(p00[2], p10[2], p01[2], p11[2])),
      ], alpha);
    }
  }
}

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
      out[y * width + x] = Math.round(255 * Math.max(0, Math.min(1, radius + 0.5 - Math.sqrt(distance[x]!))));
    }
  }
  return out;
}

function drawOutlineBadge(icon: RgbaIcon, size: number, style: QrIconStyle): Raster {
  const badge = new Raster(size, size);
  const thickness = Math.max(1, Math.round(borderThickness('outline', size, style.thickness)));
  const box = Math.max(1, size - 2 * thickness);
  const scale = Math.min(box / icon.width, box / icon.height);
  const width = Math.max(1, Math.round(icon.width * scale));
  const height = Math.max(1, Math.round(icon.height * scale));
  const x = Math.trunc((size - width) / 2);
  const y = Math.trunc((size - height) / 2);

  const iconLayer = new Raster(size, size);
  drawIconLayer(iconLayer, icon, x, y, width, height, 'square', size, 0);
  const alpha = new Uint8ClampedArray(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = iconLayer.data[i * 4 + 3] ?? 0;
  const dilated = dilateAlpha(alpha, size, size, thickness);
  const border = hexRgb(style.borderColor);
  for (let i = 0; i < dilated.length; i++) {
    badge.blend(i % size, Math.floor(i / size), border, (dilated[i] ?? 0) / 255);
  }
  for (let i = 0; i < iconLayer.data.length; i += 4) {
    const a = iconLayer.data[i + 3]! / 255;
    if (a > 0) badge.blend((i / 4) % size, Math.floor(i / 4 / size), [iconLayer.data[i]!, iconLayer.data[i + 1]!, iconLayer.data[i + 2]!], a);
  }
  return badge;
}

function fittedScale(icon: RgbaIcon, shape: QrIconShape, size: number, inset: number): number {
  const [cx, cy] = shapeCenter(shape, size);
  const fits = (scale: number) => {
    const halfW = (icon.width * scale) / 2;
    const halfH = (icon.height * scale) / 2;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        if (!insideShape(shape, size, inset, cx + sx * halfW, cy + sy * halfH)) return false;
      }
    }
    return true;
  };
  let low = 0;
  let high = size / Math.max(icon.width, icon.height);
  if (fits(high)) return high;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

function drawFramedBadge(icon: RgbaIcon, size: number, style: QrIconStyle, backColor: Rgb): Raster {
  const badge = new Raster(size, size);
  const thickness = borderThickness(style.shape, size, style.thickness);
  fillShape(badge, style.shape, size, 0, hexRgb(style.borderColor));
  fillShape(badge, style.shape, size, thickness, backColor);

  const layer = new Raster(size, size);
  if (style.fit === 'crop') {
    const [bx0, by0, bx1, by1] = shapeBounds(style.shape, size, thickness + iconGap(size, style.fit, style.gap));
    const bw = Math.max(1, bx1 - bx0);
    const bh = Math.max(1, by1 - by0);
    const scale = Math.max(bw / icon.width, bh / icon.height);
    const width = Math.max(1, Math.ceil(icon.width * scale));
    const height = Math.max(1, Math.ceil(icon.height * scale));
    drawIconLayer(layer, icon, bx0 + (bw - width) / 2, by0 + (bh - height) / 2, width, height,
      style.shape, size, thickness + iconGap(size, style.fit, style.gap));
  } else {
    const scale = fittedScale(icon, style.shape, size, thickness);
    const width = Math.max(1, Math.round(icon.width * scale));
    const height = Math.max(1, Math.round(icon.height * scale));
    const [cx, cy] = shapeCenter(style.shape, size);
    drawIconLayer(layer, icon, cx - width / 2, cy - height / 2, width, height, style.shape, size, thickness);
  }
  for (let i = 0; i < layer.data.length; i += 4) {
    const a = layer.data[i + 3]! / 255;
    if (a > 0) badge.blend((i / 4) % size, Math.floor(i / 4 / size), [layer.data[i]!, layer.data[i + 1]!, layer.data[i + 2]!], a);
  }
  return badge;
}

function drawIcon(raster: Raster, qrWidth: number, icon: RgbaIcon, style: QrIconStyle, backColor: Rgb) {
  const size = iconFootprint(qrWidth);
  if (size < 8) return;
  const badge = style.shape === 'outline'
    ? drawOutlineBadge(icon, size, style)
    : drawFramedBadge(icon, size, style, backColor);
  const pos = Math.trunc((qrWidth - size) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const a = badge.data[i + 3]! / 255;
      if (a > 0) raster.blend(pos + x, pos + y, [badge.data[i]!, badge.data[i + 1]!, badge.data[i + 2]!], a);
    }
  }
}

function drawFinder(raster: Raster, gridX: number, gridY: number, unit: number, fill: Rgb, back: Rgb) {
  const px = gridX * unit;
  const py = gridY * unit;
  raster.fillRoundRect(px, py, 7 * unit - 1, 7 * unit - 1, unit * 1.5, fill);
  raster.fillRoundRect(px + unit, py + unit, 5 * unit - 1, 5 * unit - 1, unit, back);
  raster.fillRoundRect(px + 2 * unit, py + 2 * unit, 3 * unit - 1, 3 * unit - 1, unit * 0.5, fill);
}

function drawDiagonalBlocks(
  raster: Raster, matrix: QrMatrix, unit: number, fill: Rgb, back: Rgb, total: number, orientation: QrBarOrientation,
) {
  const stepY = orientation === 'diagonal_down' ? 1 : -1;
  const root2 = Math.SQRT2;
  const pitch = (QR_BOX * root2) * (unit / QR_BOX);
  const thick = (0.55 * QR_BOX / root2) * (unit / QR_BOX);
  const half = Math.max(pitch / 2, thick / 2);
  const r = thick / 2;
  const ux = 1 / root2;
  const uy = stepY / root2;
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < total && y < total
    && !isFinderCell(x, y, total) && !!matrix.modules[y - QR_BORDER]?.[x - QR_BORDER];
  const center = (x: number, y: number): [number, number] => [(x + 0.5) * unit, (y + 0.5) * unit];

  for (let y = 0; y < total; y++) {
    for (let x = 0; x < total; x++) {
      if (!dark(x, y) || dark(x - 1, y - stepY)) continue;
      let count = 1;
      while (dark(x + count, y + stepY * count)) count++;
      const [cx0, cy0] = center(x, y);
      const [cx1, cy1] = center(x + count - 1, y + stepY * (count - 1));
      const ax = cx0 - ux * half + ux * r;
      const ay = cy0 - uy * half + uy * r;
      const bx = cx1 + ux * half - ux * r;
      const by = cy1 + uy * half - uy * r;
      raster.fillCapsule(ax, ay, bx, by, r, fill);
    }
  }
  for (const [gx, gy] of finderOrigins(total)) drawFinder(raster, gx, gy, unit, fill, back);
}

function drawQr(raster: Raster, matrix: QrMatrix, style: QrStyle, scale: number, icon?: RgbaIcon | null) {
  const unit = QR_BOX * scale;
  const total = matrix.size + 2 * QR_BORDER;
  const fill = hexRgb(style.fillColor);
  const back = hexRgb(style.backColor);
  const custom = style.mode === 'custom';

  if (custom && style.dotShape === 'circle') {
    const radius = ((QR_BOX - 1 - 2 * DOT_PAD) / 2) * scale;
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (!matrix.modules[y]?.[x] || isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) continue;
        const cx = (x + QR_BORDER) * unit + (unit - scale) / 2;
        const cy = (y + QR_BORDER) * unit + (unit - scale) / 2;
        raster.fillCircle(cx, cy, radius, fill);
      }
    }
    for (const [gx, gy] of finderOrigins(total)) drawFinder(raster, gx, gy, unit, fill, back);
  } else if (custom && style.dotShape === 'block') {
    const orientation = style.barOrientation ?? 'horizontal';
    if (orientation === 'diagonal_down' || orientation === 'diagonal_up') {
      drawDiagonalBlocks(raster, matrix, unit, fill, back, total, orientation);
    } else if (orientation === 'vertical') {
      const height = BLOCK_HEIGHT * scale;
      const hpad = ((QR_BOX - BLOCK_HEIGHT) / 2) * scale;
      for (let x = 0; x < matrix.size; x++) {
        let y = 0;
        while (y < matrix.size) {
          if (!matrix.modules[y]?.[x] || isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) { y++; continue; }
          const start = y;
          while (y < matrix.size && matrix.modules[y]?.[x] && !isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) y++;
          const y1 = (start + QR_BORDER) * unit;
          const y2 = (y + QR_BORDER) * unit - scale;
          raster.fillRoundRect((x + QR_BORDER) * unit + hpad, y1, height, y2 - y1 + scale, BLOCK_RADIUS * scale, fill);
        }
      }
      for (const [gx, gy] of finderOrigins(total)) drawFinder(raster, gx, gy, unit, fill, back);
    } else {
      const height = BLOCK_HEIGHT * scale;
      const vpad = ((QR_BOX - BLOCK_HEIGHT) / 2) * scale;
      for (let y = 0; y < matrix.size; y++) {
        const row = matrix.modules[y];
        let x = 0;
        while (x < matrix.size) {
          if (!row?.[x] || isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) { x++; continue; }
          const start = x;
          while (x < matrix.size && row?.[x] && !isFinderCell(x + QR_BORDER, y + QR_BORDER, total)) x++;
          const x1 = (start + QR_BORDER) * unit;
          const x2 = (x + QR_BORDER) * unit - scale;
          raster.fillRoundRect(x1, (y + QR_BORDER) * unit + vpad, x2 - x1 + scale, height, BLOCK_RADIUS * scale, fill);
        }
      }
      for (const [gx, gy] of finderOrigins(total)) drawFinder(raster, gx, gy, unit, fill, back);
    }
  } else {
    for (let y = 0; y < matrix.size; y++) {
      for (let x = 0; x < matrix.size; x++) {
        if (!matrix.modules[y]?.[x]) continue;
        raster.fillRect((x + QR_BORDER) * unit, (y + QR_BORDER) * unit, unit, unit, fill);
      }
    }
  }

  if (custom && icon) drawIcon(raster, total * unit, icon, style.icon ?? DEFAULT_ICON_STYLE, back);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.slice(4, 8 + data.length)));
  return out;
}

function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Renderer server memakai matriks qrcode yang sama, geometri yang sama, dan
// raster sendiri supaya hasil tamu tidak bergantung pada canvas browser.
export function renderQrPng(input: QrServerRenderInput): QrServerRenderResult {
  const matrix = encodeQr(input.text);
  const width = qrPixelSize(matrix.size);
  const scale = width <= 900 ? 2 : 1;
  const raster = new Raster(width * scale, width * scale, hexRgb(input.style.backColor));
  drawQr(raster, matrix, input.style, scale, input.icon);
  const final = raster.downsample(scale);
  return { bytes: encodePng(width, width, final.data), width, version: matrix.version };
}
