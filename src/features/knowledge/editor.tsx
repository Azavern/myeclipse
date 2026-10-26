'use client';
import { Fragment, useActionState, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { Markdown } from '@/components/markdown';
import { Chip, Notice } from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import type { FormState } from '@/lib/form-state';
import { continueList, runCommand, type CommandId, type EditResult } from '@/lib/knowledge/editor-insert';
import { KB_VISIBILITY_HINT, KB_VISIBILITY_LABEL, KB_VISIBILITY_OPTIONS, KB_STATUS_LABEL } from '@/lib/knowledge/labels';
import { MAX_TAGS, normalizeTag, normalizeTags } from '@/lib/knowledge/tags';

type Action = (p: FormState, fd: FormData) => Promise<FormState>;
export type EditorEntry = {
  id: string; slug: string; title: string; tagline: string | null; content_md: string;
  category: string | null; visibility: string; status: string; version: number; tags: string[];
};
type Draft = { title: string; tagline: string; content: string; category: string; visibility: string; tags: string[] };

const timeLabel = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
};

type Tool = { id: CommandId; name: string; keys: string; aria: string; label: ReactNode };

const TOOLBAR: { group: string; items: Tool[] }[] = [
  {
    group: 'Judul',
    items: [
      { id: 'heading2', name: 'Judul bagian', keys: 'Ctrl/⌘+Alt+1', aria: 'Control+Alt+1 Meta+Alt+1', label: 'H2' },
      { id: 'heading3', name: 'Subjudul', keys: 'Ctrl/⌘+Alt+2', aria: 'Control+Alt+2 Meta+Alt+2', label: 'H3' },
    ],
  },
  {
    group: 'Penekanan',
    items: [
      { id: 'bold', name: 'Tebal', keys: 'Ctrl/⌘+B', aria: 'Control+B Meta+B', label: <strong>B</strong> },
      { id: 'italic', name: 'Miring', keys: 'Ctrl/⌘+I', aria: 'Control+I Meta+I', label: <em>I</em> },
      { id: 'strike', name: 'Coret', keys: 'Ctrl/⌘+Shift+X', aria: 'Control+Shift+X Meta+Shift+X', label: <s>S</s> },
      { id: 'codeInline', name: 'Kode sebaris', keys: 'Ctrl/⌘+E', aria: 'Control+E Meta+E', label: <code>{'`'}</code> },
    ],
  },
  {
    group: 'Tautan',
    items: [
      { id: 'link', name: 'Tautan', keys: 'Ctrl/⌘+K', aria: 'Control+K Meta+K', label: <Icon name="link" size={16} /> },
      { id: 'image', name: 'Gambar', keys: '', aria: '', label: <Icon name="image" size={16} /> },
    ],
  },
  {
    group: 'Blok',
    items: [
      { id: 'unordered', name: 'Daftar berpoin', keys: 'Ctrl/⌘+Shift+8', aria: 'Control+Shift+8 Meta+Shift+8', label: '•' },
      { id: 'ordered', name: 'Daftar bernomor', keys: 'Ctrl/⌘+Shift+7', aria: 'Control+Shift+7 Meta+Shift+7', label: '1.' },
      { id: 'task', name: 'Daftar tugas', keys: 'Ctrl/⌘+Shift+9', aria: 'Control+Shift+9 Meta+Shift+9', label: '☑' },
      { id: 'quote', name: 'Kutipan', keys: 'Ctrl/⌘+Shift+.', aria: 'Control+Shift+. Meta+Shift+.', label: '”' },
      { id: 'codeBlock', name: 'Blok kode', keys: 'Ctrl/⌘+Alt+C', aria: 'Control+Alt+C Meta+Alt+C', label: '```' },
      { id: 'table', name: 'Tabel', keys: '', aria: '', label: 'Tabel' },
      { id: 'hr', name: 'Garis pemisah', keys: '', aria: '', label: '―' },
    ],
  },
];

function shortcutFor(e: KeyboardEvent<HTMLTextAreaElement>): CommandId | null {
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (e.altKey && !e.shiftKey) {
    if (e.code === 'Digit1') return 'heading2';
    if (e.code === 'Digit2') return 'heading3';
    if (e.code === 'Digit3') return 'heading4';
    if (e.code === 'KeyC') return 'codeBlock';
    return null;
  }
  if (e.shiftKey) {
    if (e.code === 'KeyX') return 'strike';
    if (e.code === 'Digit7') return 'ordered';
    if (e.code === 'Digit8') return 'unordered';
    if (e.code === 'Digit9') return 'task';
    if (e.code === 'Period') return 'quote';
    return null;
  }
  switch (e.key.toLowerCase()) {
    case 'b': return 'bold';
    case 'i': return 'italic';
    case 'e': return 'codeInline';
    case 'k': return 'link';
    default: return null;
  }
}

// Editor memakai satu state terkontrol agar draf lokal, pratinjau, dan nilai
// server selalu sama. Penyimpanan ke perangkat memakai debounce; tidak ada
// permintaan database saat mengetik.
export function KnowledgeEditor({ action, entry, categories, tagSuggestions, backHref, draftOwner }: {
  action: Action; entry: EditorEntry | null; categories: string[]; tagSuggestions: string[];
  backHref: string; draftOwner: string;
}) {
  const initial = useRef<Draft>({
    title: entry?.title ?? '', tagline: entry?.tagline ?? '', content: entry?.content_md ?? '',
    category: entry?.category ?? '', visibility: entry?.visibility ?? 'public', tags: entry?.tags ?? [],
  });
  const [form, setForm] = useState<Draft>(initial.current);
  const [tagInput, setTagInput] = useState('');
  const [state, act, pending] = useActionState(action, null);
  const [hydrated, setHydrated] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [pane, setPane] = useState<'edit' | 'preview'>('edit');
  const [preview, setPreview] = useState(true);
  const [online, setOnline] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  // Kunci draf memuat akun agar anggota lain di browser yang sama tidak melihat
  // draf pengguna sebelumnya. Draf tidak dihapus saat keluar akun.
  const storageKey = `eclipse:knowledge:draft:${draftOwner}:${entry?.id ?? 'new'}`;
  const isDraft = !entry || entry.status === 'draft';
  const serialized = JSON.stringify(form);
  const dirty = serialized !== JSON.stringify(initial.current);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft> & { at?: string };
        const restored: Draft = {
          title: typeof parsed.title === 'string' ? parsed.title : initial.current.title,
          tagline: typeof parsed.tagline === 'string' ? parsed.tagline : initial.current.tagline,
          content: typeof parsed.content === 'string' ? parsed.content : initial.current.content,
          category: typeof parsed.category === 'string' ? parsed.category : initial.current.category,
          visibility: KB_VISIBILITY_OPTIONS.some(([v]) => v === parsed.visibility)
            ? String(parsed.visibility) : initial.current.visibility,
          tags: normalizeTags(parsed.tags),
        };
        if (JSON.stringify(restored) !== JSON.stringify(initial.current)) {
          setForm(restored);
          setRecovered(true);
        }
        if (parsed.at) setSavedAt(parsed.at);
      }
    } catch { setStorageFailed(true); }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated || !dirty || pending) return;
    const timer = window.setTimeout(() => {
      try {
        const at = new Date().toISOString();
        window.localStorage.setItem(storageKey, JSON.stringify({ ...form, at }));
        setSavedAt(at);
        setStorageFailed(false);
      } catch { setStorageFailed(true); setSavedAt(null); }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [form, dirty, hydrated, pending, storageKey]);

  // Bila Server Action mengembalikan galat, tulis draf kembali setelah onSubmit
  // membersihkannya (submit dianggap percobaan simpan, bukan pembuangan draf).
  useEffect(() => {
    if (!state?.error) return;
    try {
      const at = new Date().toISOString();
      window.localStorage.setItem(storageKey, JSON.stringify({ ...form, at }));
      setSavedAt(at);
      setStorageFailed(false);
    } catch { setStorageFailed(true); }
  }, [state, form, storageKey]);

  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const bad = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (bad ?? alertRef.current)?.focus();
  }, [state]);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setForm((f) => (f.tags.includes(tag) || f.tags.length >= MAX_TAGS ? f : { ...f, tags: [...f.tags, tag] }));
    setTagInput('');
  }

  // Tombol, pintasan, dan lanjutan daftar memakai fungsi murni yang sama, lalu
  // mengembalikan fokus dan pilihan ke textarea agar pengguna bisa langsung mengetik.
  function apply(result: EditResult) {
    const el = textareaRef.current;
    if (!el) return;
    setField('content', result.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  }

  function run(id: CommandId) {
    const el = textareaRef.current;
    if (!el) return;
    apply(runCommand(id, form.content, { start: el.selectionStart, end: el.selectionEnd }));
  }

  function onEditorKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const el = e.currentTarget;
      const result = continueList(form.content, { start: el.selectionStart, end: el.selectionEnd });
      if (result) { e.preventDefault(); apply(result); return; }
    }
    const id = shortcutFor(e);
    if (!id) return;
    e.preventDefault();
    run(id);
  }

  function discardDraft() {
    try { window.localStorage.removeItem(storageKey); } catch { /* abaikan */ }
    setForm(initial.current);
    setRecovered(false);
    setSavedAt(null);
    setTagInput('');
  }

  return (
    <form ref={formRef} action={act} aria-busy={pending} className="form kb-editor"
      onSubmit={() => { try { window.localStorage.removeItem(storageKey); } catch { /* abaikan */ } }}>
      {entry && <input type="hidden" name="id" value={entry.id} />}
      {entry && <input type="hidden" name="version" value={String(entry.version)} />}
      <input type="hidden" name="tags"
        value={JSON.stringify(tagInput.trim() ? [...form.tags, normalizeTag(tagInput)] : form.tags)} />
      <input type="hidden" name="intent" value={isDraft ? 'draft' : 'publish'} />

      {!online && (
        <Notice tone="warning" role="status">
          {storageFailed
            ? 'Kamu sedang offline dan penyimpanan lokal tidak tersedia. Jangan tutup halaman sebelum koneksi kembali.'
            : 'Kamu sedang offline. Draf tetap tersimpan di perangkat ini; terbitkan atau simpan setelah koneksi kembali.'}
        </Notice>
      )}

      {storageFailed && (
        <Notice tone="warning" role="status">Penyimpanan lokal di perangkat ini tidak tersedia. Jangan tutup halaman sebelum menyimpan atau menerbitkan.</Notice>
      )}

      {state?.error && <div ref={alertRef} tabIndex={-1}><Notice tone="error" role="alert">{state.error}</Notice></div>}

      {recovered && (
        <Notice tone="warning" role="status">
          <span>Draf lokal dari perangkat ini dipulihkan{savedAt ? ` (tersimpan pukul ${timeLabel(savedAt)})` : ''}. Draf ini tidak tersimpan di akun. </span>
          <button type="button" className="link-btn" onClick={discardDraft}>Buang draf lokal</button>
        </Notice>
      )}

      <div className="form__grid form__grid--2">
        <div className="field field--full">
          <label className="field__label" htmlFor="kb-title">Judul<span className="req" aria-hidden="true">*</span><span className="sr-only"> (wajib diisi)</span></label>
          <input id="kb-title" name="title" required maxLength={50} value={form.title}
            aria-invalid={state?.fieldErrors?.title ? true : undefined}
            aria-describedby={state?.fieldErrors?.title ? 'kb-title-error' : undefined}
            onChange={(e) => setField('title', e.currentTarget.value)} />
          <span className="field__count" aria-hidden="true">{form.title.length}/50</span>
          {state?.fieldErrors?.title?.[0] && <p id="kb-title-error" className="field__error"><Icon name="alert-circle" size={16} /><span>{state.fieldErrors.title[0]}</span></p>}
        </div>

        <div className="field field--full">
          <label className="field__label" htmlFor="kb-tagline">Tagline</label>
          <input id="kb-tagline" name="tagline" maxLength={150} value={form.tagline}
            aria-invalid={state?.fieldErrors?.tagline ? true : undefined}
            onChange={(e) => setField('tagline', e.currentTarget.value)} />
          <span className="field__count" aria-hidden="true">{form.tagline.length}/150</span>
          {state?.fieldErrors?.tagline?.[0] && <p className="field__error"><Icon name="alert-circle" size={16} /><span>{state.fieldErrors.tagline[0]}</span></p>}
        </div>

        <div className="field">
          <label className="field__label" htmlFor="kb-category">Kategori</label>
          <input id="kb-category" name="category" maxLength={40} list="kb-category-options" value={form.category}
            placeholder="Mis. Pemrograman" onChange={(e) => setField('category', e.currentTarget.value)} />
          <datalist id="kb-category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <p className="field__hint">Satu kategori per entri. Opsional.</p>
          {state?.fieldErrors?.category?.[0] && <p className="field__error"><Icon name="alert-circle" size={16} /><span>{state.fieldErrors.category[0]}</span></p>}
        </div>

        <div className="field">
          {entry ? (
            <>
              <span className="field__label">Visibilitas</span>
              <Chip tone="neutral" icon="eye">{KB_VISIBILITY_LABEL[form.visibility] ?? form.visibility}</Chip>
              <input type="hidden" name="visibility" value={form.visibility} />
              <p className="field__hint">Visibilitas diubah dari halaman entri agar setiap perubahan tercatat pada jejak audit.</p>
            </>
          ) : (
            <>
              <label className="field__label" htmlFor="kb-visibility">Visibilitas</label>
              <select id="kb-visibility" name="visibility" value={form.visibility} onChange={(e) => setField('visibility', e.currentTarget.value)}>
                {KB_VISIBILITY_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <p className="field__hint">{KB_VISIBILITY_HINT[form.visibility] ?? KB_VISIBILITY_LABEL[form.visibility]}</p>
            </>
          )}
        </div>

        <div className="field field--full">
          <label className="field__label" htmlFor="kb-tag-input">Hashtag</label>
          <div className="kb-tags">
            {form.tags.map((tag) => (
              <span key={tag} className="chip chip--brand">
                #{tag}
                <button type="button" className="kb-tags__remove" aria-label={`Hapus tag ${tag}`}
                  onClick={() => setField('tags', form.tags.filter((t) => t !== tag))}>
                  <Icon name="x" size={14} />
                </button>
              </span>
            ))}
            <input id="kb-tag-input" value={tagInput} maxLength={40}
              placeholder={form.tags.length >= MAX_TAGS ? `Maksimal ${MAX_TAGS} tag` : 'Tulis tag lalu Enter'}
              disabled={form.tags.length >= MAX_TAGS}
              onChange={(e) => setTagInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                else if (e.key === 'Backspace' && !tagInput && form.tags.length) setField('tags', form.tags.slice(0, -1));
              }} />
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>Tambah</button>
          </div>
          <p className="field__hint">Maksimal {MAX_TAGS} tag. Huruf kecil, tanpa spasi; #, koma, dan spasi dinormalisasi otomatis.</p>
          {tagSuggestions.length > 0 && (
            <div className="cluster">
              <span className="muted">Tag yang sudah dipakai:</span>
              {tagSuggestions.filter((t) => !form.tags.includes(t)).slice(0, 10).map((t) => (
                <button key={t} type="button" className="filter-chip" onClick={() => addTag(t)}>#{t}</button>
              ))}
            </div>
          )}
          {state?.fieldErrors?.tags?.[0] && <p className="field__error"><Icon name="alert-circle" size={16} /><span>{state.fieldErrors.tags[0]}</span></p>}
        </div>
      </div>

      <div className="kb-edit__head">
        <div className="cluster">
          <h2 className="card__title"><Icon name="pencil" size={20} />Isi entri</h2>
          {entry && <Chip tone={entry.status === 'published' ? 'success' : 'warning'}>{KB_STATUS_LABEL[entry.status] ?? entry.status}</Chip>}
        </div>
        <div className="kb-edit__switch" role="group" aria-label="Tampilan editor">
          <button type="button" className={cx('filter-chip')} aria-pressed={pane === 'edit'} onClick={() => setPane('edit')}>Editor</button>
          <button type="button" className={cx('filter-chip')} aria-pressed={pane === 'preview'} onClick={() => setPane('preview')}>Pratinjau</button>
        </div>
        <button type="button" className="btn btn--ghost btn--sm kb-edit__toggle" aria-pressed={preview} onClick={() => setPreview((v) => !v)}>
          <Icon name={preview ? 'eye-off' : 'eye'} size={16} />{preview ? 'Sembunyikan pratinjau' : 'Tampilkan pratinjau'}
        </button>
      </div>

      <div className="kb-edit" data-pane={pane} data-preview={preview ? 'on' : 'off'}>
        <div className="kb-edit__editor">
          <div className="kb-toolbar" role="toolbar" aria-label="Sisipkan Markdown">
            {TOOLBAR.map((group, gi) => (
              <Fragment key={group.group}>
                {gi > 0 && <span className="kb-toolbar__sep" aria-hidden="true" />}
                <div className="kb-toolbar__group" role="group" aria-label={group.group}>
                  {group.items.map((tool) => (
                    <button key={tool.id} type="button" className="btn btn--ghost btn--sm"
                      title={tool.keys ? `${tool.name} (${tool.keys})` : tool.name}
                      aria-label={tool.name} aria-keyshortcuts={tool.aria || undefined}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => run(tool.id)}>
                      {tool.label}
                    </button>
                  ))}
                </div>
              </Fragment>
            ))}
            <span className="kb-toolbar__sep" aria-hidden="true" />
            <button type="button" className="btn btn--ghost btn--sm" aria-expanded={helpOpen}
              aria-controls="kb-md-help" onClick={() => setHelpOpen((v) => !v)}>
              <Icon name="help-circle" size={16} />Bantuan
            </button>
          </div>
          {helpOpen && <MarkdownHelp />}
          <label className="sr-only" htmlFor="kb-content">Isi Markdown</label>
          <textarea id="kb-content" ref={textareaRef} name="content" required value={form.content}
            className="kb-edit__textarea" maxLength={50000}
            aria-invalid={state?.fieldErrors?.content ? true : undefined}
            aria-describedby="kb-content-hint"
            onChange={(e) => setField('content', e.currentTarget.value)}
            onKeyDown={onEditorKeyDown} />
          <div className="kb-edit__foot">
            <span className="field__count" aria-hidden="true">{form.content.length}/50.000</span>
            <span className="muted" id="kb-content-hint">Markdown: judul, penekanan, daftar, tabel, tautan, gambar, dan kode. Buka Bantuan untuk sintaks dan pintasan.</span>
          </div>
          {state?.fieldErrors?.content?.[0] && <p className="field__error"><Icon name="alert-circle" size={16} /><span>{state.fieldErrors.content[0]}</span></p>}
        </div>

        <div className="kb-edit__preview">
          <div className="kb-preview card card--tint">
            <div className="kb-preview__bar"><Icon name="eye" size={16} />Pratinjau</div>
            {form.content.trim()
              ? <Markdown source={form.content} />
              : <p className="muted">Belum ada isi untuk dipratinjau.</p>}
          </div>
        </div>
      </div>

      <div className="form__actions form__actions--sticky kb-editor__actions">
        <div className="kb-save-state" aria-live="polite">
          {storageFailed ? 'Draf lokal tidak tersedia di perangkat ini.' : pending ? 'Menyimpan…' : dirty
            ? savedAt ? `Tersimpan di perangkat ini pukul ${timeLabel(savedAt)}` : 'Belum tersimpan di perangkat'
            : savedAt ? `Draf perangkat pukul ${timeLabel(savedAt)}` : 'Perubahan disimpan otomatis di perangkat ini'}
          <span className="muted">Draf lokal hanya di perangkat ini, bukan cadangan awan.</span>
        </div>
        <Link href={backHref} className="btn btn--secondary">Batal</Link>
        {isDraft && (
          <button type="submit" name="intent" value="draft" className="btn btn--secondary" disabled={pending}>
            <Icon name="archive" size={18} />Simpan draf
          </button>
        )}
        <button type="submit" name="intent" value="publish" className="btn" disabled={pending} aria-busy={pending}>
          {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
          {pending ? 'Menyimpan…' : entry?.status === 'published' ? 'Simpan perubahan' : entry?.status === 'archived' ? 'Terbitkan lagi' : 'Terbitkan'}
        </button>
      </div>
    </form>
  );
}

// Panduan singkat untuk pengguna yang tidak menghafal sintaks. Isinya mengikuti
// fitur yang benar-benar didukung parser di lib/knowledge/markdown.ts.
function MarkdownHelp() {
  return (
    <section className="kb-help" id="kb-md-help" aria-labelledby="kb-help-title">
      <h3 id="kb-help-title" className="kb-help__title">Bantuan Markdown</h3>
      <div className="kb-help__grid">
        <div>
          <h4 className="kb-help__sub">Sintaks</h4>
          <dl className="kb-help__list">
            <div>
              <dt>Judul</dt>
              <dd><code>##</code> bagian, <code>###</code> subbagian, <code>####</code> sampai <code>######</code> untuk tingkat lebih dalam.</dd>
            </div>
            <div>
              <dt>Penekanan</dt>
              <dd><code>**tebal**</code>, <code>*miring*</code>, <code>***tebal miring***</code>, <code>~~coret~~</code>.</dd>
            </div>
            <div>
              <dt>Kode</dt>
              <dd><code>`sebaris`</code>; blok dengan tiga backtick. Nama bahasa boleh ditulis setelah backtick pembuka.</dd>
            </div>
            <div>
              <dt>Tautan</dt>
              <dd><code>[teks](https://alamat)</code>; tambahkan <code>"tooltip"</code> setelah alamat bila perlu. Hanya alamat <code>https://</code>.</dd>
            </div>
            <div>
              <dt>Gambar</dt>
              <dd><code>![teks alternatif](https://alamat-gambar)</code>. Hanya alamat <code>https://</code>; kosongkan teks alternatif hanya bila gambar murni hiasan.</dd>
            </div>
            <div>
              <dt>Daftar</dt>
              <dd><code>- item</code> atau <code>1. item</code>; subitem menjorok dua spasi. Enter melanjutkan nomor berikutnya; Enter pada item kosong mengakhiri daftar. Tugas: <code>- [ ]</code> belum, <code>- [x]</code> selesai.</dd>
            </div>
            <div>
              <dt>Kutipan</dt>
              <dd><code>&gt;</code> di awal baris; kutipan bertingkat <code>&gt; &gt;</code>.</dd>
            </div>
            <div>
              <dt>Tabel</dt>
              <dd><code>| Judul | Nilai |</code> lalu <code>| --- | --- |</code>. Rata kiri <code>:---</code>, tengah <code>:---:</code>, kanan <code>---:</code>.</dd>
            </div>
            <div>
              <dt>Garis pemisah</dt>
              <dd><code>---</code> pada baris tersendiri.</dd>
            </div>
            <div>
              <dt>Paragraf dan baris baru</dt>
              <dd>Pisahkan paragraf dengan satu baris kosong. Akhiri baris dengan dua spasi atau <code>{'\\'}</code> untuk baris baru tanpa paragraf baru.</dd>
            </div>
            <div>
              <dt>Escape</dt>
              <dd><code>{'\\*'}</code> menampilkan tanda bintang apa adanya.</dd>
            </div>
          </dl>
        </div>
        <div>
          <h4 className="kb-help__sub">Pintasan</h4>
          <dl className="kb-help__list">
            <div><dt>Tebal</dt><dd><code>Ctrl/⌘ + B</code></dd></div>
            <div><dt>Miring</dt><dd><code>Ctrl/⌘ + I</code></dd></div>
            <div><dt>Kode sebaris</dt><dd><code>Ctrl/⌘ + E</code></dd></div>
            <div><dt>Tautan</dt><dd><code>Ctrl/⌘ + K</code></dd></div>
            <div><dt>Coret</dt><dd><code>Ctrl/⌘ + Shift + X</code></dd></div>
            <div><dt>Daftar bernomor</dt><dd><code>Ctrl/⌘ + Shift + 7</code></dd></div>
            <div><dt>Daftar berpoin</dt><dd><code>Ctrl/⌘ + Shift + 8</code></dd></div>
            <div><dt>Daftar tugas</dt><dd><code>Ctrl/⌘ + Shift + 9</code></dd></div>
            <div><dt>Kutipan</dt><dd><code>Ctrl/⌘ + Shift + .</code></dd></div>
            <div><dt>Judul H2/H3/H4</dt><dd><code>Ctrl/⌘ + Alt + 1/2/3</code></dd></div>
            <div><dt>Blok kode</dt><dd><code>Ctrl/⌘ + Alt + C</code></dd></div>
          </dl>
        </div>
      </div>
      <p className="kb-help__note muted">
        Blok yang dipilih dibungkus otomatis, dan menekan perintah yang sama sekali lagi melepasnya.
        HTML mentah ditampilkan sebagai teks dan garis bawah tidak didukung; gunakan tebal atau miring.
      </p>
    </section>
  );
}
