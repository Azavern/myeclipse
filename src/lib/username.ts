// Murni (tanpa server-only) agar bisa dipakai skrip bootstrap dan Server Action (blueprint §9.6).
export function slugifyUsername(name: string): string {
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (base.length >= 3 ? base : `${base}_user`).slice(0, 30);
}
export function pickUsername(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const suffix = `_${i}`;
    const candidate = base.slice(0, 30 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('Tidak ada username yang tersedia');
}
