import type { Metadata } from 'next';
import { ImageForm } from '@/components/image-form';
import { ManageEdit } from '@/components/manage-pages';
import { applyLibraryToPortfolio } from '@/features/library/actions';
import { libraryPickerItems } from '@/features/library/data';
import { LibraryPicker } from '@/features/library/picker';
import { updatePortfolioItem, deletePortfolioItem, removePortfolioMedia, uploadPortfolioMedia } from '@/features/portfolio/actions';
import { portfolioFields } from '@/features/fields';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Ubah portofolio' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ManageEdit perm={null} ownerOnly next={`/settings/portfolio/${id}/edit`} id={id} table="portfolio_items" icon="briefcase" title="Ubah portofolio"
      parent={{ label: 'Portofolio', href: '/settings/portfolio' }} deleteTitle="Hapus item portofolio?" consequence="Item ini akan hilang dari profilmu."
      action={updatePortfolioItem} remove={deletePortfolioItem} fieldsFor={portfolioFields} extraCols={['media_path']}
      after={async (row) => {
        const supabase = await createClient();
        const viewer = await getViewer();
        const path = typeof row.media_path === 'string' ? row.media_path : null;
        const [url, library] = await Promise.all([
          path
            ? signMany(supabase, 'member-media', [path]).then((map) => map.get(path))
            : Promise.resolve(undefined),
          viewer.user ? libraryPickerItems(supabase, viewer.user.id) : Promise.resolve([]),
        ]);
        return (
          <ImageForm id="media" title="Gambar" description="Tangkapan layar atau foto karya yang tampil di kartu portofolio." variant="wide" url={url}
            uploadAction={uploadPortfolioMedia} removeAction={removePortfolioMedia} hidden={{ id }} spec={{ crop: [1280, 720] }}
            removeConsequence="Kartu portofolio kembali memakai ikon jenisnya."
            picker={<LibraryPicker items={library} action={applyLibraryToPortfolio} hidden={{ id }}
              title="Gunakan gambar dari Library" trigger="Pilih dari Library"
              description="Gambar disalin ke portofolio ini. Item Library tetap utuh dan bisa dipakai di form lain." />} />
        );
      }} />
  );
}
