-- pgTAP 005: role kepengurusan (migrasi 0015) — batas pemegang role dan
-- promosi ketua yang otomatis menurunkan ketua lama menjadi wakil.
--
-- Susunan role dibuat deterministik di instance mana pun: trigger dimatikan
-- sementara, seluruh pemegang role dinormalkan ke `member`, lalu fixture
-- dipasang. Semua perubahan di-rollback di akhir berkas.
begin;
select plan(15);

alter table public.memberships disable trigger user;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'rx1@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'rx2@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'rx3@example.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'rx4@example.test'),
  ('00000000-0000-0000-0000-0000000000f5', 'rx5@example.test'),
  ('00000000-0000-0000-0000-0000000000f6', 'rx6@example.test'),
  ('00000000-0000-0000-0000-0000000000f7', 'rx7@example.test'),
  ('00000000-0000-0000-0000-0000000000f8', 'rx8@example.test'),
  ('00000000-0000-0000-0000-0000000000f9', 'rx9@example.test');

update public.memberships set role_id = (select id from public.roles where key = 'member');

insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, 'active', now()
  from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000f1'::uuid, 'ketua'),
    ('00000000-0000-0000-0000-0000000000f2'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f3'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f4'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f5'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f6'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f7'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f8'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000f9'::uuid, 'member')
  ) u(id, rk) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;

alter table public.memberships enable trigger user;

create function public.t_role(p_user uuid) returns text language sql as $$
  select r.key from public.memberships m
    join public.roles r on r.class_id = m.class_id and r.id = m.role_id
   where m.user_id = p_user
$$;
grant execute on function public.t_role(uuid) to public;

create function public.t_holders(p_key text) returns int language sql as $$
  select count(*)::int from public.memberships m
    join public.roles r on r.class_id = m.class_id and r.id = m.role_id
   where r.key = p_key
$$;
grant execute on function public.t_holders(text) to public;

-- Default izin jabatan saat ini (termasuk kas.manage untuk Bendahara).
select is((select permissions from public.roles where key = 'wakil'),
  array['class.manage','schedule.manage','events.manage','tasks.manage','members.request']::text[],
  'Wakil Ketua memakai default izinnya');
select is((select permissions from public.roles where key = 'sekretaris'),
  array['schedule.manage','tasks.manage']::text[],
  'Sekretaris memakai default izinnya');
select is((select permissions from public.roles where key = 'bendahara'),
  array['events.manage','kas.manage']::text[],
  'Bendahara memakai default izinnya termasuk kelola kas');

-- ===== Batas Wakil Ketua (3) =================================================
select is(public.t_holders('ketua'), 1, 'fixture dimulai dengan satu ketua');

update public.memberships set role_id = (select id from public.roles where key = 'wakil')
 where user_id in ('00000000-0000-0000-0000-0000000000f2',
                   '00000000-0000-0000-0000-0000000000f3',
                   '00000000-0000-0000-0000-0000000000f4');
select is(public.t_holders('wakil'), 3, 'tiga Wakil Ketua diterima');

select throws_ok($$ update public.memberships set role_id = (select id from public.roles where key = 'wakil')
   where user_id = '00000000-0000-0000-0000-0000000000f5' $$,
  'EC041', null, 'Wakil Ketua keempat ditolak');

-- ===== Promosi Ketua =========================================================
-- Ketua lama harus turun ke Wakil. Bila slot Wakil penuh, seluruh promosi
-- ditolak agar batas 3 tetap berlaku.
select throws_ok($$ update public.memberships set role_id = (select id from public.roles where key = 'ketua')
   where user_id = '00000000-0000-0000-0000-0000000000f5' $$,
  'EC041', null, 'promosi Ketua ditolak saat slot Wakil penuh');
select is(public.t_role('00000000-0000-0000-0000-0000000000f1'), 'ketua',
  'Ketua lama tetap ketua saat promosi ditolak');

update public.memberships set role_id = (select id from public.roles where key = 'member')
 where user_id = '00000000-0000-0000-0000-0000000000f4';
update public.memberships set role_id = (select id from public.roles where key = 'ketua')
 where user_id = '00000000-0000-0000-0000-0000000000f5';

select is(public.t_role('00000000-0000-0000-0000-0000000000f1'), 'wakil',
  'Ketua lama otomatis menjadi Wakil Ketua');
select is(public.t_role('00000000-0000-0000-0000-0000000000f5'), 'ketua',
  'anggota yang dipromosikan menjadi Ketua');
select is(public.t_holders('ketua'), 1, 'ketua tetap satu orang');

-- ===== Batas Sekretaris (5) ==================================================
update public.memberships set role_id = (select id from public.roles where key = 'sekretaris')
 where user_id in ('00000000-0000-0000-0000-0000000000f4',
                   '00000000-0000-0000-0000-0000000000f6',
                   '00000000-0000-0000-0000-0000000000f7',
                   '00000000-0000-0000-0000-0000000000f8',
                   '00000000-0000-0000-0000-0000000000f9');
select is(public.t_holders('sekretaris'), 5, 'lima Sekretaris diterima');

select throws_ok($$ update public.memberships set role_id = (select id from public.roles where key = 'sekretaris')
   where user_id = '00000000-0000-0000-0000-0000000000f2' $$,
  'EC041', null, 'Sekretaris keenam ditolak');

-- ===== Batas Bendahara (2) ===================================================
update public.memberships set role_id = (select id from public.roles where key = 'bendahara')
 where user_id in ('00000000-0000-0000-0000-0000000000f4',
                   '00000000-0000-0000-0000-0000000000f6');
select is(public.t_holders('bendahara'), 2, 'dua Bendahara diterima');

select throws_ok($$ update public.memberships set role_id = (select id from public.roles where key = 'bendahara')
   where user_id = '00000000-0000-0000-0000-0000000000f7' $$,
  'EC041', null, 'Bendahara ketiga ditolak');

select * from finish();
rollback;
