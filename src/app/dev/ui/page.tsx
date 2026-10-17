import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FieldControl } from '@/components/field';
import { Icon } from '@/components/ui/icon';
import { Avatar, Chip, EmptyState, Notice, Section, StatTile, TASK_UI, Tile, type Tone } from '@/components/ui/primitives';
import type { Field } from '@/features/fields';
import type { TaskDisplayStatus } from '@/lib/tasks';

export const metadata: Metadata = { title: 'Galeri state UI' };

const TONES: (Tone | 'outline')[] = ['neutral', 'brand', 'accent', 'success', 'warning', 'error', 'outline'];
const BUTTONS = ['primary', 'secondary', 'ghost', 'accent', 'danger-soft'] as const;
const TASK_STATES = Object.keys(TASK_UI) as TaskDisplayStatus[];
const TASK_LABEL: Record<TaskDisplayStatus, string> = { completed: 'Selesai', archived: 'Diarsipkan', overdue: 'Lewat tenggat', due_soon: 'Segera berakhir', active: 'Aktif' };

const field = (over: Partial<Field>): Field => ({ name: 'contoh', label: 'Nama lengkap', type: 'text', max: 80, ...over });

// Galeri ini membantu meninjau setiap komponen pada setiap state (kontras, fokus, disabled, galat) tanpa data nyata.
// Tidak tersedia di produksi (blueprint §11.3).
export default function UiGalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main id="main" className="app-main">
      <div className="container container--narrow stack">
        <header className="stack stack--sm">
          <h1>Galeri state UI</h1>
          <p className="muted">Hanya tampil di pengembangan. Tekan Tab untuk melihat indikator fokus pada tiap kontrol.</p>
        </header>

        <Section id="g-buttons" title="Tombol" icon="sparkles">
          <div className="card stack">
            <div className="cluster">
              {BUTTONS.map((v) => <button key={v} type="button" className={`btn${v === 'primary' ? '' : ` btn--${v}`}`}>{v}</button>)}
            </div>
            <div className="cluster">
              <button type="button" className="btn btn--sm"><Icon name="plus" size={16} />Kecil</button>
              <button type="button" className="btn btn--lg"><Icon name="plus" size={18} />Besar</button>
              <button type="button" className="btn" disabled>Nonaktif</button>
              <button type="button" className="btn btn--secondary" disabled>Nonaktif</button>
              <button type="button" className="btn" aria-busy="true" disabled><Icon name="loader" size={18} className="spin" />Menyimpan…</button>
            </div>
          </div>
        </Section>

        <Section id="g-chips" title="Chip dan status" icon="check-circle">
          <div className="card stack">
            <div className="cluster">{TONES.map((t) => <Chip key={t} tone={t}>{t}</Chip>)}</div>
            <div className="cluster">
              {TASK_STATES.map((s) => <Chip key={s} tone={TASK_UI[s].tone} icon={TASK_UI[s].icon}>{TASK_LABEL[s]}</Chip>)}
            </div>
          </div>
        </Section>

        <Section id="g-notice" title="Pemberitahuan" icon="info">
          <div className="stack stack--sm">
            <Notice tone="info">Informasi netral untuk konteks tambahan.</Notice>
            <Notice tone="success" role="status">Perubahan tersimpan.</Notice>
            <Notice tone="warning">Tautan ini hanya tampil sekali.</Notice>
            <Notice tone="error" role="alert">Gagal menyimpan. Periksa isian lalu coba lagi.</Notice>
          </div>
        </Section>

        <Section id="g-fields" title="Isian formulir" icon="pencil">
          <div className="card form">
            <FieldControl idPrefix="g1" field={field({ hint: 'Seperti yang tertulis di KTM.', required: true })} />
            <FieldControl idPrefix="g2" field={field({ name: 'galat', required: true })} error="Nama lengkap wajib diisi." value="" />
            <FieldControl idPrefix="g3" field={field({ name: 'isi', type: 'textarea', label: 'Bio', max: 500 })} value="Mahasiswa semester 5, suka menata jadwal." />
            <FieldControl idPrefix="g4" field={field({ name: 'pilih', type: 'select', label: 'Role', options: [['a', 'Anggota'], ['b', 'Bendahara']] })} />
            <FieldControl idPrefix="g5" field={field({ name: 'sandi', type: 'password', label: 'Kata sandi', autoComplete: 'new-password', min: 10 })} />
          </div>
        </Section>

        <Section id="g-tiles" title="Ringkasan dan avatar" icon="chart">
          <div className="card stack">
            <div className="stat-grid">
              <StatTile icon="users" value={12} label="Anggota aktif" tone="brand" />
              <StatTile icon="hourglass" value={0} label="Tenggat dalam 3 hari" tone="success" />
              <StatTile icon="alert-triangle" value={4} label="Terlambat" tone="error" />
            </div>
            <div className="cluster">
              <Tile icon="cap" size="sm" /><Tile icon="cap" /><Tile icon="cap" size="lg" tone="accent" />
              <Avatar name="Ayu Lestari" size="sm" /><Avatar name="Bima Prakoso" /><Avatar name="Citra Maharani" size="lg" />
            </div>
          </div>
        </Section>

        <Section id="g-empty" title="State kosong dan muat" icon="archive">
          <div className="card stack">
            <EmptyState icon="calendar" title="Belum ada event mendatang" compact>Kegiatan kelas akan muncul di sini.</EmptyState>
            <div role="status" aria-busy="true" className="stack stack--sm">
              <span className="sr-only">Memuat contoh…</span>
              <div className="skeleton skel-title" aria-hidden="true" />
              <div className="skeleton skel-line skel-w60" aria-hidden="true" />
              <div className="skeleton skel-block skel-stat" aria-hidden="true" />
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
