// Pembatas laju sederhana per proses. Ini bukan batas keamanan keras: pada
// serverless ada beberapa instance, jadi sifatnya best-effort untuk menahan
// pengiriman berulang dari satu alamat.
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function allow(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    return true;
  };
}

// Alamat klien hanya dipercaya bila diisi infrastruktur (Vercel mengisi
// x-forwarded-for). Nilai header ini tidak dipakai untuk keputusan otorisasi.
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
