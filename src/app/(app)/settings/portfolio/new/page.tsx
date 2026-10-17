import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { createPortfolioItem } from '@/features/portfolio/actions';
import { portfolioFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Tambah portofolio' };

export default function Page() {
  return (
    <ManageNew perm={null} next="/settings/portfolio/new" icon="briefcase" title="Tambah portofolio" parent={{ label: 'Profil saya', href: '/settings/profile' }}
      action={createPortfolioItem} fields={portfolioFields(null)}
      tips={['Gambar bisa ditambahkan setelah item tersimpan, lewat halaman Ubah.', 'Pilih siapa yang boleh melihat tiap item.', 'Maksimal jumlah item per anggota dibatasi.']} />
  );
}
