// Kerangka muat (skeleton) yang meniru bentuk halaman: judul, empat kartu statistik, dua kartu isi.
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="stack">
      <span className="sr-only">Memuat halaman…</span>
      <div className="stack stack--sm" aria-hidden="true">
        <div className="skeleton skel-title" />
        <div className="skeleton skel-line skel-w60" />
      </div>
      <div className="stat-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skel-block skel-stat" />)}
      </div>
      <div className="dash" aria-hidden="true">
        <div className="skeleton skel-block skel-tall" />
        <div className="skeleton skel-block skel-tall" />
      </div>
    </div>
  );
}
