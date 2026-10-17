import { z } from 'zod';

export const optText = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`).optional().transform((v) => v || null);
export const reqText = (max: number, label: string) =>
  z.string().trim().min(1, `${label} wajib diisi.`).max(max, `Maksimal ${max} karakter.`);
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Waktu tidak valid.');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam tidak valid.');
// https saja, tanpa kredensial, host bertitik (blueprint §14.3); disimpan ternormalisasi.
export const optUrl = z.string().trim().max(2048).optional().transform((v, ctx) => {
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.')) return u.toString();
  } catch { /* jatuh ke error di bawah */ }
  ctx.addIssue({ code: 'custom', message: 'Tautan harus berupa URL https yang valid.' });
  return z.NEVER;
});
export const idOf = (fd: FormData) => { const r = z.string().uuid().safeParse(fd.get('id')); return r.success ? r.data : null; };
