'use client';
import { EmptyState, LinkButton } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState page icon="alert-triangle" title="Halaman ini gagal dimuat"
      action={
        <div className="cluster">
          <button type="button" className="btn" onClick={reset}><Icon name="loader" size={18} />Coba lagi</button>
          <LinkButton href="/" variant="secondary" icon="home">Ke beranda</LinkButton>
        </div>
      }>
      Terjadi kesalahan di sisi kami, bukan salahmu. Coba muat ulang.{error.digest && <> Kode kesalahan: <span className="nums">{error.digest}</span>.</>}
    </EmptyState>
  );
}
