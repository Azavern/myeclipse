import type { Metadata } from 'next';
import { NoAccess } from '@/components/states';
import { buildIntroActs, buildIntroChapters, introRoster } from '@/features/intro/chapters';
import { IntroEmpty } from '@/features/intro/empty';
import { IntroExperience } from '@/features/intro/intro-experience';
import { loadIntroSource, type IntroExplore } from '@/features/intro/queries';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { getViewer, getVisibilityMap, requireView } from '@/lib/visibility/server';

export const metadata: Metadata = {
  title: 'Intro',
  description: 'Halaman pembuka kelas dengan lima babak dan gerak tiga dimensi.',
};

export default async function IntroPage() {
  if (!(await requireView('page.home', '/intro'))) return <NoAccess />;
  const [map, viewer, cls] = await Promise.all([getVisibilityMap(), getViewer(), getClass()]);
  const ok = (key: string) => map.get(key) === true;
  const show = (section: string, source?: string) => ok(section) && (!source || ok(source));
  const guest = !viewer.user;

  // Gating jelajah tamu sama dengan ExploreBlock di beranda: QR selalu tampil,
  // tautan halaman hanya bila page.* yang bersangkutan lolos visibility.
  const explore: IntroExplore[] = guest
    ? [
      { href: '/qr', label: 'QR Studio', desc: 'Buat QR normal atau custom dengan ikon' },
      ...([['page.schedule', '/schedule', 'Jadwal', 'Kuliah dan agenda rutin kelas'],
        ['page.tasks', '/tasks', 'Tugas', 'Tugas aktif dan tenggat terdekat'],
        ['page.events', '/events', 'Event', 'Acara dan kegiatan mendatang'],
        ['page.members', '/members', 'Anggota', 'Kenalan dengan anggota kelas'],
        ['page.class_about', '/class', 'Kelas', 'Tentang kelas ini'],
        ['page.knowledge', '/knowledge', 'Pengetahuan', 'Catatan dan panduan bersama']] as const)
        .filter(([key]) => ok(key))
        .map(([, href, label, desc]) => ({ href, label, desc })),
    ]
    : [];

  const source = await loadIntroSource({
    supabase: await createClient(),
    show,
    guest,
    explore,
    now: new Date(),
    timezone: cls?.timezone ?? 'Asia/Jakarta',
  });
  const chapters = buildIntroChapters(source);
  const brand = source.identity?.name ?? 'Intro';

  // Finale bukan bab data. Bila seluruh bab data tersaring, tampilkan pesan kosong.
  if (!chapters.some((chapter) => chapter.kind !== 'finale')) {
    return <IntroEmpty brand={brand} guest={guest} />;
  }

  const { acts, total } = buildIntroActs(chapters);
  return <IntroExperience acts={acts} total={total} roster={introRoster(chapters)} brand={brand} guest={guest} />;
}
