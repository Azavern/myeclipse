-- pgTAP 006: akses per role dan pengajuan perubahan jabatan (migrasi 0016).
--
-- Susunan role dibuat deterministik: trigger dimatikan sementara, semua
-- pemegang role dinormalkan ke `member`, lalu fixture dipasang. Perubahan
-- di-rollback di akhir berkas.
begin;
select plan(34);

alter table public.memberships disable trigger user;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'ax1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'ax2@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'ax3@example.test'),
  ('00000000-0000-0000-0000-0000000000b4', 'ax4@example.test'),
  ('00000000-0000-0000-0000-0000000000b5', 'ax5@example.test');

update public.memberships set role_id = (select id from public.roles where key = 'member');

insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, 'active', now()
  from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000b1'::uuid, 'ketua'),
    ('00000000-0000-0000-0000-0000000000b2'::uuid, 'wakil'),
    ('00000000-0000-0000-0000-0000000000b3'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000b4'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000b5'::uuid, 'member')
  ) u(id, rk) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;

insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000b1'::uuid, 'ax_ketua', 'Ketua Akses'),
    ('00000000-0000-0000-0000-0000000000b2'::uuid, 'ax_wakil', 'Wakil Akses'),
    ('00000000-0000-0000-0000-0000000000b3'::uuid, 'ax_m3', 'Anggota Tiga'),
    ('00000000-0000-0000-0000-0000000000b4'::uuid, 'ax_m4', 'Anggota Empat'),
    ('00000000-0000-0000-0000-0000000000b5'::uuid, 'ax_m5', 'Anggota Lima')
  ) u(id, un, fn) on true;

alter table public.memberships enable trigger user;

-- id role disimpan di GUC: pemegang members.request tidak boleh membaca tabel
-- roles langsung (hanya lewat RPC get_role_change_options, seperti di aplikasi).
select set_config('tap.role_ketua',     (select id::text from public.roles where key = 'ketua'), false);
select set_config('tap.role_wakil',     (select id::text from public.roles where key = 'wakil'), false);
select set_config('tap.role_sekretaris',(select id::text from public.roles where key = 'sekretaris'), false);
select set_config('tap.role_bendahara', (select id::text from public.roles where key = 'bendahara'), false);
select set_config('tap.role_member',    (select id::text from public.roles where key = 'member'), false);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

create function public.t_role(p_user uuid) returns text language sql as $$
  select r.key from public.memberships m
    join public.roles r on r.class_id = m.class_id and r.id = m.role_id
   where m.user_id = p_user
$$;
grant execute on function public.t_role(uuid) to public;

-- ===== Ketua mengatur akses ==================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true); end $$;

select lives_ok($$ select public.set_role_access(
  current_setting('tap.role_wakil')::uuid, 'events.manage', true) $$,
  'Ketua mencentang Kelola event untuk Wakil Ketua');
select is((select permissions from public.roles where key = 'wakil'),
  array['events.manage']::text[], 'akses tersimpan pada role Wakil Ketua');

select throws_ok($$ select public.set_role_access(
  current_setting('tap.role_ketua')::uuid, 'events.manage', false) $$,
  'EC063', null, 'akses Ketua tidak dapat diubah');
select throws_ok($$ select public.set_role_access(
  current_setting('tap.role_wakil')::uuid, 'members.manage', true) $$,
  '22023', null, 'kelola anggota penuh tidak dapat diberikan ke jabatan lain');
select throws_ok($$ select public.set_role_access(
  current_setting('tap.role_member')::uuid, 'schedule.manage', true) $$,
  'EC064', null, 'role Member tidak dapat diberi akses');

select lives_ok($$ select public.set_role_access(
  current_setting('tap.role_wakil')::uuid, 'members.request', true) $$,
  'Ketua mengaktifkan pengajuan jabatan untuk Wakil Ketua');
select is((select permissions from public.roles where key = 'wakil'),
  array['events.manage','members.request']::text[], 'dua akses Wakil Ketua tersimpan');

select throws_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b3',
  current_setting('tap.role_wakil')::uuid) $$,
  '42501', null, 'Ketua tanpa akses pengajuan tidak bisa memakai jalur pengajuan');

-- ===== Wakil Ketua mengajukan ================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true); end $$;

select throws_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b2',
  current_setting('tap.role_member')::uuid) $$,
  'EC060', null, 'tidak bisa mengajukan perubahan jabatan sendiri');
select throws_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b3',
  current_setting('tap.role_ketua')::uuid) $$,
  'EC061', null, 'tidak bisa mengajukan promosi ke Ketua');
select throws_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b1',
  current_setting('tap.role_wakil')::uuid) $$,
  'EC061', null, 'jabatan Ketua tidak bisa disentuh lewat pengajuan');

select lives_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b3',
  (select id from public.get_role_change_options() where key = 'wakil')) $$,
  'Wakil Ketua mengajukan anggota menjadi Wakil Ketua');
select is((select count(*) from public.role_change_requests)::int, 1,
  'pengajuan tersimpan sebagai menunggu');

select throws_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b3',
  (select id from public.get_role_change_options() where key = 'bendahara')) $$,
  '23505', null, 'pengajuan ganda untuk anggota yang sama ditolak');

select throws_ok($$ select public.set_role_access(
  current_setting('tap.role_wakil')::uuid, 'tasks.manage', true) $$,
  '42501', null, 'Wakil Ketua tidak bisa mengubah akses role');
select throws_ok($$ select public.decide_role_change_request(
  (select id from public.role_change_requests where target_user_id = '00000000-0000-0000-0000-0000000000b3'), true) $$,
  '42501', null, 'Wakil Ketua tidak bisa menyetujui pengajuan');
select is(public.t_rows($$ update public.memberships set role_id = current_setting('tap.role_wakil')::uuid
   where user_id = '00000000-0000-0000-0000-0000000000b3' $$)::int, 0,
  'Wakil Ketua tetap tidak bisa mengubah role langsung');

select lives_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b4',
  (select id from public.get_role_change_options() where key = 'sekretaris')) $$,
  'pengajuan kedua untuk anggota lain diterima');
select is((select count(*) from public.role_change_requests)::int, 2,
  'pengaju melihat dua pengajuannya sendiri');
select is((select count(*) from public.get_role_change_options())::int, 4,
  'pemegang akses pengajuan mendapat empat pilihan jabatan');

-- ===== Anggota tanpa akses ===================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true); end $$;
select is((select count(*) from public.role_change_requests)::int, 0,
  'anggota biasa tidak melihat antrean pengajuan');
select is((select count(*) from public.get_role_change_options())::int, 0,
  'anggota biasa tidak mendapat pilihan jabatan');

-- ===== Ketua memutuskan =====================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true); end $$;

select lives_ok($$ select public.decide_role_change_request(
  (select id from public.role_change_requests where target_user_id = '00000000-0000-0000-0000-0000000000b3'), true) $$,
  'Ketua menyetujui pengajuan');
select is(public.t_role('00000000-0000-0000-0000-0000000000b3'), 'wakil',
  'pengajuan yang disetujui diterapkan ke keanggotaan');
select is((select status from public.role_change_requests
            where target_user_id = '00000000-0000-0000-0000-0000000000b3'), 'approved',
  'pengajuan ditandai approved');
select ok((select decided_by is not null and decided_at is not null from public.role_change_requests
            where target_user_id = '00000000-0000-0000-0000-0000000000b3'),
  'pemutus dan waktu keputusan tercatat');

select throws_ok($$ select public.decide_role_change_request(
  (select id from public.role_change_requests where target_user_id = '00000000-0000-0000-0000-0000000000b3'), true) $$,
  'EC057', null, 'pengajuan yang sudah diputuskan tidak bisa diputuskan lagi');

select lives_ok($$ select public.decide_role_change_request(
  (select id from public.role_change_requests where target_user_id = '00000000-0000-0000-0000-0000000000b4'), false) $$,
  'Ketua menolak pengajuan');
select is(public.t_role('00000000-0000-0000-0000-0000000000b4'), 'member',
  'pengajuan yang ditolak tidak mengubah jabatan');
select is((select status from public.role_change_requests
            where target_user_id = '00000000-0000-0000-0000-0000000000b4'), 'rejected',
  'pengajuan ditandai rejected');

-- ===== Batas jabatan tetap berlaku saat persetujuan =========================
select lives_ok($$ update public.memberships set role_id = current_setting('tap.role_wakil')::uuid
   where user_id = '00000000-0000-0000-0000-0000000000b5' $$,
  'Ketua mengisi slot Wakil Ketua sampai batas tiga');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true); end $$;
select lives_ok($$ select public.request_role_change(
  '00000000-0000-0000-0000-0000000000b4',
  (select id from public.get_role_change_options() where key = 'wakil')) $$,
  'Wakil Ketua mengajukan anggota lain saat slot hampir penuh');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true); end $$;
select throws_ok($$ select public.decide_role_change_request(
  (select id from public.role_change_requests
    where target_user_id = '00000000-0000-0000-0000-0000000000b4' and status = 'pending'), true) $$,
  'EC041', null, 'persetujuan yang melewati batas jabatan ditolak');
select is((select status from public.role_change_requests
            where target_user_id = '00000000-0000-0000-0000-0000000000b4' and status = 'pending'), 'pending',
  'pengajuan yang gagal diterapkan tetap menunggu');

select * from finish();
rollback;
