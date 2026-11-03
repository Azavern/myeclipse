// Nama berkas unduhan kredensial API key. Modul murni tanpa API Node/browser
// supaya format yang dijanjikan ke pengguna bisa diuji.

export function fileSlug(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'key';
}

export function utcStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/** `<nama key>-<waktu UTC>-<username pembuat key>.json` */
export function keyFileName(name: string, author: string, date: Date) {
  return `${fileSlug(name)}-${utcStamp(date)}-${fileSlug(author)}.json`;
}
