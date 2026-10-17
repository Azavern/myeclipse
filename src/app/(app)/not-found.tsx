import { EmptyState, LinkButton } from '@/components/ui/primitives';

// Dipakai notFound() di dalam rangka aplikasi. Pesannya sama untuk "tidak ada" dan "tidak terlihat" (AGENTS.md §9).
export default function NotFound() {
  return (
    <EmptyState page icon="search" title="Halaman tidak ditemukan"
      action={<LinkButton href="/" icon="home">Kembali ke beranda</LinkButton>}>
      Halaman yang kamu cari tidak ada atau tidak tersedia untukmu.
    </EmptyState>
  );
}
