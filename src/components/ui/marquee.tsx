'use client';

import { useEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';

export function marqueePace(text: string) {
  const length = text.trim().length;
  return length >= 96 ? 'marquee--long' : length >= 56 ? 'marquee--medium' : 'marquee--short';
}

// Teks satu baris yang bergulir hanya bila tidak muat. Pengukuran dilakukan di klien agar
// desktop (>=1024 px) tidak pernah mendapat salinan kedua atau animasi.
export function Marquee({ children, className }: { children: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mobile = window.matchMedia('(max-width: 1023px)');
    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!mobile.matches) {
          setOverflow(false);
          return;
        }
        const text = el.querySelector<HTMLElement>('.marquee__text');
        if (!text) return;
        setOverflow(text.getBoundingClientRect().width > el.clientWidth + 1);
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const text = el.querySelector<HTMLElement>('.marquee__text');
    if (text) observer.observe(text);
    const mutations = new MutationObserver(measure);
    mutations.observe(el, { characterData: true, childList: true, subtree: true });
    mobile.addEventListener('change', measure);
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      mobile.removeEventListener('change', measure);
    };
  }, [children]);

  const pace = marqueePace(children);
  return (
    <span ref={ref} className={cx('marquee', overflow && 'marquee--overflow', overflow && pace, className)}>
      <span className="marquee__track">
        <span className="marquee__text">{children}</span>
        {overflow && <span className="marquee__text" aria-hidden="true">{children}</span>}
      </span>
    </span>
  );
}
