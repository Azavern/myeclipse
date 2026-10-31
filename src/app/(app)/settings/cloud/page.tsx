import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EntityForm } from '@/components/entity-form';
import { NoAccess } from '@/components/states';
import { Notice, PageHeader } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import { updateGdriveSettings } from '@/features/gdrive/actions';
import { getClass } from '@/lib/class';
import { gdriveStatus } from '@/lib/gdrive/drive';
import { classUploadSettings } from '@/lib/gdrive/uploads';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Cloud kelas' };

function fields(maxMb: number, archives: boolean): Field[] {
  return [
    {
      name: 'max_file_mb', label: 'Ukuran maksimum file (MB)', type: 'text', required: true, max: 4,
      value: String(maxMb), hint: 'Bawaan 500 MB. Berlaku untuk semua anggota; server memeriksa ulang saat unggahan dimulai.',
    },
    {
      name: 'archives_enabled', label: 'Izinkan file arsip', type: 'select', value: archives ? '1' : '0',
      options: [['1', 'Ya — ZIP dan RAR'], ['0', 'Tidak']],
      hint: 'Menonaktifkan arsip juga menolak file yang menyamar sebagai arsip.',
    },
  ];
}

export default async function SettingsCloudPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fcloud');
  if (!viewer.can('class.manage')) return <NoAccess />;
  const cls = await getClass();
  if (!cls) notFound();
  const settings = await classUploadSettings(await createClient(), cls.id);
  const status = gdriveStatus();

  return (
    <>
      <PageHeader icon="upload" title="Cloud kelas" description="Batas unggahan dan izin file arsip untuk seluruh anggota." />
      {!status.ready && (
        <Notice tone="warning">
          Google Drive belum aktif. Variabel server yang belum diisi: <code>{status.missing.join(', ')}</code>.
          Halaman ini tetap bisa disimpan; unggahan baru menunggu konfigurasi lengkap.
        </Notice>
      )}
      <section className="card" aria-labelledby="gdrive-settings-title">
        <div className="card__head"><h2 id="gdrive-settings-title" className="card__title">Pengaturan unggahan</h2></div>
        <EntityForm action={updateGdriveSettings} fields={fields(settings.maxMb, settings.archivesEnabled)} submit="Simpan pengaturan" columns={2} />
      </section>
      <Notice tone="info">
        Batas ini hanya mengatur ukuran dan arsip. Folder tujuan, default pribadi, dan folder eksternal diatur setiap
        anggota di halaman Cloud. Kredensial Google Drive hanya ada di server dan tidak pernah dikirim ke peramban.
      </Notice>
    </>
  );
}
