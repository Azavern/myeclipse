import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { EmptyState, LinkButton } from '@/components/ui/primitives';

// 403 yang tidak membocorkan apakah sumber dayanya ada (AGENTS.md §9).
export function NoAccess() {
  return (
    <EmptyState page icon="lock" title="Halaman ini tidak tersedia untukmu"
      action={<LinkButton href="/" variant="secondary" icon="home">Ke beranda</LinkButton>}>
      Akunmu belum punya akses ke halaman ini. Hubungi pengelola kelas bila menurutmu ini keliru.
    </EmptyState>
  );
}

// Tautan eksternal: hanya https yang menjadi tautan; selain itu tampil sebagai teks biasa.
export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!href.startsWith('https://')) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}<Icon name="external-link" size={14} className="ext" /><span className="sr-only"> (dibuka di tab baru)</span>
    </a>
  );
}
