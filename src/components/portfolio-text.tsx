'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';

// Judul dan deskripsi kartu portofolio selalu berhenti di dua/tiga baris supaya tinggi kartu tetap.
// Teks yang terpotong diberi tombol "Baca selengkapnya" yang membuka dialog berisi versi utuhnya;
// tombol itu duduk di atas lapisan `.stretch` sehingga klik kartu tetap membuka tautan (AGENTS.md §7).
export function PortfolioText({ title, text, href }: { title: string; text: string | null; href: string | null }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [clipped, setClipped] = useState(false);
  const id = useId();

  useEffect(() => {
    // Tinggi terpotong dibaca lebih dulu, lalu kelas pangkas dilepas sesaat untuk membaca tinggi penuh;
    // keduanya terjadi di dalam satu efek sehingga tidak pernah terlihat berkedip di layar.
    const measure = () => {
      const over = (el: HTMLElement | null, clamp: string) => {
        if (!el) return false;
        const shown = el.clientHeight;
        el.classList.remove(clamp);
        const full = el.scrollHeight;
        el.classList.add(clamp);
        return full > shown + 1;
      };
      setClipped(over(titleRef.current, 'clamp-2') || over(textRef.current, 'clamp-3'));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [title, text]);

  return (
    <>
      <h3 ref={titleRef} className="clamp-2 portfolio-card__title">
        {href
          ? <a className="stretch" href={href} target="_blank" rel="noopener noreferrer">{title}<span className="sr-only"> (dibuka di tab baru)</span></a>
          : title}
      </h3>
      {text && <p ref={textRef} className="muted pre clamp-3">{text}</p>}
      {clipped && (
        <button type="button" className="portfolio-card__more above" aria-haspopup="dialog"
          onClick={() => dialogRef.current?.showModal()}>
          <Icon name="arrow-right" size={14} />Baca selengkapnya<span className="sr-only"> tentang {title}</span>
        </button>)}
      <dialog data-ui="dialog" ref={dialogRef} className="dialog--read" aria-labelledby={`${id}-title`}>
        <div className="dialog__body">
          <h2 id={`${id}-title`}>{title}</h2>
          {text && <p className="pre">{text}</p>}
        </div>
        <div className="dialog__actions">
          <button data-ui="button" type="button" className="btn" onClick={() => dialogRef.current?.close()}>Tutup</button>
        </div>
      </dialog>
    </>
  );
}
