// Matematika murni untuk gerak intro: jendela adegan, peredam fokus, dan pemilihan tier.
// Semua posisi kartu dihitung dari kemajuan gulir (bukan akumulasi bingkai), sehingga
// gerak bisa dibalik dan berhenti kapan saja tanpa drift.
export const INTRO_ACTS = ['gate', 'overview', 'orbit', 'comet', 'leader', 'finale'] as const;
export type IntroActId = (typeof INTRO_ACTS)[number];

export const ACT_LABEL: Record<IntroActId, string> = {
  gate: 'Gerbang',
  overview: 'Ringkasan',
  orbit: 'Orbit',
  comet: 'Anggota',
  leader: 'Ketua',
  finale: 'Gerhana',
};

// Lebar tumpang tindih antar adegan dalam vh (36vh sebelum + sesudah batas).
export const OVERLAP_VH = 36;

const BASE_VH: Record<IntroActId, number> = { gate: 120, overview: 170, orbit: 70, comet: 0, leader: 150, finale: 150 };
const PER_ITEM_VH: Record<IntroActId, number> = { gate: 85, overview: 0, orbit: 95, comet: 42, leader: 0, finale: 0 };

// Panjang gulir tiap adegan. Adegan anggota selalu cukup panjang untuk jeda fokus.
export function actWeight(id: IntroActId, count: number): number {
  if (id === 'comet') return Math.max(240, count * PER_ITEM_VH.comet);
  return BASE_VH[id] + PER_ITEM_VH[id] * count;
}

export type TimelineAct<T> = {
  id: IntroActId;
  chapters: T[];
  weight: number;
  start: number;
  end: number;
  first: boolean;
  last: boolean;
};

// groups harus sudah dalam urutan INTRO_ACTS. Timeline tidak memuat adegan kosong.
// itemCount dipakai adegan yang panjangnya mengikuti jumlah kartu di dalam satu bab
// (heliks anggota), bukan jumlah bab.
export function buildTimeline<T>(groups: { id: IntroActId; chapters: T[]; itemCount?: number }[]): { acts: TimelineAct<T>[]; total: number } {
  const ordered = INTRO_ACTS
    .map((id) => groups.find((group) => group.id === id && group.chapters.length > 0))
    .filter((group): group is { id: IntroActId; chapters: T[]; itemCount?: number } => !!group);
  let cursor = 0;
  const acts = ordered.map((group, index) => {
    const weight = actWeight(group.id, group.itemCount ?? group.chapters.length);
    const act: TimelineAct<T> = {
      id: group.id,
      chapters: group.chapters,
      weight,
      start: cursor,
      end: cursor + weight,
      first: index === 0,
      last: index === ordered.length - 1,
    };
    cursor += weight;
    return act;
  });
  return { acts, total: cursor };
}

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// Indeks kontinu berhenti di bilangan bulat: tiap kartu mendapat jeda fokus sebelum
// kartu berikutnya bergerak. rest = porsi akhir tiap langkah yang dipakai untuk diam.
export function dwell(step: number, rest: number): number {
  const base = Math.floor(step);
  return base + smoothstep(rest, 1 - rest, step - base);
}

// Bobot fokus kartu di sekitar pusat (kartu tengah tajam, sekitarnya memudar).
export const focusWeight = (index: number, focus: number, spread = 1.4) => Math.exp(-((index - focus) ** 2) / spread);

// Sorotan ekor komet bergerak dari ujung atas (1) ke kepala (0) mengikuti gulir.
// Nilai ini tidak memakai dwell supaya tidak berhenti saat anggota sedang fokus.
export const cometHighlight = (u: number) => 1 - clamp(u);

// Debu dan bintang di latar mengalir ke bawah selama bab anggota.
export const cometFlow = (u: number) => clamp(u) * 900;

// Redam kartu yang mendekati bidang kamera. z sudah termasuk warp adegan.
export const nearFade = (z: number, perspective: number) => 1 - smoothstep(perspective * 0.32, perspective * 0.62, z);

export function actPresence<T>(act: TimelineAct<T>, t: number) {
  const u = clamp((t - act.start) / act.weight);
  const enter = act.first ? 1 : smoothstep(act.start - OVERLAP_VH, act.start + OVERLAP_VH, t);
  const leave = act.last ? 0 : smoothstep(act.end - OVERLAP_VH, act.end + OVERLAP_VH, t);
  return {
    u,
    opacity: enter * (1 - leave),
    // Adegan baru datang dari kedalaman; adegan lama keluar melewati kamera.
    warp: (act.first ? 0 : -(1 - enter) * 900) + leave * 700,
  };
}

export type MotionTier = 'static' | 'css' | 'mobile' | 'full';

// Preferensi sistem menang. Tanpa WebGL atau saveData, kamera tetap 3D tetapi latar
// memakai CSS. Ponsel mendapat partikel dan DPR yang lebih rendah.
export function pickTier(input: { reducedMotion: boolean; webgl: boolean; saveData: boolean; phone: boolean }): MotionTier {
  if (input.reducedMotion) return 'static';
  if (!input.webgl || input.saveData) return 'css';
  return input.phone ? 'mobile' : 'full';
}

export const TIER_QUALITY: Record<MotionTier, { dpr: number; particles: number; stars: number }> = {
  static: { dpr: 1, particles: 0, stars: 0 },
  css: { dpr: 1, particles: 0, stars: 0 },
  mobile: { dpr: 1.5, particles: 1600, stars: 0.6 },
  full: { dpr: 2, particles: 8000, stars: 1 },
};

export type CameraConfig = {
  phone: boolean;
  perspective: number;
  depth: number;
  spacing: number;
  side: number;
  yaw: number;
  amplitude: number;
};

export function cameraConfig(phone: boolean): CameraConfig {
  return phone
    ? { phone, perspective: 760, depth: 980, spacing: 640, side: 28, yaw: 8, amplitude: 0.5 }
    : { phone, perspective: 1100, depth: 900, spacing: 820, side: 430, yaw: 26, amplitude: 1 };
}

// Frame-rate independent damper: 1 - exp(-dt * k). Nilai k 6–9 terasa melayang tetapi
// tetap mengikuti gulir. Tidak ada gerak linear.
export const damp = (dt: number, k = 7.5) => 1 - Math.exp(-Math.max(0, dt) * k);

export const wrapDegrees = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

// Posisi kartu komet murni fungsi fokus, sehingga kontinuitas tiap 1vh bisa diuji
// tanpa DOM. Fokus berasal dari dwell() yang berhenti di angka bulat.
export function cometPlacement(index: number, focus: number, phone: boolean) {
  const radius = phone ? 250 : 360;
  const angle = phone ? 58 : 62;
  const gapY = phone ? 118 : 150;
  const delta = index - focus;
  const radians = delta * angle * (Math.PI / 180);
  const facing = Math.cos(radians);
  const zig = index % 2 ? 1 : -1;
  return {
    x: radius * Math.sin(radians) + zig * 26,
    y: delta * gapY + zig * 24,
    z: -radius + radius * facing,
    ry: wrapDegrees(delta * angle) * 0.6,
    rz: zig * 3.2,
    facing,
  };
}

// Deterministik untuk sebaran ubin ringkasan; tidak memakai Math.random agar posisi
// kartu sama setiap render dan tidak ada lompatan saat React me-remount.
export const noise1d = (index: number, salt: number) => {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
