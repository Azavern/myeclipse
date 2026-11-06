'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
import { Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { formatBytes } from '@/lib/gdrive/files';
import { compressImage } from '@/lib/image-client';
import {
  LIBRARY_MAX_ORIGINAL_BYTES, LIBRARY_MAX_PREVIEW_BYTES,
  LIBRARY_VISIBILITY_LABEL, libraryTitle, type LibraryBucket, type LibraryVisibility,
} from '@/lib/library/shared';
import { formatWhen } from '@/lib/time';
import { deleteLibraryItems, renameLibraryItem, setLibraryVisibility } from './actions';

export type LibraryItemView = {
  id: string; title: string; url: string | null; ownerId: string; ownerName: string;
  size: number; hd: boolean; visibility: LibraryVisibility; bucket: LibraryBucket;
  createdAt: string; sharedWith: string[];
};
export type LibraryMember = { id: string; name: string };

type Tab = 'mine' | 'shared' | 'all';
type Tone = 'info' | 'success' | 'warning' | 'error';
type Message = { tone: Tone; text: string } | null;
type UploadRow = { id: string; name: string; status: 'busy' | 'done' | 'error'; message?: string };

const VIS_TONE: Record<LibraryVisibility, 'neutral' | 'brand' | 'accent'> = {
  private: 'neutral', all: 'brand', specific: 'accent',
};
const VIS_ICON: Record<LibraryVisibility, IconName> = {
  private: 'lock', all: 'users', specific: 'user-plus',
};
const TABS: { id: Tab; label: string }[] = [
  { id: 'mine', label: 'Milik saya' },
  { id: 'shared', label: 'Dibagikan ke saya' },
  { id: 'all', label: 'Semua' },
];

export function LibraryManager({ items, members, meId, tz }: {
  items: LibraryItemView[]; members: LibraryMember[]; meId: string; tz: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('mine');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  const [visTargets, setVisTargets] = useState<string[]>([]);
  const [visValue, setVisValue] = useState<LibraryVisibility>('private');
  const [visMembers, setVisMembers] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState('');

  const [renameTarget, setRenameTarget] = useState<LibraryItemView | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const visibilityRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const renameRef = useRef<HTMLDialogElement>(null);

  const uploading = uploads.some((row) => row.status === 'busy');
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('id-ID');
    return items.filter((item) => {
      if (tab === 'mine' && item.ownerId !== meId) return false;
      if (tab === 'shared' && item.ownerId === meId) return false;
      return !term || item.title.toLocaleLowerCase('id-ID').includes(term)
        || item.ownerName.toLocaleLowerCase('id-ID').includes(term);
    });
  }, [items, tab, meId, query]);
  const mineVisible = visible.filter((item) => item.ownerId === meId);
  const allSelected = mineVisible.length > 0 && mineVisible.every((item) => selected.includes(item.id));
  const filteredMembers = useMemo(() => {
    const term = memberQuery.trim().toLocaleLowerCase('id-ID');
    return members.filter((member) => !term || member.name.toLocaleLowerCase('id-ID').includes(term));
  }, [members, memberQuery]);

  const mineCount = items.filter((item) => item.ownerId === meId).length;
  const sharedCount = items.length - mineCount;
  const hdCount = items.filter((item) => item.ownerId === meId && item.hd).length;

  function patchUpload(id: string, next: Partial<UploadRow>) {
    setUploads((list) => list.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  async function uploadOne(file: File) {
    const id = crypto.randomUUID();
    setUploads((list) => [{ id, name: file.name, status: 'busy' }, ...list]);
    try {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        throw new Error('Hanya JPEG, PNG, atau WebP yang bisa diunggah.');
      }
      if (file.size > LIBRARY_MAX_ORIGINAL_BYTES) throw new Error('Ukuran gambar asli maksimal 10 MB.');
      const preview = await compressImage(file, { maxSide: 1600 });
      if (preview.size > LIBRARY_MAX_PREVIEW_BYTES) throw new Error('Hasil kompresi masih melebihi 2 MB.');
      const body = new FormData();
      body.set('original', file);
      body.set('preview', new File([preview], 'gambar.webp', { type: preview.type }));
      body.set('title', libraryTitle(file.name));
      const response = await fetch('/api/library/upload', { method: 'POST', body });
      const json = (await response.json().catch(() => null)) as
        | { ok?: boolean; warning?: string | null; error?: { message?: string } }
        | null;
      if (!response.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Gambar belum tersimpan.');
      patchUpload(id, { status: 'done', message: json.warning ?? 'Versi ringan dan versi HD tersimpan.' });
    } catch (error) {
      patchUpload(id, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Gambar gagal disimpan. Coba lagi.',
      });
    }
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0 || uploading) return;
    setMessage(null);
    for (const file of files) await uploadOne(file);
    router.refresh();
  }

  function toggle(id: string) {
    setSelected((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]));
  }

  function toggleAll() {
    const ids = mineVisible.map((item) => item.id);
    setSelected((list) => (allSelected
      ? list.filter((id) => !ids.includes(id))
      : Array.from(new Set([...list, ...ids]))));
  }

  function openVisibility(ids: string[]) {
    const own = items.filter((item) => ids.includes(item.id) && item.ownerId === meId);
    if (own.length === 0) return;
    const first = own[0];
    setVisTargets(own.map((item) => item.id));
    setVisValue(own.length === 1 && first ? first.visibility : 'private');
    setVisMembers(own.length === 1 && first ? [...first.sharedWith] : []);
    setMemberQuery('');
    visibilityRef.current?.showModal();
  }

  function openRename(item: LibraryItemView) {
    setRenameTarget(item);
    setRenameValue(item.title);
    renameRef.current?.showModal();
  }

  async function submitVisibility(event: FormEvent) {
    event.preventDefault();
    if (visTargets.length === 0) return;
    if (visValue === 'specific' && visMembers.length === 0) {
      setMessage({ tone: 'warning', text: 'Pilih minimal satu anggota untuk visibilitas ini.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await setLibraryVisibility({
      ids: visTargets,
      visibility: visValue,
      memberIds: visValue === 'specific' ? visMembers : [],
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error.message });
      return;
    }
    visibilityRef.current?.close();
    setSelected([]);
    setMessage({ tone: 'success', text: 'Visibilitas gambar diperbarui.' });
    router.refresh();
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!renameTarget) return;
    setBusy(true);
    setMessage(null);
    const result = await renameLibraryItem({ id: renameTarget.id, title: renameValue });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error.message });
      return;
    }
    renameRef.current?.close();
    setMessage({ tone: 'success', text: 'Judul gambar diperbarui.' });
    router.refresh();
  }

  async function submitDelete(event: FormEvent) {
    event.preventDefault();
    if (selected.length === 0) return;
    setBusy(true);
    setMessage(null);
    const result = await deleteLibraryItems(selected);
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error.message });
      return;
    }
    deleteRef.current?.close();
    setSelected([]);
    setMessage({
      tone: 'success',
      text: `${result.data.removed} gambar dihapus dari Library. Salinan di form lain tidak terpengaruh.`,
    });
    router.refresh();
  }

  return (
    <>
      <section className="card library-upload" aria-labelledby="library-upload-title">
        <div className="card__head">
          <div>
            <h2 id="library-upload-title" className="card__title"><Icon name="upload" size={20} />Unggah gambar</h2>
            <p className="card__desc">
              Setiap gambar disimpan dua kali: versi ringan untuk tampilan, dan versi asli di
              Google Drive untuk unduhan HD. Ekstensi asli dipertahankan.
            </p>
          </div>
          <Chip tone="outline">Maks 10 MB</Chip>
        </div>

        <label className={cx('library-drop', uploading && 'library-drop--off')} htmlFor="library-files">
          <input id="library-files" type="file" multiple accept="image/jpeg,image/png,image/webp"
            className="sr-only" disabled={uploading} onChange={onPick} aria-describedby="library-files-hint" />
          <span className="library-drop__art" aria-hidden="true">
            {uploading ? <Icon name="loader" size={24} className="spin" /> : <Icon name="image" size={24} />}
          </span>
          <span>
            <span className="library-drop__title">{uploading ? 'Menyimpan gambar…' : 'Pilih gambar'}</span>
            <span id="library-files-hint" className="library-drop__hint">JPEG, PNG, atau WebP. Bisa pilih beberapa sekaligus.</span>
          </span>
        </label>

        {uploads.length > 0 && (
          <ul className="library-queue" aria-label="Hasil unggahan">
            {uploads.map((row) => (
              <li key={row.id} className="library-queue__item" data-status={row.status}>
                <Icon name={row.status === 'busy' ? 'loader' : row.status === 'done' ? 'check-circle' : 'alert-circle'}
                  size={18} className={row.status === 'busy' ? 'spin' : undefined} />
                <span className="library-queue__name">{row.name}</span>
                <span className="muted">{row.message ?? 'Menyiapkan…'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="library-toolbar">
        <div className="segmented" role="tablist" aria-label="Saring Library">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id}
              aria-pressed={tab === item.id}
              onClick={() => { setTab(item.id); setSelected([]); }}>
              {item.label}
              <span className="library-count">{item.id === 'mine' ? mineCount : item.id === 'shared' ? sharedCount : items.length}</span>
            </button>
          ))}
        </div>
        <div className="search">
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Cari judul atau pemilik" aria-label="Cari gambar di Library" />
        </div>
      </div>

      <p className="library-summary" aria-live="polite">
        {mineCount} gambar milikmu · {hdCount} punya versi HD · {sharedCount} dibagikan ke kamu
      </p>

      {message && (
        <Notice tone={message.tone === 'warning' ? 'warning' : message.tone === 'success' ? 'success' : message.tone === 'error' ? 'error' : 'info'}
          role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</Notice>
      )}

      {selected.length > 0 && (
        <div className="library-bar" role="region" aria-label="Aksi untuk gambar terpilih">
          <span className="library-bar__count">
            <Icon name="check-circle" size={18} />{selected.length} dipilih
          </span>
          <div className="cluster">
            <button type="button" className="btn btn--secondary btn--sm" disabled={busy}
              onClick={() => openVisibility(selected)}>
              <Icon name="eye" size={16} />Atur visibilitas
            </button>
            <button type="button" className="btn btn--danger-soft btn--sm" disabled={busy}
              onClick={() => deleteRef.current?.showModal()}>
              <Icon name="trash" size={16} />Hapus
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
              onClick={() => setSelected([])}>Batal pilih</button>
          </div>
        </div>
      )}

      {mineVisible.length > 0 && (
        <div className="library-selectall">
          <button type="button" className="link-btn" onClick={toggleAll}>
            <Icon name={allSelected ? 'x' : 'check-circle'} size={16} />
            {allSelected ? 'Kosongkan pilihan' : `Pilih semua (${mineVisible.length})`}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState compact icon="image" title={tab === 'shared' ? 'Belum ada gambar yang dibagikan' : 'Belum ada gambar'}
          action={tab !== 'shared'
            ? <label className="btn btn--secondary" htmlFor="library-files"><Icon name="upload" size={18} />Pilih gambar</label>
            : undefined}>
          {tab === 'shared'
            ? 'Gambar dari anggota lain yang dibagikan ke semua anggota atau khusus kepadamu akan muncul di sini.'
            : 'Unggah gambar pertama untuk mulai membangun Library-mu.'}
        </EmptyState>
      ) : (
        <ul className="library-grid">
          {visible.map((item) => {
            const isOwn = item.ownerId === meId;
            const isSelected = selected.includes(item.id);
            return (
              <li key={item.id}>
                <article className={cx('lib-card', isSelected && 'is-selected')} data-selected={isSelected || undefined}>
                  <div className="lib-card__media">
                    {item.url
                      ? <img src={item.url} alt={item.title} loading="lazy" decoding="async" width={480} height={360} />
                      : <span className="lib-card__ph" aria-hidden="true"><Icon name="image" size={28} /></span>}
                    {isOwn && (
                      <label className="lib-check">
                        <input type="checkbox" checked={isSelected} onChange={() => toggle(item.id)}
                          aria-label={`Pilih ${item.title}`} />
                        <span className="lib-check__mark" aria-hidden="true"><Icon name="check" size={16} /></span>
                      </label>
                    )}
                    <span className={cx('lib-card__hd', !item.hd && 'lib-card__hd--off')}>
                      {item.hd ? 'HD' : 'Tanpa HD'}
                    </span>
                  </div>
                  <div className="lib-card__body">
                    <h3 className="lib-card__title">{item.title}</h3>
                    <p className="meta">
                      <span>{formatBytes(item.size)}</span>
                      <span>{formatWhen(item.createdAt, tz)}</span>
                    </p>
                    <div className="cluster">
                      <Chip tone={VIS_TONE[item.visibility]} icon={VIS_ICON[item.visibility]}>
                        {isOwn ? LIBRARY_VISIBILITY_LABEL[item.visibility] : `Dari ${item.ownerName}`}
                      </Chip>
                      {item.bucket === 'class-media' && (
                        <Chip tone="outline" icon="users">Media kelas</Chip>
                      )}
                      {isOwn && item.visibility === 'specific' && (
                        <span className="muted">{item.sharedWith.length} anggota</span>
                      )}
                    </div>
                    <div className="lib-card__actions">
                      {item.hd
                        ? (
                          <a className="btn btn--secondary btn--sm" href={`/api/library/${item.id}/download?v=hd`}>
                            <Icon name="download" size={16} />Download HD
                          </a>
                        )
                        : <button type="button" className="btn btn--secondary btn--sm" disabled>HD tidak tersedia</button>}
                      <a className="btn btn--ghost btn--sm" href={`/api/library/${item.id}/download?v=preview`}>
                        <Icon name="download" size={16} />Versi kompresi
                      </a>
                      {isOwn && (
                        <>
                          <button type="button" className="btn btn--ghost btn--sm btn--icon"
                            aria-label={`Atur visibilitas ${item.title}`} title="Atur visibilitas"
                            onClick={() => openVisibility([item.id])}>
                            <Icon name="eye" size={18} />
                          </button>
                          <button type="button" className="btn btn--ghost btn--sm btn--icon"
                            aria-label={`Ubah judul ${item.title}`} title="Ubah judul"
                            onClick={() => openRename(item)}>
                            <Icon name="pencil" size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {/* Visibilitas */}
      <dialog ref={visibilityRef} aria-labelledby="library-vis-title"
        onClick={(event) => { if (event.target === event.currentTarget && !busy) visibilityRef.current?.close(); }}>
        <form onSubmit={submitVisibility} aria-busy={busy}>
          <div className="dialog__body">
            <h2 id="library-vis-title">Atur visibilitas</h2>
            <p className="muted">
              Berlaku untuk {visTargets.length === 1 ? '1 gambar' : `${visTargets.length} gambar`}.
              Unduhan HD mengikuti visibilitas yang sama.
            </p>

            <fieldset className="library-vis">
              <legend className="sr-only">Siapa yang boleh melihat</legend>
              {(['private', 'all', 'specific'] as const).map((value) => (
                <label key={value} className="library-vis__option">
                  <input type="radio" name="library-visibility" value={value} checked={visValue === value}
                    onChange={() => setVisValue(value)} />
                  <span>
                    <span className="library-vis__label">{LIBRARY_VISIBILITY_LABEL[value]}</span>
                    <span className="muted">
                      {value === 'private' && 'Hanya kamu yang bisa melihat dan mengunduh.'}
                      {value === 'all' && 'Semua anggota aktif bisa melihat dan mengunduh versi HD.'}
                      {value === 'specific' && 'Hanya anggota yang kamu centang di bawah ini.'}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {visValue === 'specific' && (
              <div className="library-members">
                <div className="library-members__head">
                  <span className="field__label">Anggota</span>
                  <span className="muted">{visMembers.length} dipilih</span>
                </div>
                {members.length === 0
                  ? <p className="muted">Daftar anggota belum tersedia. Visibilitas &quot;Semua anggota&quot; tetap bisa dipakai.</p>
                  : (
                    <>
                      <input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.currentTarget.value)}
                        placeholder="Cari anggota" aria-label="Cari anggota" />
                      <ul className="library-members__list">
                        {filteredMembers.map((member) => (
                          <li key={member.id}>
                            <label className="library-members__item">
                              <input type="checkbox" checked={visMembers.includes(member.id)}
                                onChange={() => setVisMembers((list) => (list.includes(member.id)
                                  ? list.filter((id) => id !== member.id)
                                  : [...list, member.id]))} />
                              <span>{member.name}</span>
                            </label>
                          </li>
                        ))}
                        {filteredMembers.length === 0 && <li className="muted">Tidak ada anggota yang cocok.</li>}
                      </ul>
                    </>
                  )}
              </div>
            )}
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={busy}
              onClick={() => visibilityRef.current?.close()}>Batal</button>
            <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
              {busy && <Icon name="loader" size={18} className="spin" />}{busy ? 'Menyimpan…' : 'Simpan visibilitas'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Ubah judul */}
      <dialog ref={renameRef} aria-labelledby="library-rename-title"
        onClick={(event) => { if (event.target === event.currentTarget && !busy) renameRef.current?.close(); }}>
        <form onSubmit={submitRename} aria-busy={busy}>
          <div className="dialog__body">
            <h2 id="library-rename-title">Ubah judul gambar</h2>
            <div className="field">
              <label className="field__label" htmlFor="library-title-input">Judul</label>
              <input id="library-title-input" value={renameValue} maxLength={120} required
                onChange={(event) => setRenameValue(event.currentTarget.value)} />
            </div>
            <p className="muted">Nama file asli di Google Drive tidak berubah.</p>
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={busy}
              onClick={() => renameRef.current?.close()}>Batal</button>
            <button type="submit" className="btn" disabled={busy} aria-busy={busy}>
              {busy && <Icon name="loader" size={18} className="spin" />}{busy ? 'Menyimpan…' : 'Simpan judul'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Hapus */}
      <dialog ref={deleteRef} aria-labelledby="library-delete-title"
        onClick={(event) => { if (event.target === event.currentTarget && !busy) deleteRef.current?.close(); }}>
        <form onSubmit={submitDelete} aria-busy={busy}>
          <div className="dialog__body">
            <span className="tile tile--error" aria-hidden="true"><Icon name="alert-triangle" size={22} /></span>
            <h2 id="library-delete-title">Hapus {selected.length} gambar?</h2>
            <p className="muted">
              Baris Library dan versi kompresinya dihapus, begitu juga file asli di Drive bila ada.
              Media kelas yang masih dipakai halaman kelas atau event tetap disimpan, dan salinan yang
              sudah dipakai di form lain tidak terpengaruh. Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={busy}
              onClick={() => deleteRef.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={busy} aria-busy={busy}>
              {busy && <Icon name="loader" size={18} className="spin" />}{busy ? 'Menghapus…' : 'Hapus gambar'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
