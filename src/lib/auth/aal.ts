// Sesi Supabase membawa level assurance di JWT: `aal1` = baru faktor pertama,
// `aal2` = sudah melewati faktor kedua. Akun yang punya faktor terverifikasi
// tetapi sesinya masih `aal1` wajib menyelesaikan tantangan sebelum dipakai.
// Fungsi murni agar aturan gerbang ini bisa dites tanpa klien Supabase.
export type AssuranceLevels = { currentLevel: string | null; nextLevel: string | null };

export function needsSecondFactor({ currentLevel, nextLevel }: AssuranceLevels): boolean {
  return nextLevel === 'aal2' && currentLevel !== 'aal2';
}
