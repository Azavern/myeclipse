import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import type { IconName } from './ui/icon';

// Rangka dokumen legal: judul halaman, tanggal berlaku, isi, dan tautan silang.
export function LegalPage({ icon, title, description, updated, children }: {
  icon: IconName; title: string; description: string; updated: string; children: ReactNode;
}) {
  return (
    <>
      <PageHeader icon={icon} title={title} description={description} />
      <article data-ui="panel" className="card legal">
        <p className="legal__meta">Berlaku sejak {updated}</p>
        <div className="legal__body prose">{children}</div>
        <footer className="legal__foot">
          <Link href="/terms">Syarat Layanan</Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy">Kebijakan Privasi</Link>
          <span aria-hidden="true">·</span>
          <Link href="/">Beranda</Link>
        </footer>
      </article>
    </>
  );
}
