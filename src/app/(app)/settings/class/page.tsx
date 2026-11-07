import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImageForm } from '@/components/image-form';
import { ManageEdit } from '@/components/manage-pages';
import { classFields } from '@/features/fields';
import { removeClassImage, updateClass, uploadClassImage } from '@/features/class/actions';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Pengaturan kelas' };

export default async function Page() {
  const cls = await getClass();
  if (!cls) notFound();
  const canManage = (await getViewer()).can('class.manage');
  let logo: string | undefined, cover: string | undefined;
  if (canManage) {
    const supabase = await createClient();
    const { data } = await supabase.from('classes').select('logo_path,cover_path').eq('id', cls.id).single();
    const p = data as { logo_path: string | null; cover_path: string | null } | null;
    const urls = await signMany(supabase, 'class-media', [p?.logo_path, p?.cover_path]);
    logo = p?.logo_path ? urls.get(p.logo_path) : undefined;
    cover = p?.cover_path ? urls.get(p.cover_path) : undefined;
  }
  return (
    <ManageEdit perm="class.manage" next="/settings/class" id={cls.id} table="classes" icon="book" title="Pengaturan kelas"
      description="Identitas kelas yang tampil di Beranda, halaman Kelas, dan menu."
      parent={{ label: 'Pengaturan', href: '/settings/profile' }} action={updateClass} fieldsFor={classFields}
      after={() => (
        <>
          <ImageForm id="logo" title="Logo" description="Tampil di menu dan layar masuk. Gambar persegi paling pas." variant="logo" url={logo}
            uploadAction={uploadClassImage} removeAction={removeClassImage} hidden={{ kind: 'logo' }} spec={{ maxSide: 512 }}
            removeConsequence="Logo diganti dengan ikon bawaan." />
          <ImageForm id="cover" title="Sampul" description="Gambar sampul di Beranda. Disarankan 1600×500 (16:5); sampul lama tetap dipotong di tengah." variant="cover" url={cover}
            uploadAction={uploadClassImage} removeAction={removeClassImage} hidden={{ kind: 'cover' }} spec={{ crop: [1600, 500] }}
            removeConsequence="Beranda memakai latar warna tema." />
        </>
      )} />
  );
}
