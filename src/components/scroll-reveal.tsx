'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Animasi masuk untuk unit konten di halaman. Kelas baru dipasang dari klien,
// sehingga tanpa JavaScript konten tetap terlihat. Induk yang sudah dianimasikan
// membuat anaknya tidak ikut bergerak sendiri-sendiri.
const SELECTOR = 'main .card, main .row, main .empty';

export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const root = document.querySelector('main');
    if (!root) return;

    const seen = new WeakSet<Element>();
    const timers = new Set<number>();
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      visible.forEach((entry, index) => {
        observer.unobserve(entry.target);
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          entry.target.classList.add('reveal--in');
        }, Math.min(index, 5) * 60);
        timers.add(timer);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });

    // Halaman dapat dialirkan setelah layout, jadi konten baru dipindai lagi.
    const scan = () => {
      const nodes = [...root.querySelectorAll<HTMLElement>(SELECTOR)]
        .filter((el) => !seen.has(el) && !el.parentElement?.closest(SELECTOR));
      nodes.forEach((el) => {
        seen.add(el);
        const rect = el.getBoundingClientRect();
        // Konten yang sudah terlihat tidak disembunyikan dulu agar tidak berkedip.
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          el.classList.add('reveal', 'reveal--in');
          return;
        }
        el.classList.add('reveal');
        observer.observe(el);
      });
    };
    let frame = 0;
    const scheduleScan = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; scan(); });
    };
    scan();
    const mutations = new MutationObserver(scheduleScan);
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [pathname]);

  return null;
}
