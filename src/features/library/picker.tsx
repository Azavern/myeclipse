'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { formatBytes } from '@/lib/gdrive/files';
import {
  LIBRARY_COOLDOWN_TEXT, LIBRARY_FOLDER_MAX, LIBRARY_FOLDER_STEP,
  type LibraryBrowseView,
} from '@/lib/library/view';
import { browseLibraryFolder, pickLibraryImage } from './navigator-actions';

type State =
  | { kind: 'loading' }
  | { kind: 'cooldown'; until: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: LibraryBrowseView };

// Pemilih gambar dari Library: menelusuri folder Drive anggota (maksimal 10
// folder dan 10 gambar per tampilan), lalu mengambil satu gambar sebagai File
// untuk form gambar yang sedang diisi. Setiap pengambilan dibatasi server, dan
// jeda ditampilkan di sini tanpa menutup dialog.
export function LibraryImagePicker({ onPick, label = 'Pilih dari Library' }: {
  onPick: (file: File) => void; label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [folders, setFolders] = useState(LIBRARY_FOLDER_STEP);
  const [selected, setSelected] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.kind !== 'cooldown') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [state.kind]);

  const remaining = state.kind === 'cooldown' ? Math.max(0, Math.ceil((state.until - now) / 1_000)) : 0;

  async function load(nextFolder: string | null, nextPage = 1, nextFolders = LIBRARY_FOLDER_STEP) {
    setState({ kind: 'loading' });
    setSelected(null);
    setNote('');
    const result = await browseLibraryFolder({ folderId: nextFolder, page: nextPage, folders: nextFolders });
    if (!result.ok) {
      if (result.code === 'cooldown') {
        setNow(Date.now());
        setState({ kind: 'cooldown', until: Date.now() + result.retryAfterMs });
        return;
      }
      setState({ kind: 'error', message: result.message });
      return;
    }
    setFolderId(nextFolder);
    setPage(nextPage);
    setFolders(nextFolders);
    setState({ kind: 'ready', data: result.data });
  }

  function open() {
    dialog.current?.showModal();
    setTrail([]);
    setFolderId(null);
    setPage(1);
    setFolders(LIBRARY_FOLDER_STEP);
    void load(null);
  }

  function enter(entry: { id: string; name: string }) {
    setTrail((list) => [...list, { id: entry.id, name: entry.name }]);
    void load(entry.id);
  }

  function back() {
    const previous = trail[trail.length - 1];
    setTrail((list) => list.slice(0, -1));
    void load(previous?.id ?? null);
  }

  async function apply() {
    if (!selected) return;
    setPicking(true);
    setNote('');
    const result = await pickLibraryImage(selected);
    if (!result.ok) {
      setPicking(false);
      setNote(result.message);
      return;
    }
    try {
      const response = await fetch(result.data.url, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      onPick(new File([blob], result.data.name, { type: blob.type || 'image/webp' }));
      dialog.current?.close();
    } catch {
      setNote('Gambar tidak bisa diambil dari Library. Coba gambar lain atau unggah dari perangkat.');
    } finally {
      setPicking(false);
    }
  }

  const where = state.kind === 'ready' ? state.data.folder.name : trail[trail.length - 1]?.name ?? 'Library';

  return (
    <>
      <button type="button" className="btn btn--secondary btn--sm" onClick={open}>
        <Icon name="image" size={16} />{label}
      </button>

      <dialog
        ref={dialog} className="library-dialog" aria-labelledby="library-pick-title"
        onClick={(event) => { if (event.target === event.currentTarget && !picking) dialog.current?.close(); }}
      >
        <div className="dialog__body">
          <h2 id="library-pick-title">Pilih gambar dari Library</h2>
          <p className="muted">Isi folder Google Drive Library-mu. Maksimal 10 folder dan 10 gambar setiap tampilan.</p>

          <div className="cloud-browse">
            <div className="cloud-browse__bar">
              <button
                type="button" className="btn btn--secondary btn--sm"
                disabled={trail.length === 0 || state.kind === 'loading'} onClick={back}
              >
                <Icon name="arrow-left" size={16} />Kembali
              </button>
              <span className="cloud-browse__where" aria-live="polite">
                <Icon name={state.kind === 'loading' ? 'loader' : 'folder'} size={16} className={state.kind === 'loading' ? 'spin' : undefined} />
                {where}
              </span>
            </div>

            {state.kind === 'loading' && (
              <p className="cloud-browse__note" role="status">Mengambil daftar dari Google Drive…</p>
            )}

            {state.kind === 'error' && <Notice tone="error" role="alert">{state.message}</Notice>}

            {state.kind === 'cooldown' && (
              <div className="library-cooldown" role="status" aria-live="polite">
                <p className="library-cooldown__title"><Icon name="clock" size={18} />{LIBRARY_COOLDOWN_TEXT}</p>
                <p className="library-cooldown__time nums">{remaining > 0 ? `${remaining} detik` : 'Siap dipakai'}</p>
                <p className="field__hint">Library diambil ulang setiap kali dibuka atau dimuat ulang, jadi pemakaiannya dibatasi.</p>
                <button
                  type="button" className="btn btn--secondary btn--sm" disabled={remaining > 0}
                  onClick={() => void load(folderId, page, folders)}
                >
                  Coba lagi
                </button>
              </div>
            )}

            {state.kind === 'ready' && (
              <>
                {state.data.folders.length > 0 && (
                  <ul className="cloud-browse__grid" aria-label={`Subfolder di ${state.data.folder.name}`}>
                    {state.data.folders.map((folder) => (
                      <li key={folder.id} className="cloud-browse__item">
                        <button type="button" className="cloud-browse__card" onClick={() => enter(folder)}>
                          <span className="cloud-browse__icon"><Icon name="folder" size={20} /></span>
                          <span className="cloud-browse__text"><span className="cloud-browse__name">{folder.name}</span></span>
                          <Icon name="chevron-right" size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {state.data.foldersMore && (
                  <button
                    type="button" className="btn btn--secondary btn--sm"
                    onClick={() => void load(folderId, page, Math.min(folders + LIBRARY_FOLDER_STEP, LIBRARY_FOLDER_MAX))}
                  >
                    Tampilkan {LIBRARY_FOLDER_STEP} folder lagi
                  </button>
                )}

                {state.data.folders.length === 0 && (
                  <p className="cloud-browse__note">Tidak ada subfolder di folder ini.</p>
                )}

                {state.data.images.length === 0 ? (
                  <p className="cloud-browse__note">Tidak ada gambar di folder ini.</p>
                ) : (
                  <ul className="library-picker" aria-label={`Gambar di ${state.data.folder.name}`}>
                    {state.data.images.map((image) => (
                      <li key={image.id}>
                        <label className={cx('library-picker__item', !image.libraryId && 'library-picker__item--off')}>
                          <input
                            type="radio" name="library-image" value={image.libraryId ?? ''}
                            disabled={!image.libraryId}
                            checked={image.libraryId !== null && selected === image.libraryId}
                            onChange={() => setSelected(image.libraryId)}
                          />
                          <span className="library-picker__thumb">
                            {image.thumbUrl
                              ? <img src={image.thumbUrl} alt="" width={160} height={120} loading="lazy" decoding="async" />
                              : <Icon name="image" size={20} />}
                          </span>
                          <span className="library-picker__text">
                            <span className="library-picker__title">{image.name}</span>
                            <span className="muted">
                              {image.size !== null ? formatBytes(image.size) : 'Gambar'}
                              {image.libraryId ? ' · siap dipakai' : ' · belum ada di Library'}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {(state.data.page > 1 || state.data.hasMoreImages) && (
                  <div className="library-nav__pages">
                    <button
                      type="button" className="btn btn--secondary btn--sm"
                      disabled={state.data.page <= 1}
                      onClick={() => void load(folderId, state.data.page - 1, folders)}
                    >
                      <Icon name="arrow-left" size={16} />Sebelumnya
                    </button>
                    <span className="nums">Halaman {state.data.page}</span>
                    <button
                      type="button" className="btn btn--secondary btn--sm"
                      disabled={!state.data.hasMoreImages}
                      onClick={() => void load(folderId, state.data.page + 1, folders)}
                    >
                      Berikutnya<Icon name="chevron-right" size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {note && <Notice tone="error" role="alert">{note}</Notice>}
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" disabled={picking} onClick={() => dialog.current?.close()}>
            Batal
          </button>
          <button
            type="button" className="btn" disabled={!selected || picking || state.kind !== 'ready'}
            aria-busy={picking} onClick={() => void apply()}
          >
            {picking ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
            {picking ? 'Mengambil…' : 'Pakai gambar'}
          </button>
        </div>
      </dialog>
    </>
  );
}
