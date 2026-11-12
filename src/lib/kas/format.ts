export const KAS_MAX_AMOUNT = 100_000_000;
export const KAS_BILL_LIMIT = 24;
export const KAS_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const KAS_IMAGE_MIME = 'image/jpeg,image/png,image/webp' as const;

export const KAS_CATEGORIES = ['Iuran', 'Donasi', 'Konsumsi', 'Perlengkapan', 'Lainnya'] as const;
export type KasCategory = (typeof KAS_CATEGORIES)[number];

export const KAS_METHODS = { qris: 'QRIS', transfer: 'Transfer', cash: 'Tunai' } as const;
export type KasMethod = keyof typeof KAS_METHODS;

export const KAS_BILL_STATUS = {
  unpaid: 'Belum bayar',
  pending: 'Menunggu verifikasi',
  paid: 'Lunas',
  rejected: 'Ditolak',
} as const;
export type KasBillStatus = keyof typeof KAS_BILL_STATUS;

export const KAS_SUBMISSION_STATUS = {
  pending: 'Menunggu verifikasi',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
} as const;

export const KAS_BILL_UI = {
  open: 'Terbuka',
  closed: 'Selesai',
  cancelled: 'Dibatalkan',
} as const;

/** Nominal disimpan sebagai bilangan bulat rupiah. String harus digit murni. */
export function parseAmount(raw: unknown): number | null {
  const value = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
  if (!/^\d{1,9}$/.test(value)) return null;
  const amount = Number(value);
  return amount >= 1 && amount <= KAS_MAX_AMOUNT ? amount : null;
}

export function formatRupiah(value: number | bigint | null | undefined): string {
  const amount = typeof value === 'bigint' ? Number(value) : value ?? 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSignedRupiah(value: number, direction: 'income' | 'expense'): string {
  return `${direction === 'income' ? '+' : '−'}${formatRupiah(Math.abs(value))}`;
}

/** Tanggal `YYYY-MM-DD` dibaca sebagai tanggal kalender, bukan tengah malam UTC. */
export function formatDateOnly(value: string, timeZone = 'Asia/Jakarta'): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone,
  }).format(date);
}

export function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayInZone(timeZone = 'Asia/Jakarta', now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Perbandingan tanggal kalender ISO; cukup string karena formatnya tetap. */
export const isPastDue = (dueOn: string, today: string): boolean => dueOn < today;

export const canSubmitBill = (status: KasBillStatus): boolean => status === 'unpaid' || status === 'rejected';

export const MAX_AMOUNT_MESSAGE = 'Nominal harus bilangan bulat antara Rp1 dan Rp100.000.000.';
export const BILL_LIMIT_MESSAGE = `Maksimal ${KAS_BILL_LIMIT} tagihan terbuka bersamaan.`;
