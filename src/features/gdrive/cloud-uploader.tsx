'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from '@/components/ui/icon';
import { Chip, LinkButton, Notice, PageHeader } from '@/components/ui/primitives';
import {
  CATEGORY_EXT, CATEGORY_LABEL, FILE_ISSUE_MESSAGE, GDRIVE_CHUNK_BYTES, GDRIVE_MAX_FOLDERS,
  buildFinalName, categoryForExt, checkFile, extensionOf, formatBytes, parseFolderRef, slotHint,
  stripExtension, type Category,
} from '@/lib/gdrive/files';
import { formatWhen } from '@/lib/time';
import {
  addCloudFolder, addExternalFolder, beginUpload, browseCloudFolders, cancelUpload, completeUpload,
  createCloudFolder, removeCloudFolder, resumeUpload, setDefaultCloudFolder,
} from './actions';

export type CloudFolderView = { id: string; name: string; kind: 'custom' | 'external'; isDefault: boolean };
export type ActiveUploadView = {
  id: string; name: string; originalName: string; size: number; bytesUploaded: number; createdAt: string;
};
export type CloudUploaderProps = {
  configured: boolean; missing: string[]; maxMb: number; archivesEnabled: boolean; canManage: boolean;
  folders: CloudFolderView[]; defaultFolderId: string | null; tz: string; active: ActiveUploadView[];
};

type BrowseFolderView = {
  id: string; name: string; owner: string | null; folderId: string | null; isDefault: boolean;
};
type BrowseView = {
  folder: { id: string; name: string; added: boolean };
  parent: { id: string; name: string } | null;
  folders: BrowseFolderView[];
};

type Status = 'ready' | 'starting' | 'uploading' | 'finishing' | 'done' | 'error' | 'cancelled';
type Draft = {
  id: string; file: File; original: string; size: number; ext: string; category: Category | null;
  stem: string; issue: string | null; status: Status; progress: number; destination: string | null;
  destLabel: string | null; uploadId: string | null; error: string | null; link: string | null;
};
type Tone = 'info' | 'success' | 'warning' | 'error';
type Message = { tone: Tone; text: string } | null;
type GuideTab = 'how' | 'rules' | 'dest' | 'folders';

const STATUS_LABEL: Record<Status, string> = {
  ready: 'Siap', starting: 'Menyiapkan…', uploading: 'Mengunggah…', finishing: 'Memeriksa…',
  done: 'Selesai', error: 'Gagal', cancelled: 'Dibatalkan',
};

const STATUS_TONE: Record<Status, 'brand' | 'success' | 'error' | 'warning' | 'neutral'> = {
  ready: 'neutral', starting: 'brand', uploading: 'brand', finishing: 'brand',
  done: 'success', error: 'error', cancelled: 'warning',
};

const CATEGORY_ICON: Record<Category, IconName> = {
  pictures: 'image', videos: 'camera', audios: 'music', documents: 'book', archives: 'archive',
};

const GUIDE_TABS: { id: GuideTab; label: string }[] = [
  { id: 'how', label: 'Cara kerja' },
  { id: 'rules', label: 'Aturan unggah' },
  { id: 'dest', label: 'Urutan tujuan' },
  { id: 'folders', label: 'Folder' },
];

const SLOT_ROWS: [string, number][] = [
  ['> 99 MB', 1], ['> 50 MB', 2], ['> 25 MB', 3], ['> 10 MB', 4], ['> 1 MB', 5], ['≤ 1 MB', 10],
];

// Pemilih tujuan: daftar dipecah 10 per halaman dan disaring di peramban. Tidak ada
// data yang diminta tambahan ke server; nilai yang dipilih selalu diambil dari daftar
// tujuan yang diterima komponen, bukan dari teks pencarian.
type DestGroup = 'bawaan' | 'custom' | 'eksternal';
const DEST_PAGE_SIZE = 10;
const DEST_QUERY_MAX = 80;
const DEST_GROUPS: { id: 'semua' | DestGroup; label: string }[] = [
  { id: 'semua', label: 'Semua' },
  { id: 'bawaan', label: 'Bawaan' },
  { id: 'custom', label: 'Custom' },
  { id: 'eksternal', label: 'Eksternal' },
];

const normaliseText = (value: string) => value.normalize('NFKC').toLocaleLowerCase('id-ID');

class UploadClientError extends Error {}

function stamp(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}.${get('minute')}.${get('second')}`;
}

// Unggah langsung ke sesi Google; tidak ada byte file yang melewati server Eclipse.
// Offset hanya maju sejauh byte yang dikonfirmasi header Range: tanpa Range, protokol
// berarti belum ada byte yang dikonfirmasi, jadi jangan pernah melompat ke akhir potongan.
const MAX_STALLED_CHUNKS = 3;

async function putFile(file: File, sessionUri: string, start: number, onProgress: (sent: number) => void): Promise<void> {
  let offset = start;
  let stalled = 0;
  while (offset < file.size) {
    const end = Math.min(offset + GDRIVE_CHUNK_BYTES, file.size);
    let response: Response;
    try {
      response = await fetch(sessionUri, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
        body: file.slice(offset, end),
        credentials: 'omit',
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new UploadClientError('Koneksi ke Google Drive terputus.');
    }
    if (response.status === 308) {
      const match = /bytes=0-(\d+)/.exec(response.headers.get('range') ?? '');
      const accepted = match ? Number(match[1]) + 1 : 0;
      if (accepted <= offset) {
        if (++stalled >= MAX_STALLED_CHUNKS) throw new UploadClientError('Google Drive tidak mengonfirmasi kemajuan unggahan.');
      } else {
        stalled = 0;
      }
      offset = Math.min(accepted, file.size);
      onProgress(offset);
      continue;
    }
    if (response.ok) {
      onProgress(file.size);
      return;
    }
    throw new UploadClientError(`Google Drive menjawab ${response.status}.`);
  }
}

async function completeLoop(uploadId: string, delay = 800) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await completeUpload(uploadId);
    if (!result.ok) throw new UploadClientError(result.message);
    if (result.data.done) return result.data;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new UploadClientError('Google Drive belum menyelesaikan pemeriksaan file. Gunakan Lanjutkan beberapa saat lagi.');
}

export function CloudUploader(props: CloudUploaderProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Draft[]>([]);
  const [queue, setQueue] = useState<Draft[]>([]);
  const [destination, setDestination] = useState<string | null>('auto');
  const [needChoice, setNeedChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [folderMessage, setFolderMessage] = useState<Message>(null);
  const [folderBusy, setFolderBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<ActiveUploadView | null>(null);
  const [resumeNote, setResumeNote] = useState<Message>(null);

  const [guideTab, setGuideTab] = useState<GuideTab>('how');
  const [addKind, setAddKind] = useState<'custom' | 'drive' | 'external'>('custom');
  const [folderName, setFolderName] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [addError, setAddError] = useState('');
  const [browse, setBrowse] = useState<BrowseView | null>(null);
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const [browseBusy, setBrowseBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<CloudFolderView | null>(null);
  const [destQuery, setDestQuery] = useState('');
  const [destGroup, setDestGroup] = useState<'semua' | DestGroup>('semua');
  const [destPage, setDestPage] = useState(1);

  const fileInput = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const guideRef = useRef<HTMLDialogElement>(null);
  const addRef = useRef<HTMLDialogElement>(null);
  const removeRef = useRef<HTMLDialogElement>(null);
  const destRef = useRef<HTMLDialogElement>(null);
  const destSearchRef = useRef<HTMLInputElement>(null);

  const maxBytes = props.maxMb * 1024 * 1024;
  const defaultFolder = props.folders.find((f) => f.id === props.defaultFolderId) ?? null;
  const atFolderLimit = props.folders.length >= GDRIVE_MAX_FOLDERS;

  const accept = Object.entries(CATEGORY_EXT)
    .filter(([category]) => category !== 'archives' || props.archivesEnabled)
    .flatMap(([, exts]) => exts.map((ext) => `.${ext}`))
    .join(',');

  const destOptions: { id: string; label: string; desc: string; group: DestGroup; isDefault: boolean }[] = [
    { id: 'auto', label: 'Kategori otomatis (bawaan kelas)', desc: 'Ikuti urutan tujuan, termasuk folder default milikmu.', group: 'bawaan', isDefault: false },
    { id: 'category', label: 'Folder kategori bawaan (tanpa default)', desc: 'Lewati folder default milikmu.', group: 'bawaan', isDefault: false },
    ...props.folders.map((folder) => ({
      id: `f:${folder.id}`, label: folder.name,
      desc: folder.kind === 'external' ? 'Folder eksternal' : 'Folder custom',
      group: (folder.kind === 'external' ? 'eksternal' : 'custom') as DestGroup,
      isDefault: folder.isDefault,
    })),
  ];
  const useRadios = destOptions.length <= 4;
  const selectedDest = destOptions.find((option) => option.id === destination) ?? null;
  const destTerm = normaliseText(destQuery.trim().slice(0, DEST_QUERY_MAX));
  const filteredDest = destOptions.filter((option) =>
    (destGroup === 'semua' || option.group === destGroup)
    && (!destTerm || normaliseText(`${option.label} ${option.desc}`).includes(destTerm)));
  const destPageCount = Math.max(1, Math.ceil(filteredDest.length / DEST_PAGE_SIZE));
  const destCurrentPage = Math.min(destPage, destPageCount);
  const destSlice = filteredDest.slice((destCurrentPage - 1) * DEST_PAGE_SIZE, destCurrentPage * DEST_PAGE_SIZE);

  function resolveDest(): string | null {
    if (!destination) return null;
    if (destination.startsWith('f:')) {
      return props.folders.find((f) => `f:${f.id}` === destination)?.name ?? null;
    }
    if (destination === 'auto' && defaultFolder) return `${defaultFolder.name} (default)`;
    return 'Folder kategori kelas';
  }
  const destLabel = resolveDest();

  // Refresh/menutup tab menghentikan koneksi langsung; beri peringatan selama ada unggahan berjalan.
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const patch = (id: string, next: Partial<Draft>) => {
    setQueue((list) => list.map((d) => (d.id === id ? { ...d, ...next } : d)));
    setSelected((list) => list.map((d) => (d.id === id ? { ...d, ...next } : d)));
  };

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const added: Draft[] = [];
    let duplicates = 0;
    for (const file of files) {
      const known = [...selected, ...queue, ...added].some((d) => d.original === file.name && d.size === file.size);
      if (known) { duplicates++; continue; }
      const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
      const check = checkFile({ name: file.name, size: file.size, bytes: head, maxBytes, archivesEnabled: props.archivesEnabled });
      const ext = extensionOf(file.name) ?? '';
      const stem = ext
        ? stripExtension(buildFinalName({ originalName: file.name, timestamp: stamp(new Date(), props.tz), ext }))
        : stripExtension(file.name);
      added.push({
        id: crypto.randomUUID(), file, original: file.name, size: file.size, ext,
        category: categoryForExt(ext), stem, issue: check.ok ? null : FILE_ISSUE_MESSAGE[check.issue],
        status: 'ready', progress: 0, destination: null, destLabel: null,
        uploadId: null, error: null, link: null,
      });
    }
    if (added.length > 0) setSelected((list) => [...list, ...added]);
    setMessage(duplicates > 0
      ? { tone: 'warning', text: `${duplicates} file yang sama sudah ada di daftar dan dilewati.` }
      : null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (busy || !props.configured) return;
    void addFiles(Array.from(event.dataTransfer.files));
  }

  // Respons PUT di peramban tidak pernah dipakai sebagai bukti berhasil/gagal: galat CORS
  // atau koneksi putus bisa menyembunyikan respons sukses padahal Drive sudah membuat file.
  // Server memeriksa sesi langsung, memverifikasi file, lalu mencatat Completed.
  async function settleUpload(draft: Draft, uploadId: string): Promise<boolean> {
    const result = await completeUpload(uploadId);
    if (!result.ok) {
      patch(draft.id, {
        status: 'error', error: result.message,
        uploadId: result.code === 'session' ? null : uploadId,
      });
      return false;
    }
    if (result.data.done) {
      patch(draft.id, { status: 'done', progress: draft.size, link: result.data.link });
      return true;
    }
    patch(draft.id, {
      status: 'error', progress: result.data.bytesUploaded,
      error: `Terputus di ${formatBytes(result.data.bytesUploaded)} dari ${formatBytes(result.data.size)}. Gunakan Lanjutkan untuk meneruskan.`,
    });
    return false;
  }

  async function continueUpload(draft: Draft, uploadId: string, sessionUri: string, startAt: number): Promise<boolean> {
    try {
      await putFile(draft.file, sessionUri, startAt, (sent) => patch(draft.id, { progress: sent }));
    } catch {
      return settleUpload(draft, uploadId);
    }
    patch(draft.id, { status: 'finishing' });
    try {
      const done = await completeLoop(uploadId);
      patch(draft.id, { status: 'done', progress: draft.size, link: done.link });
      return true;
    } catch {
      return settleUpload(draft, uploadId);
    }
  }

  async function uploadOne(draft: Draft): Promise<boolean> {
    const folderId = draft.destination?.startsWith('f:') ? draft.destination.slice(2) : null;
    const preferDefault = draft.destination !== 'category';
    patch(draft.id, { status: 'starting', progress: 0, error: null, uploadId: null });
    const begin = await beginUpload({
      originalName: draft.original, size: draft.size, customName: draft.stem,
      folderId, preferDefault,
    });
    if (!begin.ok) {
      patch(draft.id, { status: 'error', error: begin.message });
      return false;
    }
    patch(draft.id, { status: 'uploading', uploadId: begin.data.uploadId });
    return continueUpload(draft, begin.data.uploadId, begin.data.sessionUri, 0);
  }

  async function startAll(event: FormEvent) {
    event.preventDefault();
    if (busy || !props.configured) return;
    if (!destination) {
      setMessage({ tone: 'warning', text: needChoice || 'Pilih tujuan penyimpanan terlebih dahulu.' });
      return;
    }
    const ready = selected.filter((d) => !d.issue);
    if (ready.length === 0) {
      setMessage({ tone: 'warning', text: 'Pilih minimal satu file yang lolos pemeriksaan.' });
      return;
    }
    const queued = ready.map((draft) => ({ ...draft, destination, destLabel }));
    setSelected((list) => list.filter((d) => d.issue));
    setQueue((list) => [...queued, ...list]);
    setBusy(true);
    setMessage({ tone: 'info', text: `${queued.length} file masuk antrean unggahan.` });
    let ok = 0;
    let failed = 0;
    for (const draft of queued) {
      if (await uploadOne(draft)) ok++; else failed++;
    }
    setBusy(false);
    setMessage(failed === 0
      ? { tone: 'success', text: `${ok} file selesai diunggah ke Google Drive.` }
      : { tone: 'warning', text: `${ok} file selesai, ${failed} gagal. Periksa pesan pada masing-masing file.` });
    router.refresh();
  }

  async function retry(draft: Draft) {
    if (busy || !props.configured) return;
    setBusy(true);
    let ok: boolean;
    if (!draft.uploadId) {
      ok = await uploadOne(draft);
    } else {
      // Sesi lama dipakai lagi supaya file yang mungkin sudah ada di Drive tidak terduplikasi.
      const resumed = await resumeUpload(draft.uploadId);
      if (!resumed.ok) {
        patch(draft.id, {
          status: 'error', error: resumed.message,
          uploadId: resumed.code === 'session' ? null : draft.uploadId,
        });
        ok = false;
      } else if (resumed.data.done) {
        patch(draft.id, { status: 'done', progress: draft.size, link: resumed.data.link });
        ok = true;
      } else {
        patch(draft.id, { status: 'uploading', progress: resumed.data.bytesUploaded });
        ok = await continueUpload(draft, draft.uploadId, resumed.data.sessionUri, resumed.data.bytesUploaded);
      }
    }
    setBusy(false);
    setMessage(ok
      ? { tone: 'success', text: `"${draft.original}" selesai diunggah.` }
      : { tone: 'error', text: `"${draft.original}" masih gagal. Periksa pesan pada file itu.` });
    router.refresh();
  }

  async function cancelDraft(draft: Draft) {
    if (!draft.uploadId) {
      patch(draft.id, { status: 'cancelled', error: null });
      return;
    }
    const result = await cancelUpload(draft.uploadId);
    if (!result.ok) {
      patch(draft.id, { status: 'error', error: result.message });
    } else if (result.data.cancelled) {
      patch(draft.id, { status: 'cancelled', uploadId: null, error: null });
    } else {
      // Drive ternyata sudah menyelesaikan file: finalisasi, bukan dibatalkan.
      patch(draft.id, { status: 'done', progress: draft.size, link: result.data.link });
    }
    router.refresh();
  }

  async function handleResumeFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !resumeTarget) return;
    if (file.name !== resumeTarget.originalName || file.size !== resumeTarget.size) {
      setResumeNote({ tone: 'error', text: 'File yang dipilih berbeda dari unggahan itu (nama dan ukuran harus sama).' });
      return;
    }
    setResumeNote({ tone: 'info', text: `Memeriksa sesi "${resumeTarget.name}"…` });
    const result = await resumeUpload(resumeTarget.id);
    if (!result.ok) {
      setResumeNote({ tone: 'error', text: result.message });
      return;
    }
    if (result.data.done) {
      setResumeNote({ tone: 'success', text: `"${result.data.name}" sudah selesai.` });
      router.refresh();
      return;
    }
    const resume = result.data;
    try {
      setResumeNote({ tone: 'info', text: `Melanjutkan dari ${formatBytes(resume.bytesUploaded)}…` });
      await putFile(file, resume.sessionUri, resume.bytesUploaded, (sent) =>
        setResumeNote({ tone: 'info', text: `Mengunggah ${formatBytes(sent)} dari ${formatBytes(resume.size)}…` }));
      const done = await completeLoop(resumeTarget.id);
      setResumeNote({ tone: 'success', text: `"${done.name}" selesai diunggah.` });
      router.refresh();
    } catch {
      // Seperti alur utama: keadaan sebenarnya ditentukan server, bukan peramban.
      const status = await completeUpload(resumeTarget.id);
      if (!status.ok) setResumeNote({ tone: 'error', text: status.message });
      else if (status.data.done) setResumeNote({ tone: 'success', text: `"${status.data.name}" selesai diunggah.` });
      else setResumeNote({
        tone: 'warning',
        text: `Terputus di ${formatBytes(status.data.bytesUploaded)} dari ${formatBytes(status.data.size)}. Pilih Lanjutkan lagi untuk meneruskan.`,
      });
      router.refresh();
    }
  }

  async function runFolder(kind: 'default' | 'remove', value: string | null) {
    setFolderBusy(`${kind}:${value ?? ''}`);
    setFolderMessage(null);
    const result = kind === 'default' ? await setDefaultCloudFolder(value) : await removeCloudFolder(value ?? '');
    setFolderBusy(null);
    if (!result.ok) {
      setFolderMessage({ tone: 'error', text: result.message });
      return;
    }
    setFolderMessage({
      tone: 'success',
      text: kind === 'default'
        ? (value ? 'Folder default disimpan.' : 'Default folder dinonaktifkan.')
        : 'Folder dihapus dari daftar. Isi Google Drive tidak disentuh.',
    });
    router.refresh();
  }

  // Nilai tujuan selalu diambil dari opsi yang dikenal, bukan dari teks di kolom
  // pencarian; id folder tetap divalidasi ulang di server saat unggahan dimulai.
  function chooseDestination(id: string) {
    if (!destOptions.some((option) => option.id === id)) return;
    setDestination(id);
    setNeedChoice('');
    destRef.current?.close();
  }

  function openDestPicker() {
    setDestPage(1);
    destRef.current?.showModal();
    // Fokus ke pencarian supaya pemilih bisa dipakai langsung dari kibor.
    window.requestAnimationFrame(() => destSearchRef.current?.focus());
  }

  function openGuide(tab: GuideTab) {
    setGuideTab(tab);
    guideRef.current?.showModal();
  }

  function selectGuideTab(tab: GuideTab, focus = false) {
    setGuideTab(tab);
    if (focus) document.getElementById(`cloud-guide-tab-${tab}`)?.focus();
  }

  function onGuideKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % GUIDE_TABS.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + GUIDE_TABS.length) % GUIDE_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = GUIDE_TABS.length - 1;
    const target = next === null ? undefined : GUIDE_TABS[next];
    if (!target) return;
    event.preventDefault();
    selectGuideTab(target.id, true);
  }

  function openAddFolder() {
    if (atFolderLimit) {
      setFolderMessage({ tone: 'error', text: `Batas ${GDRIVE_MAX_FOLDERS} folder tercapai.` });
      return;
    }
    setAddKind('custom');
    setFolderName('');
    setExternalRef('');
    setAddError('');
    setBrowse(null);
    setTrail([]);
    addRef.current?.showModal();
  }

  // Penelusuran folder selalu lewat server: Drive tidak diakses langsung dari peramban,
  // dan trailing path disimpan di klien hanya untuk tombol kembali.
  async function loadBrowse(folderId: string | null, nextTrail: { id: string; name: string }[]) {
    setBrowseBusy(true);
    setAddError('');
    const result = await browseCloudFolders(folderId);
    setBrowseBusy(false);
    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    setBrowse(result.data);
    setTrail(nextTrail);
  }

  async function removeBrowsed(folder: BrowseFolderView) {
    if (!folder.folderId) return;
    setBrowseBusy(true);
    setAddError('');
    const result = await removeCloudFolder(folder.folderId);
    setBrowseBusy(false);
    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    if (destination === `f:${folder.folderId}`) {
      setDestination(null);
      setNeedChoice('Folder yang kamu pilih sudah dihapus. Pilih tujuan lain.');
    }
    setBrowse((view) => (view ? {
      ...view,
      folders: view.folders.map((item) => (item.id === folder.id ? { ...item, folderId: null, isDefault: false } : item)),
    } : view));
    setFolderMessage({ tone: 'success', text: `"${folder.name}" dihapus dari daftar. Isi Google Drive tidak disentuh.` });
    router.refresh();
  }

  async function submitFolder(event: FormEvent) {
    event.preventDefault();
    if (addError) return;
    if (addKind === 'drive') {
      if (!browse || !browse.parent) {
        setAddError('Buka salah satu subfolder dulu, lalu tambahkan folder yang ingin dipakai.');
        return;
      }
      if (browse.folder.added) {
        setAddError('Folder ini sudah ada di daftar tujuanmu.');
        return;
      }
      if (atFolderLimit) {
        setAddError(`Batas ${GDRIVE_MAX_FOLDERS} folder tercapai.`);
        return;
      }
      setFolderBusy('add');
      const added = await addCloudFolder(browse.folder.id);
      setFolderBusy(null);
      if (!added.ok) {
        setAddError(added.message);
        return;
      }
      addRef.current?.close();
      setFolderMessage({ tone: 'success', text: `"${added.data.name}" ditambahkan.` });
      router.refresh();
      return;
    }
    const name = folderName.trim();
    const ref = externalRef.trim();
    if (addKind === 'custom') {
      if (!name) { setAddError('Nama folder wajib diisi.'); return; }
      if (name.length > 60) { setAddError('Maksimal 60 karakter.'); return; }
      if (props.folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        setAddError('Nama folder sudah dipakai.');
        return;
      }
    } else {
      if (!ref) { setAddError('Tautan folder wajib diisi.'); return; }
      if (!parseFolderRef(ref)) {
        setAddError('Gunakan tautan folder Google Drive (drive.google.com/drive/folders/…).');
        return;
      }
    }
    setFolderBusy('add');
    const result = addKind === 'custom' ? await createCloudFolder(name) : await addExternalFolder(ref);
    setFolderBusy(null);
    if (!result.ok) {
      setAddError(result.message);
      return;
    }
    addRef.current?.close();
    setFolderMessage({ tone: 'success', text: `"${result.data.name}" ditambahkan.` });
    router.refresh();
  }

  const readyCount = selected.filter((d) => !d.issue).length;
  const readyBytes = selected.filter((d) => !d.issue).reduce((sum, d) => sum + d.size, 0);
  const rejected = selected.length - readyCount;
  const summary = selected.length === 0
    ? 'Belum ada file dipilih.'
    : `${readyCount} file siap diunggah${readyCount ? ` · ${formatBytes(readyBytes)}` : ''}${rejected ? ` · ${rejected} ditolak` : ''}`;
  const uploadCount = queue.length + props.active.length;

  return (
    <>
      <PageHeader
        icon="upload"
        title="Cloud"
        description="Unggah file kelas langsung ke Google Drive."
        actions={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => openGuide('how')}>
              <Icon name="info" size={18} />Panduan
            </button>
            {props.canManage && (
              <LinkButton href="/settings/cloud" variant="secondary" icon="settings">Pengaturan kelas</LinkButton>
            )}
          </>
        }
      />

      {!props.configured && (
        <Notice tone="warning">
          Unggahan ke Google Drive belum aktif: server belum memiliki <code>{props.missing.join(', ')}</code>.
          Hubungi Ketua untuk melengkapi konfigurasi.
        </Notice>
      )}

      <div className="cloud-grid">
        <div className="cloud-col">
          <section className="card" aria-labelledby="cloud-upload-title">
            <div className="card__head">
              <h2 id="cloud-upload-title" className="card__title"><Icon name="upload" size={20} />Unggah file</h2>
              <button type="button" className="link-btn" onClick={() => openGuide('rules')}>
                <Icon name="info" size={16} />Aturan unggah
              </button>
            </div>

            <form onSubmit={startAll} aria-busy={busy}>
              <label
                className={cx('cloud-drop', dragging && 'is-over', (busy || !props.configured) && 'cloud-drop--off')}
                htmlFor="cloud-files"
                onDragOver={(e) => { e.preventDefault(); if (!busy && props.configured) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input
                  id="cloud-files" ref={fileInput} type="file" multiple className="sr-only"
                  accept={accept} disabled={busy || !props.configured}
                  aria-describedby="cloud-files-hint"
                  onChange={(e) => {
                    const input = e.currentTarget;
                    const files = Array.from(input.files ?? []);
                    input.value = '';
                    void addFiles(files);
                  }}
                />
                <span className="cloud-drop__art" aria-hidden="true"><Icon name="upload" size={26} /></span>
                <span>
                  <span className="cloud-drop__title">Seret file ke sini</span>
                  <span className="cloud-drop__hint">atau <span className="cloud-drop__pick">pilih dari perangkat</span></span>
                </span>
                <Chip tone="outline">Maks {props.maxMb} MB per file</Chip>
              </label>
              <p id="cloud-files-hint" className="sr-only">{slotHint()}</p>

              {selected.length > 0 && (
                <ul className="cloud-sel" aria-label="File yang dipilih">
                  {selected.map((draft) => (
                    <li key={draft.id} className="cloud-sel__item">
                      <div className="cloud-sel__row">
                        <Icon className="cloud-sel__icon" name={draft.category ? CATEGORY_ICON[draft.category] : 'alert-circle'} size={20} />
                        <div className="cloud-sel__body">
                          <span className="cloud-sel__name">{draft.original}</span>
                          <span className="cloud-sel__meta">
                            {draft.category ? CATEGORY_LABEL[draft.category] : 'Jenis tidak didukung'} · {formatBytes(draft.size)}
                            {draft.issue && (
                              <span className="cloud-sel__error"><Icon name="alert-triangle" size={14} />{draft.issue}</span>
                            )}
                          </span>
                        </div>
                        {!draft.issue && (
                          <button
                            type="button" className="btn btn--ghost btn--sm btn--icon"
                            aria-label={`Ubah nama ${draft.original}`} aria-pressed={renaming === draft.id}
                            onClick={() => setRenaming(renaming === draft.id ? null : draft.id)}
                          >
                            <Icon name="pencil" size={16} />
                          </button>
                        )}
                        <button
                          type="button" className="btn btn--ghost btn--sm btn--icon"
                          aria-label={`Buang ${draft.original} dari pilihan`}
                          onClick={() => {
                            setSelected((list) => list.filter((d) => d.id !== draft.id));
                            if (renaming === draft.id) setRenaming(null);
                          }}
                        >
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                      {renaming === draft.id && !draft.issue && (
                        <div className="cloud-sel__rename">
                          <div className="field-row">
                            <input
                              aria-label={`Nama file untuk ${draft.original}`}
                              value={draft.stem} maxLength={140}
                              onChange={(e) => {
                                const stem = e.currentTarget.value;
                                setSelected((list) => list.map((d) => (d.id === draft.id ? { ...d, stem } : d)));
                              }}
                            />
                            <code>.{draft.ext}</code>
                          </div>
                          <p className="field__hint">Ekstensi mengikuti format asli. Nama final: {stripExtension(draft.stem)}.{draft.ext}.</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="cloud-dest">
                <div className="cloud-dest__head">
                  <h3 id="cloud-dest-label">Tujuan penyimpanan</h3>
                  <button type="button" className="link-btn" onClick={() => openGuide('dest')}>
                    <Icon name="info" size={16} />Urutan tujuan
                  </button>
                </div>

                {useRadios ? (
                  <div className="cloud-opts" role="radiogroup" aria-labelledby="cloud-dest-label">
                    {destOptions.map((option) => (
                      <label key={option.id} className="cloud-opt">
                        <input
                          type="radio" name="cloud-destination" value={option.id}
                          checked={destination === option.id} disabled={busy || !props.configured}
                          onChange={() => { setDestination(option.id); setNeedChoice(''); }}
                        />
                        <span className="cloud-opt__text">
                          <span className="cloud-opt__title">{option.label}</span>
                          <span className="cloud-opt__desc">{option.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button" className="cloud-dest__pick" id="cloud-dest-pick"
                    aria-labelledby="cloud-dest-label cloud-dest-value" aria-haspopup="dialog"
                    disabled={busy || !props.configured} onClick={openDestPicker}
                  >
                    <span className="cloud-dest__pick-text">
                      <span className="cloud-dest__pick-value" id="cloud-dest-value">
                        {selectedDest ? selectedDest.label : 'Pilih tujuan…'}
                      </span>
                      <span className="cloud-dest__pick-desc">
                        {selectedDest ? selectedDest.desc : `Pilih dari ${destOptions.length} tujuan`}
                      </span>
                    </span>
                    <Icon name="chevron-right" size={18} />
                  </button>
                )}

                <p className={cx('cloud-dest__note', !destLabel && 'cloud-dest__note--warn')} aria-live="polite">
                  <Icon name={destLabel ? 'folder' : 'alert-triangle'} size={18} />
                  <span>
                    {destLabel
                      ? <>Akan masuk ke: <strong>{destLabel}</strong></>
                      : (needChoice || 'Pilih tujuan penyimpanan.')}
                  </span>
                </p>
              </div>

              <div className="cloud-foot">
                <p>{summary}</p>
                <button
                  type="submit" className="btn"
                  disabled={busy || !props.configured || readyCount === 0 || !destination}
                  aria-busy={busy}
                >
                  {busy ? <Icon name="loader" size={18} className="spin" /> : <Icon name="upload" size={18} />}
                  {readyCount > 0 ? `Mulai unggah (${readyCount})` : 'Mulai unggah'}
                </button>
              </div>
              {message && (
                <Notice tone={message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</Notice>
              )}
            </form>
          </section>

          {uploadCount > 0 && (
            <section className="card" aria-labelledby="cloud-uploads-title">
              <div className="card__head">
                <h2 id="cloud-uploads-title" className="card__title"><Icon name="clock" size={20} />Unggahan</h2>
                <Chip tone="outline">{uploadCount} file</Chip>
              </div>

              <ul>
                {props.active.map((upload) => {
                  const percent = upload.size > 0 ? Math.floor((upload.bytesUploaded / upload.size) * 100) : 0;
                  return (
                    <li key={upload.id} className="cloud-up" data-status="interrupted">
                      <span className="cloud-up__art"><Icon name="upload" size={18} /></span>
                      <div className="cloud-up__body">
                        <div className="cloud-up__top">
                          <span className="cloud-up__name">{upload.originalName}</span>
                          <span className="cloud-up__size">{formatBytes(upload.size)}</span>
                        </div>
                        <progress className="cloud-up__progress" max={100} value={percent} aria-label={`Kemajuan ${upload.originalName}`} />
                        <div className="cloud-up__meta">
                          <Chip tone="warning" icon="alert-triangle">Terhenti</Chip>
                          <span className="nums">{percent}%</span>
                          <span>{formatBytes(upload.bytesUploaded)} dari {formatBytes(upload.size)}</span>
                          <span>Mulai {formatWhen(upload.createdAt, props.tz)}</span>
                        </div>
                      </div>
                      <div className="cloud-up__actions">
                        <button
                          type="button" className="btn btn--secondary btn--sm"
                          onClick={() => { setResumeTarget(upload); setResumeNote(null); resumeInput.current?.click(); }}
                        >
                          <Icon name="upload" size={16} />Lanjutkan
                        </button>
                        <button
                          type="button" className="btn btn--danger-soft btn--sm"
                          onClick={async () => {
                            const result = await cancelUpload(upload.id);
                            setResumeNote(!result.ok
                              ? { tone: 'error', text: result.message }
                              : result.data.cancelled
                                ? { tone: 'success', text: `"${upload.name}" dibatalkan.` }
                                : { tone: 'warning', text: `"${result.data.name}" ternyata sudah selesai di Google Drive, jadi dicatat selesai.` });
                            router.refresh();
                          }}
                        >
                          Batalkan
                        </button>
                      </div>
                    </li>
                  );
                })}

                {queue.map((draft) => {
                  const percent = draft.size > 0 ? Math.floor((draft.progress / draft.size) * 100) : 0;
                  const running = draft.status === 'starting' || draft.status === 'uploading' || draft.status === 'finishing';
                  return (
                    <li key={draft.id} className="cloud-up" data-status={draft.status}>
                      <span className="cloud-up__art">
                        <Icon name={draft.category ? CATEGORY_ICON[draft.category] : 'upload'} size={18} />
                      </span>
                      <div className="cloud-up__body">
                        <div className="cloud-up__top">
                          <span className="cloud-up__name">{draft.original}</span>
                          <span className="cloud-up__size">{formatBytes(draft.size)}</span>
                        </div>
                        <progress className="cloud-up__progress" max={100} value={percent} aria-label={`Kemajuan ${draft.original}`} />
                        <div className="cloud-up__meta">
                          <Chip tone={STATUS_TONE[draft.status]}>{STATUS_LABEL[draft.status]}</Chip>
                          <span className="nums">{percent}%</span>
                          {draft.destLabel && <span>{draft.destLabel}</span>}
                          {draft.link && (
                            <a href={draft.link} target="_blank" rel="noopener noreferrer">
                              Buka di Google Drive <Icon name="external-link" size={14} />
                            </a>
                          )}
                        </div>
                        {draft.error && <Notice tone="error">{draft.error}</Notice>}
                      </div>
                      <div className="cloud-up__actions">
                        {running ? (
                          <button type="button" className="btn btn--danger-soft btn--sm" onClick={() => void cancelDraft(draft)}>
                            Batalkan
                          </button>
                        ) : draft.status === 'error' || draft.status === 'cancelled' ? (
                          <>
                            <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => void retry(draft)}>
                              Coba lagi
                            </button>
                            <button type="button" className="btn btn--ghost btn--sm btn--icon"
                              aria-label={`Hapus ${draft.original} dari daftar`}
                              onClick={() => setQueue((list) => list.filter((d) => d.id !== draft.id))}>
                              <Icon name="x" size={16} />
                            </button>
                          </>
                        ) : (
                          <button type="button" className="btn btn--ghost btn--sm btn--icon"
                            aria-label={`Hapus ${draft.original} dari daftar`}
                            onClick={() => setQueue((list) => list.filter((d) => d.id !== draft.id))}>
                            <Icon name="x" size={16} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {resumeNote && (
                <Notice tone={resumeNote.tone} role={resumeNote.tone === 'error' ? 'alert' : 'status'}>{resumeNote.text}</Notice>
              )}
              <input ref={resumeInput} type="file" className="sr-only" aria-label="Pilih file untuk melanjutkan"
                onChange={(e) => void handleResumeFile(e.currentTarget)} />
            </section>
          )}
        </div>

        <aside className="cloud-side" aria-label="Tujuan milik saya">
          <section className="card cloud-side__card" aria-labelledby="cloud-folders-title">
            <div className="card__head">
              <h2 id="cloud-folders-title" className="card__title"><Icon name="folder" size={20} />Tujuan saya</h2>
              <div className="cluster">
                <Chip tone="outline">{props.folders.length}/{GDRIVE_MAX_FOLDERS} folder</Chip>
                {props.folders.length > 0 && (
                  <button type="button" className="btn btn--secondary btn--sm" disabled={atFolderLimit} onClick={openAddFolder}>
                    <Icon name="plus" size={16} />Tambah
                  </button>
                )}
              </div>
            </div>

            {props.folders.length === 0 ? (
              <div className="empty empty--compact">
                <div className="empty__art"><Icon name="folder" size={28} /></div>
                <p className="empty__title">Belum ada folder milikmu</p>
                <p className="empty__text">Buat folder custom atau tambahkan folder eksternal.</p>
                <button type="button" className="btn" onClick={openAddFolder}>
                  <Icon name="plus" size={18} />Tambah folder
                </button>
              </div>
            ) : (
              <ul>
                {props.folders.map((folder) => (
                  <li key={folder.id} className="cloud-folder">
                    <span className="cloud-folder__art">
                      <Icon name={folder.kind === 'external' ? 'link' : 'folder'} size={18} />
                    </span>
                    <div className="cloud-folder__body">
                      <span className="cloud-folder__name">{folder.name}</span>
                      <div className="cloud-folder__meta">
                        <Chip tone="outline" icon={folder.kind === 'external' ? 'link' : 'folder'}>
                          {folder.kind === 'external' ? 'Eksternal' : 'Custom'}
                        </Chip>
                        {folder.isDefault && <Chip tone="brand" icon="star">Default</Chip>}
                      </div>
                    </div>
                    <div className="cloud-folder__actions">
                      <button
                        type="button" className="btn btn--ghost btn--sm btn--icon"
                        aria-pressed={folder.isDefault}
                        aria-label={folder.isDefault ? `Lepas default ${folder.name}` : `Jadikan ${folder.name} folder default`}
                        title="Folder default"
                        disabled={folderBusy !== null}
                        onClick={() => void runFolder('default', folder.isDefault ? null : folder.id)}
                      >
                        <Icon name="star" size={18} />
                      </button>
                      <button
                        type="button" className="btn btn--ghost btn--sm btn--icon"
                        aria-label={`Hapus ${folder.name} dari daftar`} title="Hapus dari daftar"
                        disabled={folderBusy !== null}
                        onClick={() => { setRemoveTarget(folder); removeRef.current?.showModal(); }}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {folderMessage && (
              <Notice tone={folderMessage.tone} role={folderMessage.tone === 'error' ? 'alert' : 'status'}>
                {folderMessage.text}
              </Notice>
            )}

            <div className="cloud-foot">
              <button type="button" className="link-btn" onClick={() => openGuide('folders')}>
                <Icon name="info" size={16} />Tentang folder
              </button>
            </div>
          </section>
        </aside>
      </div>

      {/* Panduan */}
      <dialog
        ref={guideRef} className="cloud-dialog cloud-dialog--lg" aria-labelledby="cloud-guide-title"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <div className="cloud-dialog__head">
          <div>
            <h2 id="cloud-guide-title">Panduan Cloud</h2>
            <p>Semua yang perlu diketahui sebelum mengunggah file kelas.</p>
          </div>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Tutup panduan"
            onClick={() => guideRef.current?.close()}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="cloud-guide">
          <div className="cloud-guide__tabs" role="tablist" aria-label="Topik panduan">
            {GUIDE_TABS.map((tab, index) => (
              <button
                key={tab.id} type="button" role="tab" className="cloud-guide__tab"
                id={`cloud-guide-tab-${tab.id}`} aria-controls={`cloud-guide-panel-${tab.id}`}
                aria-selected={guideTab === tab.id} tabIndex={guideTab === tab.id ? 0 : -1}
                onClick={() => selectGuideTab(tab.id)}
                onKeyDown={(event) => onGuideKeyDown(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="dialog__body">
            <div
              className="cloud-guide__panel" role="tabpanel" id="cloud-guide-panel-how"
              aria-labelledby="cloud-guide-tab-how" tabIndex={0} hidden={guideTab !== 'how'}
            >
              <div>
                <h3>Langsung ke Google Drive</h3>
                <p>File dikirim dari peramban langsung ke Google Drive, tidak melewati server Eclipse. Koneksi tetap ringan untuk file besar.</p>
              </div>
              <div>
                <h3>Jika halaman ditutup</h3>
                <p>Menutup halaman menghentikan koneksi, tetapi sesi disimpan. Untuk melanjutkan, pilih file yang sama lewat tombol <b>Lanjutkan</b> di daftar unggahan.</p>
              </div>
            </div>

            <div
              className="cloud-guide__panel" role="tabpanel" id="cloud-guide-panel-rules"
              aria-labelledby="cloud-guide-tab-rules" tabIndex={0} hidden={guideTab !== 'rules'}
            >
              <div>
                <h3>Ukuran</h3>
                <p>Maksimal <b>{props.maxMb} MB</b> per file (batas kelas).</p>
              </div>
              <div>
                <h3>Jenis file</h3>
                <p>Isi file diperiksa dari signature-nya, bukan hanya ekstensi.</p>
                <div className="cloud-guide__panel">
                  {Object.entries(CATEGORY_EXT).map(([category, exts]) => (
                    <div key={category} className="cloud-guide__pair">
                      <b>{CATEGORY_LABEL[category as Category]}</b>
                      <span>{exts.map((ext) => `.${ext}`).join('  ')}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3>Arsip</h3>
                <p>
                  {props.archivesEnabled
                    ? 'ZIP dan RAR saat ini diizinkan Ketua.'
                    : 'Ketua menonaktifkan ZIP dan RAR.'}
                </p>
              </div>
              <div>
                <h3>Unggahan bersamaan per anggota</h3>
                <table className="cloud-guide__table">
                  <thead><tr><th scope="col">Ukuran file</th><th scope="col">Maksimal bersamaan</th></tr></thead>
                  <tbody>
                    {SLOT_ROWS.map(([size, limit]) => (
                      <tr key={size}><td>{size}</td><td>{limit} file</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              className="cloud-guide__panel" role="tabpanel" id="cloud-guide-panel-dest"
              aria-labelledby="cloud-guide-tab-dest" tabIndex={0} hidden={guideTab !== 'dest'}
            >
              <div>
                <h3>Tujuan mengikuti urutan</h3>
                <ol className="cloud-guide__steps">
                  <li>Pilihan pada unggahan ini</li>
                  <li>Folder default milikmu</li>
                  <li>Folder kategori kelas</li>
                  <li>Folder utama</li>
                </ol>
              </div>
              <div>
                <h3>Dua pilihan bawaan</h3>
                <ul className="cloud-guide__list">
                  <li><b>Kategori otomatis:</b> mengikuti urutan di atas, termasuk folder default milikmu bila ada.</li>
                  <li><b>Folder kategori bawaan:</b> melewati folder default milikmu dan langsung ke folder kategori kelas.</li>
                </ul>
              </div>
              <Notice tone="info">Kredensial dan Folder ID Google Drive hanya ada di server, tidak pernah dikirim ke peramban.</Notice>
            </div>

            <div
              className="cloud-guide__panel" role="tabpanel" id="cloud-guide-panel-folders"
              aria-labelledby="cloud-guide-tab-folders" tabIndex={0} hidden={guideTab !== 'folders'}
            >
              <div>
                <h3>Folder custom</h3>
                <p>Dibuat di Google Drive, di bawah folder induk yang disiapkan server.</p>
              </div>
              <div>
                <h3>Folder eksternal</h3>
                <p>Harus folder yang dibagikan <b>Anyone with the link → Editor</b>. Server membuat lalu menghapus <code>dummy.txt</code> untuk membuktikan izin tulis.</p>
              </div>
              <Notice tone="warning">
                Folder dengan akses “Anyone with the link → Editor” dapat diubah oleh siapa pun yang memegang tautannya.
                Jangan pakai untuk data sensitif.
              </Notice>
              <div>
                <h3>Menghapus dari daftar</h3>
                <p>Hanya menghapus catatannya di Eclipse. Folder dan isinya di Google Drive tidak dihapus.</p>
              </div>
              <div>
                <h3>Jika default hilang atau akses hilang</h3>
                <p>Jika folder default dihapus atau aksesnya hilang, unggahan berikutnya akan meminta kamu memilih tujuan lain, bukan memindahkannya diam-diam.</p>
              </div>
              <div>
                <h3>Batas</h3>
                <p>Maksimal <b>{GDRIVE_MAX_FOLDERS}</b> folder per anggota.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={() => guideRef.current?.close()}>Tutup</button>
        </div>
      </dialog>

      {/* Tambah folder */}
      <dialog
        ref={addRef} className={cx('cloud-dialog', addKind === 'drive' ? 'cloud-dialog--lg' : 'cloud-dialog--md')}
        aria-labelledby="cloud-add-title"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <form onSubmit={submitFolder} noValidate>
          <div className="dialog__body">
            <h2 id="cloud-add-title">Tambah folder</h2>
            <div className="cloud-kind cloud-kind--three" role="radiogroup" aria-label="Jenis folder">
              <label>
                <input type="radio" name="folder-kind" value="custom" checked={addKind === 'custom'}
                  onChange={() => { setAddKind('custom'); setAddError(''); }} />
                <Icon name="folder" size={18} />Buat folder baru
              </label>
              <label>
                <input type="radio" name="folder-kind" value="drive" checked={addKind === 'drive'}
                  onChange={() => { setAddKind('drive'); setAddError(''); void loadBrowse(null, []); }} />
                <Icon name="search" size={18} />Telusuri Drive
              </label>
              <label>
                <input type="radio" name="folder-kind" value="external" checked={addKind === 'external'}
                  onChange={() => { setAddKind('external'); setAddError(''); }} />
                <Icon name="link" size={18} />Folder eksternal
              </label>
            </div>

            {addKind === 'custom' && (
              <div className="field">
                <label className="field__label" htmlFor="cloud-folder-name">Nama folder</label>
                <input
                  id="cloud-folder-name" value={folderName} maxLength={60} autoComplete="off"
                  placeholder="mis. Tugas Semester 1" aria-describedby="cloud-folder-name-hint"
                  aria-invalid={addError.includes('Nama') || addError.includes('karakter') || addError.includes('dipakai')}
                  onChange={(e) => { setFolderName(e.currentTarget.value); setAddError(''); }}
                />
                <p id="cloud-folder-name-hint" className="field__hint">Dibuat di Google Drive, di bawah folder induk yang disiapkan server.</p>
              </div>
            )}

            {addKind === 'drive' && (
              <div className="cloud-browse">
                <div className="cloud-browse__bar">
                  <button
                    type="button" className="btn btn--secondary btn--sm"
                    disabled={browseBusy || trail.length === 0}
                    onClick={() => {
                      const target = trail[trail.length - 1];
                      if (target) void loadBrowse(target.id, trail.slice(0, -1));
                    }}
                  >
                    <Icon name="arrow-left" size={16} />Kembali
                  </button>
                  <span className="cloud-browse__where" aria-live="polite">
                    <Icon name={browseBusy ? 'loader' : 'folder'} size={16} className={browseBusy ? 'spin' : undefined} />
                    {browse ? browse.folder.name : 'Memuat folder…'}
                  </span>
                </div>

                {browse && browse.folders.length === 0 && !browseBusy && (
                  <p className="cloud-browse__note">Tidak ada subfolder di folder ini.</p>
                )}

                {browse && browse.folders.length > 0 && (
                  <ul className="cloud-browse__grid" aria-label={`Subfolder di ${browse.folder.name}`} aria-busy={browseBusy}>
                    {browse.folders.map((folder) => (
                      <li key={folder.id} className="cloud-browse__item">
                        <button
                          type="button" className="cloud-browse__card" disabled={browseBusy}
                          onClick={() => void loadBrowse(folder.id, [...trail, { id: browse.folder.id, name: browse.folder.name }])}
                        >
                          <span className="cloud-browse__icon"><Icon name="folder" size={20} /></span>
                          <span className="cloud-browse__text">
                            <span className="cloud-browse__name">{folder.name}</span>
                            {folder.owner && <span className="cloud-browse__owner">{folder.owner}</span>}
                          </span>
                          {folder.folderId && (
                            <span className="cloud-browse__flag">{folder.isDefault ? 'Default' : 'Ditambahkan'}</span>
                          )}
                        </button>
                        {folder.folderId && (
                          <button
                            type="button" className="btn btn--ghost btn--sm btn--icon"
                            aria-label={`Hapus ${folder.name} dari daftar tujuan`} title="Hapus dari daftar"
                            disabled={browseBusy}
                            onClick={() => void removeBrowsed(folder)}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="field__hint">
                  Tekan folder untuk masuk. Tombol tambah menyimpan folder yang sedang dibuka.
                  Hanya folder yang kamu tambahkan sendiri yang bisa dihapus dari daftar; isi Google Drive tidak disentuh.
                </p>
              </div>
            )}

            {addKind === 'external' && (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="cloud-folder-url">Tautan folder Google Drive</label>
                  <input
                    id="cloud-folder-url" type="url" inputMode="url" autoComplete="off"
                    value={externalRef} placeholder="https://drive.google.com/drive/folders/…"
                    aria-describedby="cloud-folder-url-hint"
                    aria-invalid={addError.includes('tautan') || addError.includes('Tautan') || addError.includes('Folder')}
                    onChange={(e) => { setExternalRef(e.currentTarget.value); setAddError(''); }}
                  />
                  <p id="cloud-folder-url-hint" className="field__hint">Harus dibagikan Anyone with the link → Editor.</p>
                </div>
                <Notice tone="warning">Siapa pun yang memegang tautan dapat mengubah isinya. Jangan pakai untuk data sensitif.</Notice>
              </>
            )}

            {addError && <Notice tone="error" role="alert">{addError}</Notice>}
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" onClick={() => addRef.current?.close()}>Batal</button>
            <button
              type="submit" className="btn" aria-busy={folderBusy === 'add'}
              disabled={folderBusy !== null || (addKind === 'drive' && (browseBusy || !browse?.parent || browse.folder.added))}
            >
              {folderBusy === 'add' && <Icon name="loader" size={18} className="spin" />}
              {addKind === 'custom' ? 'Buat folder' : addKind === 'drive' ? 'Tambahkan folder ini' : 'Periksa & tambahkan'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Pilih tujuan penyimpanan */}
      <dialog
        ref={destRef} className="cloud-dialog cloud-dialog--md" aria-labelledby="cloud-pick-title"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        onClose={() => { setDestQuery(''); setDestPage(1); }}
      >
        <div className="cloud-dialog__head">
          <div>
            <h2 id="cloud-pick-title">Pilih tujuan penyimpanan</h2>
            <p id="cloud-pick-count" aria-live="polite">
              {filteredDest.length} dari {destOptions.length} tujuan · {DEST_PAGE_SIZE} per halaman
            </p>
          </div>
          <button type="button" className="btn btn--ghost btn--icon" aria-label="Tutup pilihan tujuan"
            onClick={() => destRef.current?.close()}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="dialog__body">
          <div className="cloud-pick__tools">
            <div className="field">
              <label className="field__label" htmlFor="cloud-pick-search">Cari tujuan</label>
              <input
                id="cloud-pick-search" ref={destSearchRef} type="search" value={destQuery}
                maxLength={DEST_QUERY_MAX} autoComplete="off" spellCheck={false}
                placeholder="Nama folder, atau kata “custom” / “eksternal”"
                aria-describedby="cloud-pick-count"
                onChange={(e) => { setDestQuery(e.currentTarget.value); setDestPage(1); }}
              />
            </div>
            <div className="cloud-pick__filters" role="group" aria-label="Saring jenis tujuan">
              {DEST_GROUPS.map((group) => (
                <button
                  key={group.id} type="button" className={cx('btn', 'btn--sm', destGroup !== group.id && 'btn--secondary')}
                  aria-pressed={destGroup === group.id}
                  onClick={() => { setDestGroup(group.id); setDestPage(1); }}
                >
                  {group.label}
                </button>
              ))}
            </div>
          </div>

          {destSlice.length === 0 ? (
            <div className="empty empty--compact">
              <div className="empty__art"><Icon name="search" size={26} /></div>
              <p className="empty__title">Tidak ada tujuan yang cocok</p>
              <p className="empty__text">Ubah kata kunci atau saringan jenis tujuan.</p>
              <button
                type="button" className="btn btn--secondary"
                onClick={() => { setDestQuery(''); setDestGroup('semua'); setDestPage(1); }}
              >
                Hapus pencarian
              </button>
            </div>
          ) : (
            <ul className="cloud-pick__list" aria-label="Daftar tujuan penyimpanan">
              {destSlice.map((option) => (
                <li key={option.id}>
                  <button
                    type="button" className="cloud-pick__btn" aria-pressed={destination === option.id}
                    onClick={() => chooseDestination(option.id)}
                  >
                    <span className="cloud-pick__icon">
                      <Icon name={option.group === 'eksternal' ? 'link' : 'folder'} size={18} />
                    </span>
                    <span className="cloud-pick__text">
                      <span className="cloud-pick__name">{option.label}</span>
                      <span className="cloud-pick__desc">{option.desc}</span>
                    </span>
                    {option.isDefault && <Chip tone="brand" icon="star">Default</Chip>}
                    {destination === option.id && <Chip tone="success" icon="check-circle">Dipilih</Chip>}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {destPageCount > 1 && (
            <div className="cloud-pick__pages">
              <button
                type="button" className="btn btn--secondary btn--sm"
                disabled={destCurrentPage <= 1} onClick={() => setDestPage(destCurrentPage - 1)}
              >
                <Icon name="arrow-left" size={16} />Sebelumnya
              </button>
              <span className="nums">Halaman {destCurrentPage} dari {destPageCount}</span>
              <button
                type="button" className="btn btn--secondary btn--sm"
                disabled={destCurrentPage >= destPageCount} onClick={() => setDestPage(destCurrentPage + 1)}
              >
                Berikutnya<Icon name="chevron-right" size={16} />
              </button>
            </div>
          )}
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={() => destRef.current?.close()}>Tutup</button>
        </div>
      </dialog>

      {/* Hapus folder */}
      <dialog
        ref={removeRef} className="cloud-dialog cloud-dialog--sm" aria-labelledby="cloud-remove-title"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <div className="dialog__body">
          <h2 id="cloud-remove-title">Hapus “{removeTarget?.name}” dari daftar?</h2>
          <p className="muted">Hanya catatannya di Eclipse yang dihapus. Folder dan isinya di Google Drive tidak ikut terhapus.</p>
          {removeTarget?.isDefault && (
            <Notice tone="warning">
              Ini folder defaultmu. Unggahan berikutnya akan meminta kamu memilih tujuan lain.
            </Notice>
          )}
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn--secondary" onClick={() => removeRef.current?.close()}>Batal</button>
          <button
            type="button" className="btn btn--danger"
            onClick={() => {
              const target = removeTarget;
              removeRef.current?.close();
              if (!target) return;
              if (destination === `f:${target.id}`) { setDestination(null); setNeedChoice('Folder yang kamu pilih sudah dihapus. Pilih tujuan lain.'); }
              else if (target.isDefault && destination === 'auto') { setDestination(null); setNeedChoice('Folder default sudah dihapus. Pilih tujuan untuk unggahan ini.'); }
              void runFolder('remove', target.id);
            }}
          >
            Hapus dari daftar
          </button>
        </div>
      </dialog>
    </>
  );
}
