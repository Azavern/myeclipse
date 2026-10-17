// Menggabungkan nama kelas; nilai falsy dilewati.
export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
