import Link from 'next/link';

// Dipakai ketika page.home boleh dilihat tetapi seluruh bab tersaring visibility.
// Tidak ada canvas kosong dan tidak ada nama/data kelas yang ikut bocor.
export function IntroEmpty({ brand, guest }: { brand: string; guest: boolean }) {
  return (
    <div className="intro">
      <header className="intro-bar">
        <span className="intro-bar__brand">{brand}</span>
        <nav aria-label="Navigasi intro">
          <Link href="/beranda">Beranda klasik</Link>
          {guest && <Link href="/login?next=%2F">Masuk</Link>}
        </nav>
      </header>
      <main id="main" className="intro-empty">
        <div className="intro-empty__mark" aria-hidden="true"><span /></div>
        <h1>Belum ada yang bisa ditampilkan</h1>
        <p>
          Bagian-bagian halaman ini sedang dibatasi oleh pengaturan visibilitas kelas.
          Kamu tetap bisa membuka beranda klasik untuk melihat apa yang tersedia.
        </p>
        <div className="intro-empty__actions">
          <Link className="intro-btn intro-btn--solid" href="/beranda">Buka beranda klasik</Link>
          {guest && <Link className="intro-btn" href="/login?next=%2F">Masuk ke kelas</Link>}
        </div>
      </main>
    </div>
  );
}
