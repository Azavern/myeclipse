'use client';

// Pengaman terakhir bila layout akar gagal. Sengaja tanpa CSS aplikasi (layout akar tidak ikut dirender).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="id">
      <body>
        <main>
          <h1>Terjadi kesalahan</h1>
          <p>Aplikasi tidak bisa dimuat saat ini. Coba lagi sebentar lagi.</p>
          <button type="button" onClick={reset}>Coba lagi</button>
        </main>
      </body>
    </html>
  );
}
