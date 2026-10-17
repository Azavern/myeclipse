import type { Metadata } from 'next';
import Link from 'next/link';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, LinkButton, PageHeader, Segmented } from '@/components/ui/primitives';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { DAYS, hm, isoWeekday, zoneLabel } from '@/lib/time';
import { cx } from '@/lib/cx';
import { getViewer, requireView } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Jadwal' };

type Row = { id: string; title: string; description: string | null; day_of_week: number; start_time: string;
  end_time: string; location: string | null; type: 'class' | 'activity'; url: string | null };

// Jadwal kuliah mingguan per semester (migrasi 0010): hari + jam saja, tanpa tanggal.
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ semester?: string }> }) {
  if (!(await requireView('page.schedule', '/schedule'))) return <NoAccess />;
  const canManage = (await getViewer()).can('schedule.manage');
  const sp = await searchParams;
  const supabase = await createClient();
  const cls = await getClass();
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const all = await supabase.from('schedules').select('semester').order('semester', { ascending: false }).limit(500);
  const semesters = [...new Set(((all.data ?? []) as { semester: string }[]).map((r) => r.semester))];
  const semester = sp.semester && semesters.includes(sp.semester) ? sp.semester : semesters[0];
  const add = canManage && <LinkButton href="/schedule/new" icon="plus">Tambah jadwal</LinkButton>;
  if (!semester) {
    return (
      <>
        <PageHeader icon="calendar" title="Jadwal kuliah" description="Jadwal kuliah dan kegiatan kelas." actions={add} />
        <EmptyState icon="calendar" title="Belum ada jadwal" action={add}>Jadwal kuliah dan kegiatan kelas akan tampil di sini.</EmptyState>
      </>
    );
  }
  const { data } = await supabase.from('schedules')
    .select('id,title,description,day_of_week,start_time,end_time,location,type,url')
    .eq('semester', semester).order('day_of_week').order('start_time').limit(200);
  const rows = (data ?? []) as Row[];
  const today = isoWeekday(tz, new Date());
  return (
    <>
      <PageHeader icon="calendar" title="Jadwal kuliah" description={`Berulang setiap pekan sepanjang semester. Jam dalam ${zoneLabel(tz)}.`} actions={add} />
      {semesters.length > 1 && (
        <div className="toolbar">
          <Segmented label="Semester" items={semesters.map((s) => ({ href: `/schedule?semester=${encodeURIComponent(s)}`, label: s, active: s === semester }))} />
        </div>)}
      {semesters.length === 1 && <div className="toolbar"><Chip tone="brand" icon="calendar">{semester}</Chip></div>}
      <div className="week">
        {DAYS.map((name, i) => {
          const day = rows.filter((r) => r.day_of_week === i + 1);
          if (day.length === 0) return null;
          const isToday = i + 1 === today;
          return (
            <section key={name} className={cx('card card--flush day', isToday && 'day--today')} aria-labelledby={`d${i}`}>
              <header className="day__head">
                <h2 id={`d${i}`} className="card__title">{name}</h2>
                {isToday ? <Chip tone="brand" icon="star">Hari ini</Chip> : <span className="muted nums">{day.length} sesi</span>}
              </header>
              <ul>
                {day.map((r) => (
                  <li key={r.id} className={cx('session', r.type === 'activity' && 'session--activity')}>
                    <div className="session__time">{hm(r.start_time)}–{hm(r.end_time)}</div>
                    <p className="session__title">{r.title}</p>
                    <div className="meta">
                      <Chip tone={r.type === 'class' ? 'brand' : 'accent'}>{r.type === 'class' ? 'Kuliah' : 'Kegiatan'}</Chip>
                      {r.location && <span><Icon name="map-pin" size={14} />{r.location}</span>}
                    </div>
                    {r.description && <p className="muted pre clamp-3">{r.description}</p>}
                    {r.url && <p><ExtLink href={r.url}>Tautan terkait</ExtLink></p>}
                    {canManage && <Link href={`/schedule/${r.id}/edit`} className="btn btn--ghost btn--sm session__edit"><Icon name="pencil" size={16} />Ubah</Link>}
                  </li>))}
              </ul>
            </section>);
        })}
      </div>
    </>
  );
}
