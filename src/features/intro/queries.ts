import 'server-only';
import type { MemberItem } from '@/features/members/member-card';
import type { TaskItem } from '@/features/tasks/task-row';
import { signMany } from '@/lib/storage/sign';
import type { createClient } from '@/lib/supabase/server';

export type IntroIdentity = {
  name: string;
  tagline: string | null;
  description: string | null;
  highlight_text: string | null;
  highlight_url: string | null;
  timezone: string;
  cover_path: string | null;
};

export type IntroScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  type: 'class' | 'activity';
  day_of_week: number;
  semester: string;
};

export type IntroEventRow = { id: string; title: string; start_at: string; location: string | null };
export type IntroOverview = { members_count: number | null; upcoming_events_count: number | null; active_tasks_count: number | null; due_soon_tasks_count: number | null };
export type IntroActivity = { week_start: string; activity_count: number };
export type IntroMember = MemberItem & { joined_at?: string | null };
export type IntroExplore = { href: string; label: string; desc: string };

export type IntroSource = {
  identity: IntroIdentity | null;
  overview: IntroOverview[] | null;
  activity: IntroActivity[] | null;
  schedule: IntroScheduleRow[] | null;
  events: IntroEventRow[] | null;
  tasks: TaskItem[] | null;
  members: IntroMember[] | null;
  coverUrl?: string;
  avatars: Record<string, string>;
  explore: IntroExplore[];
  guest: boolean;
  now: Date;
  timezone: string;
};

type QueryResult = { data: unknown; error: unknown };

const run = async <X,>(on: boolean, query: () => PromiseLike<QueryResult>): Promise<X | null> =>
  (on ? ((await query()).data as X) : null);

// Semua permintaan memakai client JWT user. Hanya bagian yang lolos visibility yang
// diambil, sehingga data terlarang tidak pernah ikut ke payload klien. Bentuk query
// sengaja sama dengan (app)/page.tsx agar isi intro identik dengan beranda.
export async function loadIntroSource(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  show: (section: string, source?: string) => boolean;
  guest: boolean;
  explore: IntroExplore[];
  now: Date;
  timezone: string;
}): Promise<IntroSource> {
  const { supabase, show, guest, explore, now, timezone } = input;
  const identityQuery = show('section.home.identity')
    ? supabase.from('class_identity_v').select('name,tagline,description,highlight_text,highlight_url,timezone,cover_path').single()
    : Promise.resolve({ data: null, error: null });

  const [identity, schedule, events, tasks, members, overview, activity] = await Promise.all([
    identityQuery,
    run<IntroScheduleRow[]>(show('section.home.schedule', 'page.schedule'), () => supabase.from('schedules')
      .select('id,title,start_time,end_time,location,semester,type,day_of_week')
      .order('semester', { ascending: false }).order('day_of_week').order('start_time').limit(200)),
    run<IntroEventRow[]>(show('section.home.events', 'page.events'), () => supabase.from('events').select('id,title,start_at,location')
      .gte('end_at', now.toISOString()).order('start_at').limit(3)),
    run<TaskItem[]>(show('section.home.tasks', 'page.tasks'), () => supabase.from('tasks').select('id,title,deadline,course')
      .eq('status', 'active').order('deadline').limit(100)),
    run<IntroMember[]>(show('section.home.members', 'page.members'), () => supabase.from('member_profile_v')
      .select('username,full_name,nickname,role_name,avatar_path,status,joined_at').eq('status', 'active')
      .order('joined_at', { ascending: false }).limit(200)),
    run<IntroOverview[]>(show('section.home.overview'), () => supabase.rpc('get_home_overview')),
    run<IntroActivity[]>(show('section.home.activity'), () => supabase.rpc('get_activity_trend')),
  ]);

  if (identity.error) throw new Error('Identitas kelas tidak terbaca');
  const id = identity.data as IntroIdentity | null;
  const [cover, avatars] = await Promise.all([
    id?.cover_path ? signMany(supabase, 'class-media', [id.cover_path]) : Promise.resolve(new Map<string, string>()),
    members?.length ? signMany(supabase, 'member-media', members.map((member) => member.avatar_path)) : Promise.resolve(new Map<string, string>()),
  ]);

  return {
    identity: id,
    overview: overview ?? null,
    activity: activity ?? null,
    schedule: schedule ?? null,
    events: events ?? null,
    tasks: tasks ?? null,
    members: members ?? null,
    coverUrl: id?.cover_path ? cover.get(id.cover_path) : undefined,
    avatars: Object.fromEntries(avatars),
    explore,
    guest,
    now,
    timezone: id?.timezone ?? timezone,
  };
}
