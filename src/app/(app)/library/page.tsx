import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, Notice, PageHeader } from '@/components/ui/primitives';
import { LibraryCooldown } from '@/features/library/cooldown';
import { LibraryManager, type LibraryItemView, type LibraryMember } from '@/features/library/library-manager';
import { getClass } from '@/lib/class';
import { gdriveStatus } from '@/lib/gdrive/drive';
import { formatBytes } from '@/lib/gdrive/files';
import { gateLibraryFetch } from '@/lib/library/guard';
import { browseLibrary, libraryRoot, LibraryNavError } from '@/lib/library/navigator';
import { isLibraryVisibility } from '@/lib/library/shared';
import {
  LIBRARY_FOLDER_MAX, LIBRARY_FOLDER_STEP, LIBRARY_PAGE_MAX, type LibraryBrowseView,
} from '@/lib/library/view';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Library' };

type Row = {
  id: string; owner_id: string; title: string; storage_path: string; size_bytes: number;
  drive_file_id: string | null; visibility: string; created_at: string;
};
type ProfileRow = { user_id: string; full_name: string; username: string };
type GrantRow = { item_id: string; user_id: string };
type Params = { folder?: string; page?: string; folders?: string };

const wholeNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

// Penjelajah Drive memakai URL untuk lokasi folder dan halaman, jadi tombol
// kembali, muat ulang, dan tautan yang dibagikan menunjuk isi yang sama.
function folderHref(folderId: string | null, next?: { page?: number; folders?: number }): string {
  const query = new URLSearchParams();
  if (folderId) query.set('folder', folderId);
  const folders = next?.folders ?? LIBRARY_FOLDER_STEP;
  if (folders > LIBRARY_FOLDER_STEP) query.set('folders', String(folders));
  const page = next?.page ?? 1;
  if (page > 1) query.set('page', String(page));
  const suffix = query.toString();
  return suffix ? `/library?${suffix}` : '/library';
}

// Library hanya untuk anggota aktif. RLS menentukan item mana yang terlihat:
// milik sendiri, semua anggota, atau yang dibagikan secara spesifik. Penjelajah
// Drive menampilkan isi folder Library sendiri dan dibatasi di server.
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Flibrary');
  if (viewer.status !== 'active') return <NoAccess />;
  const userId = viewer.user.id;

  const params = await searchParams;
  const pageRequested = Math.min(LIBRARY_PAGE_MAX, Math.max(1, wholeNumber(params.page, 1)));
  const foldersRequested = Math.min(LIBRARY_FOLDER_MAX, Math.max(LIBRARY_FOLDER_STEP, wholeNumber(params.folders, LIBRARY_FOLDER_STEP)));

  const supabase = await createClient();
  const cls = await getClass();
  const drive = gdriveStatus();

  // Folder yang belum ada atau pengambilan yang masih dijeda tidak memanggil
  // Drive sama sekali; halaman menampilkan alasannya.
  const navTask = (async (): Promise<{ browse: LibraryBrowseView | null; error: string | null; cooldownMs: number }> => {
    if (!drive.ready || !cls) return { browse: null, error: null, cooldownMs: 0 };
    try {
      const root = await libraryRoot(supabase, cls.id, userId);
      if (!root) {
        return {
          browse: null,
          error: 'Folder Drive Library belum ada. Unggah satu gambar lebih dulu, lalu muat ulang halaman.',
          cooldownMs: 0,
        };
      }
      const gate = await gateLibraryFetch(supabase, userId);
      if (!gate.allowed) return { browse: null, error: null, cooldownMs: gate.retryAfterMs };
      const browse = await browseLibrary({
        supabase, userId, classId: cls.id, root,
        folderId: params.folder ?? null, folders: foldersRequested, page: pageRequested,
      });
      return { browse, error: null, cooldownMs: 0 };
    } catch (error) {
      if (!(error instanceof LibraryNavError)) console.error('library page: penjelajah gagal', error);
      return {
        browse: null,
        error: error instanceof LibraryNavError ? error.message : 'Isi folder belum bisa dibaca. Coba lagi.',
        cooldownMs: 0,
      };
    }
  })();

  const [itemsResult, membersResult, nav] = await Promise.all([
    supabase.from('library_items')
      .select('id,owner_id,title,storage_path,size_bytes,drive_file_id,visibility,created_at')
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('member_profile_v').select('user_id,full_name,username')
      .order('full_name').limit(300),
    navTask,
  ]);

  const rows = (itemsResult.data ?? []) as Row[];
  const profiles = (membersResult.data ?? []) as ProfileRow[];
  const names = new Map(profiles.map((profile) => [
    profile.user_id,
    profile.full_name?.trim() || profile.username,
  ] as const));
  names.set(userId, names.get(userId) ?? 'Saya');

  const ownIds = rows.filter((row) => row.owner_id === userId).map((row) => row.id);
  const grantsResult = ownIds.length > 0
    ? await supabase.from('library_item_access').select('item_id,user_id').in('item_id', ownIds)
    : { data: [] as GrantRow[] };
  const grants = new Map<string, string[]>();
  for (const grant of (grantsResult.data ?? []) as GrantRow[]) {
    const list = grants.get(grant.item_id) ?? [];
    list.push(grant.user_id);
    grants.set(grant.item_id, list);
  }

  const urls = await signMany(supabase, 'member-media', rows.map((row) => row.storage_path));
  const items: LibraryItemView[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    url: urls.get(row.storage_path) ?? null,
    ownerId: row.owner_id,
    ownerName: names.get(row.owner_id) ?? 'Anggota',
    size: row.size_bytes,
    hd: !!row.drive_file_id,
    visibility: isLibraryVisibility(row.visibility) ? row.visibility : 'private',
    createdAt: row.created_at,
    sharedWith: grants.get(row.id) ?? [],
  }));
  const members: LibraryMember[] = profiles
    .filter((profile) => profile.user_id !== userId)
    .map((profile) => ({ id: profile.user_id, name: profile.full_name?.trim() || profile.username }));

  const { browse, error: browseError, cooldownMs } = nav;

  return (
    <>
      <PageHeader icon="image" title="Library"
        description="Telusuri isi folder Drive Library-mu, kelola gambar yang pernah diunggah, atur siapa yang boleh melihat, dan pakai ulang di form lain." />

      <section className="card" aria-labelledby="lib-drive">
        <div className="card__head">
          <div>
            <h2 id="lib-drive" className="card__title"><Icon name="folder" size={20} />File di Google Drive</h2>
            <p className="card__desc">
              Lokasi Library saat ini. Maksimal 10 folder dan 10 gambar setiap tampilan; pengambilan
              dibatasi satu menit setelah terlalu sering dimuat ulang.
            </p>
          </div>
          {browse && <Chip tone="outline">{browse.folders.length} folder · {browse.images.length} gambar</Chip>}
        </div>

        {!drive.ready && (
          <Notice tone="warning">
            Penjelajah file belum aktif: server belum memiliki <code>{drive.missing.join(', ')}</code>.
          </Notice>
        )}

        {cooldownMs > 0 && <LibraryCooldown retryAfterMs={cooldownMs} />}

        {browseError && <Notice tone="info">{browseError}</Notice>}

        {browse && (
          <div className="cloud-browse">
            <div className="cloud-browse__bar">
              {browse.parent ? (
                <Link className="btn btn--secondary btn--sm" href={folderHref(browse.parent.id)}>
                  <Icon name="arrow-left" size={16} />Kembali
                </Link>
              ) : (
                <button type="button" className="btn btn--secondary btn--sm" disabled>
                  <Icon name="arrow-left" size={16} />Kembali
                </button>
              )}
              <span className="cloud-browse__where">
                <Icon name="folder" size={16} />{browse.folder.name}
              </span>
            </div>

            {browse.folders.length === 0 ? (
              <p className="cloud-browse__note">Tidak ada subfolder di folder ini.</p>
            ) : (
              <ul className="cloud-browse__grid" aria-label={`Subfolder di ${browse.folder.name}`}>
                {browse.folders.map((folder) => (
                  <li key={folder.id} className="cloud-browse__item">
                    <Link className="cloud-browse__card" href={folderHref(folder.id)}>
                      <span className="cloud-browse__icon"><Icon name="folder" size={20} /></span>
                      <span className="cloud-browse__text">
                        <span className="cloud-browse__name">{folder.name}</span>
                      </span>
                      <Icon name="chevron-right" size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {browse.foldersMore && (
              <Link
                className="btn btn--secondary btn--sm"
                href={folderHref(browse.folder.id, {
                  folders: Math.min(LIBRARY_FOLDER_MAX, browse.folders.length + LIBRARY_FOLDER_STEP),
                  page: browse.page,
                })}
              >
                <Icon name="folder" size={16} />Tampilkan {LIBRARY_FOLDER_STEP} folder lagi
              </Link>
            )}

            {browse.images.length === 0 ? (
              <p className="cloud-browse__note">Tidak ada gambar di folder ini.</p>
            ) : (
              <ul className="library-nav__images" aria-label={`Gambar di ${browse.folder.name}`}>
                {browse.images.map((image) => (
                  <li key={image.id}>
                    {image.thumbUrl ? (
                      <a className="library-nav__image" href={image.thumbUrl} target="_blank" rel="noopener noreferrer">
                        <span className="library-nav__image-thumb">
                          <img src={image.thumbUrl} alt="" width={160} height={120} loading="lazy" decoding="async" />
                        </span>
                        <span className="library-nav__image-name">{image.name}</span>
                        <span className="library-nav__image-meta">
                          {image.size !== null ? formatBytes(image.size) : 'Gambar'} · di Library
                        </span>
                      </a>
                    ) : (
                      <span className="library-nav__image">
                        <span className="library-nav__image-thumb"><Icon name="image" size={20} /></span>
                        <span className="library-nav__image-name">{image.name}</span>
                        <span className="library-nav__image-meta">
                          {image.size !== null ? formatBytes(image.size) : 'Gambar'} · belum ada di Library
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {(browse.page > 1 || browse.hasMoreImages) && (
              <div className="library-nav__pages">
                {browse.page > 1 ? (
                  <Link
                    className="btn btn--secondary btn--sm"
                    href={folderHref(browse.folder.id, { page: browse.page - 1, folders: foldersRequested })}
                  >
                    <Icon name="arrow-left" size={16} />Sebelumnya
                  </Link>
                ) : <span />}
                <span className="nums">Halaman {browse.page}</span>
                {browse.hasMoreImages ? (
                  <Link
                    className="btn btn--secondary btn--sm"
                    href={folderHref(browse.folder.id, { page: browse.page + 1, folders: foldersRequested })}
                  >
                    Berikutnya<Icon name="chevron-right" size={16} />
                  </Link>
                ) : <span />}
              </div>
            )}
          </div>
        )}
      </section>

      <LibraryManager items={items} members={members} meId={userId} tz={cls?.timezone ?? 'Asia/Jakarta'} />
    </>
  );
}
