// Pratinjau tautan portofolio (Open Graph / Twitter Card). Berkas ini murni — tanpa jaringan dan tanpa
// `server-only` — supaya aturan validasi tautan dan parsing bisa diuji unit (AGENTS.md §11).

export type PageMeta = { title: string | null; description: string | null; site: string | null; image: string | null };

export type LinkPreview = PageMeta & {
  url: string; // URL halaman yang diambil (setelah pengalihan)
  host: string; // hostname tanpa "www."; dipakai sebagai label situs saat og:site_name tidak ada
  site: string;
};

// Isi berasal dari situs pihak ketiga: dibatasi panjang dan dibersihkan sebelum dipakai (AGENTS.md §9).
const MAX = { title: 120, description: 220, site: 60 } as const;

// Rangkaian alamat yang tidak boleh disentuh server (SSRF) maupun browser pembaca.
export function blockedHost(raw: string): boolean {
  const h = raw.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a = 0, b = 0] = h.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true; // "jaringan ini", privat, loopback
    if (a === 169 && b === 254) return true; // link-local (metadata cloud)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return a >= 224; // multicast dan eksperimental
  }
  if (h.includes(':')) {
    return h === '::' || h === '::1' || h.startsWith('::ffff:') || /^f[cd]/.test(h) || /^fe[89ab]/.test(h);
  }
  return false;
}

// Tautan yang layak diambil server: https, tanpa kredensial, port standar, host publik berdomain.
// `checkHost` adalah nama yang benar-benar dihubungi fetch(); `host` hanya label
// tampilan tanpa "www.". Guard SSRF wajib memakai `checkHost`, karena
// "www.evil.com" bisa menunjuk ke alamat internal meski "evil.com" publik.
export type PreviewTarget = { href: string; host: string; checkHost: string };

export function previewUrl(raw: string): PreviewTarget | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const checkHost = u.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
  const host = checkHost.replace(/^www\./, '');
  if (!checkHost.includes('.') || blockedHost(checkHost)) return null;
  return { href: u.href, host, checkHost };
}

// Teks pengganti saat kartu tidak punya gambar sama sekali: origin tautannya (mis. https://www.example.com).
export function displayOrigin(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const hex = /^#x/i.test(code);
      const n = parseInt(hex ? code.slice(2) : code.slice(1), hex ? 16 : 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// Buang karakter kendali, rapikan spasi, lalu batasi panjang.
function cleanText(raw: string | undefined, max: number): string | null {
  if (!raw) return null;
  const t = decodeEntities(raw).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Kunci pertama yang muncul menang; kunci dibaca dari attribute `property` atau `name`.
function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const attr = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/g;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (let m = attr.exec(tag); m; m = attr.exec(tag)) attrs.set(m[1]!.toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').trim().toLowerCase();
    const content = attrs.get('content');
    if (key && content !== undefined && !out.has(key)) out.set(key, content);
  }
  return out;
}

// Gambar OG dimuat browser dari host ketiga, jadi hanya https publik yang diterima (lihat CSP di src/proxy.ts).
export function safeImage(raw: string | undefined, baseUrl: string): string | null {
  if (!raw) return null;
  const first = decodeEntities(raw).trim().split(/\s+/)[0];
  if (!first) return null;
  try {
    return previewUrl(new URL(first, baseUrl).href)?.href ?? null;
  } catch {
    return null;
  }
}

export function parsePreview(html: string, baseUrl: string): PageMeta {
  const meta = metaTags(html);
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => !!v);
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title: cleanText(pick('og:title', 'twitter:title') ?? titleTag, MAX.title),
    description: cleanText(pick('og:description', 'twitter:description', 'description'), MAX.description),
    site: cleanText(pick('og:site_name', 'application-name'), MAX.site),
    image: safeImage(pick('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'), baseUrl),
  };
}
