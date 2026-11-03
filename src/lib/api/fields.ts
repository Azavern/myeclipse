import { z } from 'zod';

// URL yang boleh disimpan: https, tanpa kredensial, host bertitik. Tidak ada
// fetch server-side, jadi ini validasi bentuk — bukan bukti isi aman.
export const httpsUrl = z.string().trim().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.');
  } catch {
    return false;
  }
}, 'Tautan harus berupa URL https yang valid.');

// Menerima ISO 8601 dengan zona waktu eksplisit (Z atau ±HH:MM). Waktu tanpa
// zona ditolak supaya server tidak menebak offset kelas.
export const isoDateTime = z.string().trim().max(40).refine(
  (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value)),
  'Waktu harus ISO 8601 dengan zona waktu, misalnya 2026-11-03T09:00:00+07:00.',
);

export const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

// Query pencarian dibatasi dan karakter kontrol PostgREST dibuang. Nilai tetap
// di-encode oleh Supabase; ini hanya mencegah sintaks filter rusak.
export function searchTerm(raw: string | null): string {
  return (raw ?? '').trim().slice(0, 60).replace(/[(),]/g, ' ');
}
