import { EmptyState, LinkButton } from '@/components/ui/primitives';

// URL yang tidak cocok dengan rute mana pun (tanpa rangka aplikasi).
export default function NotFound() {
  return (
    <main id="main" className="fullpage" tabIndex={-1}>
      <EmptyState page icon="search" title="Halaman tidak ditemukan"
        action={<LinkButton href="/" icon="home">Kembali ke beranda</LinkButton>}>
        Alamat yang kamu buka tidak ada. Periksa tautannya atau kembali ke beranda.
      </EmptyState>
    </main>
  );
}
