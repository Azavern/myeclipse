import type { ReactNode } from 'react';
import { NoAccess } from '@/components/states';
import { ActivityBlock, EventsBlock, ExploreBlock, Hero, MembersBlock, OverviewTiles, ScheduleBlock, TasksBlock,
  overviewTiles, type ActivityWeek, type EventItem, type ExploreItem, type Overview, type ScheduleItem } from '@/features/home/blocks';
import { HOME_LAYOUTS, type HomeBlock } from '@/features/home/layouts';
import type { MemberItem } from '@/features/members/member-card';
import type { TaskItem } from '@/features/tasks/task-row';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_THEME } from '@/lib/theme/defaults';
import { ThemeSchema } from '@/lib/theme/schema';
import { DAYS, formatDay, isoWeekday } from '@/lib/time';
import { getViewer, getVisibilityMap, requireView } from '@/lib/visibility/server';

const run = async <X,>(on: boolean, f: () => PromiseLike<{ data: unknown }>): Promise<X | null> => (on ? ((await f()).data as X) : null);
type Identity = { name: string; tagline: string | null; description: string | null; highlight_text: string | null; highlight_url: string | null; timezone: string; cover_path: string | null };

export default async function Home() {
  if (!(await requireView('page.home', '/'))) return <NoAccess />;
  const [map, viewer, cls] = await Promise.all([getVisibilityMap(), getViewer(), getClass()]);
  const ok = (k: string) => map.get(k) === true;
  const show = (section: string, source?: string) => ok(section) && (!source || ok(source)); // section DAN halaman sumber datanya
  const supabase = await createClient();
  const identity = await supabase.from('class_identity_v').select('name,tagline,description,highlight_text,highlight_url,timezone,cover_path').single();
  if (identity.error || !identity.data) throw new Error('Identitas kelas tidak terbaca'); // ditangani error.tsx
  const id = identity.data as Identity;
  const tz = id.timezone;
  const layout = (ThemeSchema.safeParse(cls?.theme).data ?? DEFAULT_THEME).layout;

  const now = new Date();
  const dow = isoWeekday(tz, now);
  const [sched, events, tasks, members, overview, activity] = await Promise.all([
    run<(ScheduleItem & { semester: string })[]>(show('section.home.schedule', 'page.schedule'), () => supabase.from('schedules')
      .select('id,title,start_time,end_time,location,semester,type').eq('day_of_week', dow)
      .order('semester', { ascending: false }).order('start_time').limit(30)),
    run<EventItem[]>(show('section.home.events', 'page.events'), () => supabase.from('events').select('id,title,start_at,location')
      .gte('end_at', now.toISOString()).order('start_at').limit(4)),
    run<TaskItem[]>(show('section.home.tasks', 'page.tasks'), () => supabase.from('tasks').select('id,title,deadline,course')
      .eq('status', 'active').order('deadline').limit(5)),
    run<MemberItem[]>(show('section.home.members', 'page.members'), () => supabase.from('member_profile_v')
      .select('username,full_name,nickname,role_name,avatar_path').eq('status', 'active').order('joined_at', { ascending: false }).limit(12)),
    run<Overview[]>(show('section.home.overview'), () => supabase.rpc('get_home_overview')),
    run<ActivityWeek[]>(show('section.home.activity'), () => supabase.rpc('get_activity_trend')),
  ]);
  const [cover, avatars] = await Promise.all([
    signMany(supabase, 'class-media', [id.cover_path]),
    signMany(supabase, 'member-media', (members ?? []).map((m) => m.avatar_path)),
  ]);
  const today = (sched ?? []).filter((r, _i, all) => r.semester === all[0]?.semester); // hanya semester terbaru
  const ov = overview?.[0];
  const guest = !viewer.user;
  // Tamu mendapat panel ringkasan di dalam hero, jadi kartu statistik terpisah tidak dirender lagi.
  const heroStats = guest && show('section.home.identity') && show('section.home.overview') && ov ? overviewTiles(ov) : [];
  const secondary = guest
    ? ok('page.knowledge') ? { href: '/knowledge', label: 'Jelajahi pengetahuan', icon: 'book-open' as const }
      : ok('page.class_about') ? { href: '/class', label: 'Tentang kelas', icon: 'book' as const }
        : null
    : null;
  const guestLinks: ExploreItem[] = guest
    ? [
      { href: '/qr', label: 'QR Studio', icon: 'qr', desc: 'Buat QR normal atau custom dengan ikon' },
      ...([['page.schedule', '/schedule', 'Jadwal', 'calendar', 'Kuliah dan agenda rutin kelas'],
        ['page.tasks', '/tasks', 'Tugas', 'tasks', 'Tugas aktif dan tenggat terdekat'],
        ['page.events', '/events', 'Event', 'calendar-days', 'Acara dan kegiatan mendatang'],
        ['page.members', '/members', 'Anggota', 'users', 'Kenalan dengan anggota kelas'],
        ['page.class_about', '/class', 'Kelas', 'book', 'Tentang kelas ini'],
        ['page.knowledge', '/knowledge', 'Pengetahuan', 'book-open', 'Catatan dan panduan bersama']] as const)
        .filter(([key]) => ok(key))
        .map(([, href, label, icon, desc]) => ({ href, label, icon, desc })),
    ]
    : [];

  // Tiap blok dirender hanya bila datanya ada; urutan dari preset tema (features/home/layouts.ts).
  const blocks: Record<HomeBlock, { node: ReactNode; span: 12 | 5 | 7 } | null> = {
    identity: show('section.home.identity')
      ? { span: 12, node: (
        <div className="stack">
          <Hero name={id.name} tagline={id.tagline} description={id.description} highlight={id.highlight_text}
            highlightUrl={id.highlight_url} coverUrl={id.cover_path ? cover.get(id.cover_path) : undefined}
            todayLabel={formatDay(now.toISOString(), tz)} guest={guest} stats={heroStats} secondary={secondary} />
          {guestLinks.length > 0 && <ExploreBlock items={guestLinks} />}
        </div>) }
      : null,
    overview: ov && heroStats.length === 0 ? { span: 12, node: <OverviewTiles ov={ov} /> } : null,
    upcoming: sched !== null || tasks !== null || events !== null
      ? { span: 12, node: (
        <div className="dash">
          <div className="stack">
            {sched !== null && <ScheduleBlock rows={today} tz={tz} now={now} dayName={DAYS[dow - 1] ?? ''} />}
            {tasks !== null && <TasksBlock rows={tasks} tz={tz} now={now} />}
          </div>
          <div className="stack">{events !== null && <EventsBlock rows={events} tz={tz} />}</div>
        </div>) }
      : null,
    activity: activity !== null ? { span: layout === 'standard' ? 5 : 12, node: <ActivityBlock rows={activity} /> } : null,
    members: members !== null && members.length > 0
      ? { span: layout === 'standard' ? 7 : 12, node: <MembersBlock rows={members} avatars={avatars} large={layout === 'profile_focused'} /> }
      : null,
  };
  return (
    <div className="home">
      {HOME_LAYOUTS[layout].map((key) => { const b = blocks[key]; return b && <div key={key} className={`span-${b.span}`}>{b.node}</div>; })}
    </div>
  );
}
