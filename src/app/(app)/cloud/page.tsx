import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { CloudUploader, type ActiveUploadView, type CloudFolderView } from '@/features/gdrive/cloud-uploader';
import { getClass } from '@/lib/class';
import { gdriveStatus } from '@/lib/gdrive/drive';
import { classUploadSettings } from '@/lib/gdrive/uploads';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Cloud' };

type FolderRow = { id: string; name: string; kind: 'custom' | 'external' };
type UploadRow = {
  id: string; drive_file_name: string; original_name: string;
  size_bytes: number | string; bytes_uploaded: number | string; created_at: string;
};

export default async function CloudPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fcloud');
  if (viewer.status !== 'active') return <NoAccess />;
  const cls = await getClass();
  if (!cls) notFound();

  const supabase = await createClient();
  const [foldersResult, profileResult, activeResult, settings] = await Promise.all([
    supabase.from('gdrive_folders').select('id,name,kind')
      .eq('class_id', cls.id).eq('owner_id', viewer.user.id)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('gdrive_profiles').select('default_folder_id')
      .eq('class_id', cls.id).eq('owner_id', viewer.user.id).maybeSingle(),
    supabase.from('gdrive_uploads')
      .select('id,drive_file_name,original_name,size_bytes,bytes_uploaded,created_at')
      .eq('class_id', cls.id).eq('owner_id', viewer.user.id)
      .in('status', ['pending', 'uploading', 'verifying'])
      .order('created_at', { ascending: false }).limit(20),
    classUploadSettings(supabase, cls.id),
  ]);

  const rawFolders = (foldersResult.data ?? []) as FolderRow[];
  const defaultId = (profileResult.data as { default_folder_id: string | null } | null)?.default_folder_id ?? null;
  const folders: CloudFolderView[] = rawFolders.map((folder) => ({
    id: folder.id, name: folder.name, kind: folder.kind, isDefault: folder.id === defaultId,
  }));
  const active: ActiveUploadView[] = ((activeResult.data ?? []) as UploadRow[]).map((row) => ({
    id: row.id, name: row.drive_file_name, originalName: row.original_name,
    size: Number(row.size_bytes), bytesUploaded: Number(row.bytes_uploaded), createdAt: row.created_at,
  }));
  const status = gdriveStatus();

  return (
    <CloudUploader
      configured={status.ready}
      missing={status.missing}
      maxMb={settings.maxMb}
      archivesEnabled={settings.archivesEnabled}
      canManage={viewer.can('class.manage')}
      folders={folders}
      defaultFolderId={defaultId}
      tz={cls.timezone}
      active={active}
    />
  );
}
