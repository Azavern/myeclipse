import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { marqueePace } from '../../src/components/ui/marquee';
import { Hero, OverviewTiles, SectionLink, TasksBlock } from '../../src/features/home/blocks';
import type { TaskItem } from '../../src/features/tasks/task-row';

const NOW = new Date('2026-11-09T00:00:00Z');
const TZ = 'Asia/Makassar';

const task = (i: number): TaskItem => ({
  id: `task-${i}`,
  title: `Tugas ${i}`,
  course: `Mata kuliah ${i}`,
  deadline: new Date(NOW.getTime() - i * 3_600_000).toISOString(),
  status: 'active',
});

const hero = (props: Partial<Parameters<typeof Hero>[0]>) => renderToStaticMarkup(createElement(Hero, {
  name: 'Kelas', tagline: null, highlight: null, highlightUrl: null,
  todayLabel: 'Senin, 9 November 2026', guest: false, ...props,
}));

const tasks = (count: number) => renderToStaticMarkup(createElement(TasksBlock, {
  rows: Array.from({ length: count }, (_, i) => task(i + 1)), tz: TZ, now: NOW,
}));

describe('hero sorotan', () => {
  it('tidak menampilkan kode kelas dan menyusun statistik tamu di rail', () => {
    const html = hero({
      guest: true,
      stats: [{ icon: 'users', value: 19, label: 'Anggota aktif', tone: 'brand' }],
    });
    expect(html).not.toContain('hero__code');
    expect(html).toContain('hero__side');
    expect(html.indexOf('hero__actions')).toBeLessThan(html.indexOf('hero__side'));
    expect(html.indexOf('hero__side')).toBeLessThan(html.indexOf('Anggota aktif'));
  });

  it('tidak merender callout saat highlight_text kosong', () => {
    const html = hero({ highlight: '   ', highlightUrl: 'https://example.com' });
    expect(html).not.toContain('hero__highlight');
    expect(html).not.toContain('Sorotan');
  });

  it('merender teks tanpa tautan saat highlight_url kosong atau bukan https', () => {
    for (const url of [null, '', 'http://example.com']) {
      const html = hero({ highlight: 'Belajar bersama', highlightUrl: url });
      expect(html).toContain('Sorotan');
      expect(html).toContain('Belajar bersama');
      expect(html).not.toContain('hero__highlight--link');
      expect(html).not.toContain('href="http://example.com"');
    }
  });

  it('menjadikan seluruh callout tautan hanya untuk https', () => {
    const html = hero({ highlight: 'Belajar bersama', highlightUrl: 'https://example.com' });
    expect(html).toContain('hero__highlight--link');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe('daftar tugas Home', () => {
  it('merender lima baris dan menyembunyikan dua terakhir hanya di mobile', () => {
    const html = tasks(5);
    expect(html.match(/class="htask__row"/g) ?? []).toHaveLength(5);
    expect(html.match(/htask--mobile-hidden/g) ?? []).toHaveLength(2);
    expect(html).toContain('Lihat semua 5 tugas');
  });

  it('membatasi lima baris desktop dan memberi tautan sisa', () => {
    const html = tasks(6);
    expect(html.match(/class="htask__row"/g) ?? []).toHaveLength(5);
    expect(html).toContain('+1 lainnya');
    expect(html).toContain('Lihat semua 6 tugas');
  });

  it('tetap menampilkan footer semua tugas saat tugas tiga atau kurang', () => {
    const html = tasks(3);
    expect(html).toContain('scard__foot');
    expect(html).toContain('Lihat semua 3 tugas');
  });
});

describe('marquee', () => {
  it('memilih durasi 10–14 detik menurut panjang teks', () => {
    expect(marqueePace('Label pendek')).toBe('marquee--short');
    expect(marqueePace('x'.repeat(55))).toBe('marquee--short');
    expect(marqueePace('x'.repeat(56))).toBe('marquee--medium');
    expect(marqueePace('x'.repeat(95))).toBe('marquee--medium');
    expect(marqueePace('x'.repeat(96))).toBe('marquee--long');
  });
});

describe('ringkasan Home', () => {
  it('merender empat tile urut tanpa col-span, termasuk tile peringatan', () => {
    const html = renderToStaticMarkup(createElement(OverviewTiles, {
      ov: { members_count: 12, upcoming_events_count: 2, active_tasks_count: 5, due_soon_tasks_count: 2 },
    }));
    const labels = ['Anggota aktif', 'Event mendatang', 'Tugas aktif', 'Perlu tindakan'];
    const positions = labels.map((label) => html.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).not.toContain('sum__wide');
    expect(html).toContain('sum__item--warning');
    expect(html).toContain('Lewat tenggat atau ≤3 hari');
  });

  it('menyiapkan angka dan label untuk nilai nol tanpa mengubah teks kosong desktop', () => {
    const html = renderToStaticMarkup(createElement(OverviewTiles, {
      ov: { members_count: 0, upcoming_events_count: 0, active_tasks_count: 0, due_soon_tasks_count: 0 },
    }));
    expect(html.match(/sum__value--empty/g) ?? []).toHaveLength(4);
    expect(html.match(/sum__label--empty/g) ?? []).toHaveLength(4);
    expect(html).toContain('Tidak ada tindakan mendesak');
    expect(html).toContain('sum__item--due');
  });
});

describe('tautan aksi section', () => {
  it('menyimpan nama aksesibel lengkap meski label pendek "Semua" tampil di mobile', () => {
    const html = renderToStaticMarkup(createElement(SectionLink, { href: '/tasks', label: 'Semua tugas' }));
    expect(html).toContain('aria-label="Semua tugas"');
    expect(html).toContain('scard__link-long');
    expect(html).toContain('scard__link-short');
    expect(html).toContain('>Semua</span>');
  });
});
