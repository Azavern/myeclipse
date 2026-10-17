import type { Metadata } from 'next';
import { ManageNew } from '@/components/manage-pages';
import { createSocialLink } from '@/features/social/actions';
import { socialFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Tambah tautan sosial' };

export default function Page() {
  return (
    <ManageNew perm={null} next="/settings/social/new" icon="link" title="Tambah tautan sosial" parent={{ label: 'Profil saya', href: '/settings/profile' }}
      action={createSocialLink} fields={socialFields(null)}
      tips={['Alamat harus cocok dengan platform yang dipilih.', 'Untuk platform "Lainnya", isi nama tautan.', 'Atur siapa yang boleh melihat tiap tautan.']} />
  );
}
