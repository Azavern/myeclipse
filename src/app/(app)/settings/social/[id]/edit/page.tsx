import type { Metadata } from 'next';
import { ManageEdit } from '@/components/manage-pages';
import { updateSocialLink, deleteSocialLink } from '@/features/social/actions';
import { socialFields } from '@/features/fields';

export const metadata: Metadata = { title: 'Ubah tautan sosial' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ManageEdit perm={null} ownerOnly next={`/settings/social/${id}/edit`} id={id} table="social_links" icon="link" title="Ubah tautan sosial"
      parent={{ label: 'Profil saya', href: '/settings/profile' }} deleteTitle="Hapus tautan ini?" consequence="Tautan ini akan hilang dari profilmu."
      action={updateSocialLink} remove={deleteSocialLink} fieldsFor={socialFields} />
  );
}
