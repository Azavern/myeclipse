import 'server-only';
import { lookup } from 'node:dns/promises';
import { blockedHost, parsePreview, previewUrl, type LinkPreview } from '@/lib/preview/meta';

// Mengambil metadata Open Graph dari tautan portofolio milik anggota. Semuanya bersifat pelengkap:
// kegagalan apa pun menghasilkan null dan kartu jatuh kembali ke tampilan lama (AGENTS.md §10).
//
// Guard SSRF (AGENTS.md §9): hanya https di port standar tanpa kredensial, host harus berdomain dan
// tidak menunjuk ke alamat internal (diperiksa lewat DNS), pengalihan diikuti manual agar setiap
// tujuan diperiksa ulang, badan dibaca maksimal 200 KB, dan seluruh permintaan dibatasi 4 detik.
const TIMEOUT_MS = 4_000;
const MAX_HTML_BYTES = 200 * 1024;
const MAX_HOPS = 3; // 1 permintaan awal + maksimal 3 pengalihan
const REVALIDATE_SECONDS = 24 * 60 * 60; // cache data Next: satu kali ambil per tautan per hari
const FAIL_TTL_MS = 10 * 60 * 1000; // cache gagal dalam proses
const FAIL_CACHE_MAX = 500;
const MAX_PREVIEWS = 12; // batas per render: halaman tetap wajar walau banyak tautan mati
const CONCURRENCY = 6;
const BUDGET_MS = 5_000; // anggaran waktu satu render; batch baru hanya dimulai bila masih muat (AGENTS.md §12)
const USER_AGENT = 'EclipseLinkPreview/1.0';
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// Kegagalan tidak di-cache oleh Next, jadi tanpa ini setiap render menunggu timeout untuk tautan mati.
const failures = new Map<string, number>();

function fail(href: string, reason: string): null {
  failures.set(href, Date.now() + FAIL_TTL_MS);
  if (failures.size > FAIL_CACHE_MAX) failures.clear(); // sederhana, cukup untuk ukuran kelas
  console.warn('link-preview tidak tersedia', reason, new URL(href).host);
  return null;
}

// Host tujuan boleh diambil hanya bila seluruh alamat IPv4 hasil resolusi DNS-nya publik; host tanpa IPv4
// diperiksa lewat seluruh alamat IPv6-nya. Alamat IPv6 ULA yang menyertai IPv4 publik diabaikan karena
// resolver NAT64/DNS64 (umum di jaringan seluler dan sandbox) memetakan host publik ke fd00::/8, dan
// menolaknya membuat fitur ini mati total di lingkungan seperti itu. Literal IP internal tetap selalu ditolak.
async function publicHost(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return false;
    const v4 = addrs.filter((a) => a.family === 4);
    return (v4.length > 0 ? v4 : addrs).every((a) => !blockedHost(a.address));
  } catch {
    return false;
  }
}

// Hanya awal dokumen yang dibaca; sisa badan dibatalkan supaya halaman besar tidak menghabiskan memori.
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    if (bytes >= MAX_HTML_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text + decoder.decode();
}

type Page = { ok: true; html: string; url: string } | { ok: false; reason: string };

async function fetchPage(target: string): Promise<Page> {
  let current = target;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const url = previewUrl(current);
    if (!url) return { ok: false, reason: 'url' };
    // Periksa alamat host yang benar-benar di-fetch, bukan label tanpa "www.".
    if (!(await publicHost(url.checkHost))) return { ok: false, reason: 'dns' };
    const res = await fetch(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': USER_AGENT },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (REDIRECTS.has(res.status)) {
      const location = res.headers.get('location');
      await res.arrayBuffer().catch(() => undefined); // habiskan badan agar penulisan cache Next utuh
      if (!location) return { ok: false, reason: 'redirect' };
      try {
        current = new URL(location, url.href).href;
      } catch {
        return { ok: false, reason: 'redirect' };
      }
      continue;
    }
    if (!res.ok) return { ok: false, reason: `status-${res.status}` };
    if (!(res.headers.get('content-type') ?? '').includes('html')) return { ok: false, reason: 'type' };
    if (Number(res.headers.get('content-length') ?? 0) > MAX_HTML_BYTES) return { ok: false, reason: 'size' };
    return { ok: true, html: await readCapped(res), url: url.href };
  }
  return { ok: false, reason: 'redirect' };
}

export async function linkPreview(raw: string): Promise<LinkPreview | null> {
  const url = previewUrl(raw);
  if (!url) return null;
  const failedUntil = failures.get(url.href);
  if (failedUntil && failedUntil > Date.now()) return null;
  let page: Page;
  try {
    page = await fetchPage(url.href);
  } catch {
    return fail(url.href, 'network'); // timeout, DNS gagal, atau koneksi ditolak
  }
  if (!page.ok) return fail(url.href, page.reason);
  const meta = parsePreview(page.html, page.url);
  return { url: page.url, host: url.host, site: meta.site ?? url.host, title: meta.title, description: meta.description, image: meta.image };
}

// Ambil banyak tautan sekaligus dengan jumlah paralel terbatas dan urutan masukan dipertahankan lebih dulu.
export async function linkPreviews(urls: (string | null | undefined)[], limit = MAX_PREVIEWS): Promise<Map<string, LinkPreview>> {
  const wanted: string[] = [];
  for (const raw of urls) {
    if (!raw || wanted.includes(raw)) continue;
    if (wanted.length >= limit) break;
    wanted.push(raw);
  }
  const out = new Map<string, LinkPreview>();
  // Sisa tautan yang tidak sempat diambil akan dicoba lagi pada render berikutnya (hasil dan kegagalan di-cache),
  // jadi render pertama tetap dibatasi walau halaman berisi banyak tautan mati.
  const deadline = Date.now() + BUDGET_MS - TIMEOUT_MS;
  for (let i = 0; i < wanted.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) break;
    const batch = await Promise.all(wanted.slice(i, i + CONCURRENCY).map(async (u) => [u, await linkPreview(u)] as const));
    for (const [u, p] of batch) if (p) out.set(u, p);
  }
  return out;
}
