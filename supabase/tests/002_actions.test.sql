-- pgTAP 002: perilaku DB yang diandalkan Server Action (blueprint §9).
-- Dijalankan lokal dengan shim pgTAP + stub Supabase; BELUM dijalankan lewat `supabase test db`.
begin;
select plan(36);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'k@example.test'), ('00000000-0000-0000-0000-0000000000a2', 'm@example.test'), ('00000000-0000-0000-0000-0000000000a3', 'n@example.test'), ('00000000-0000-0000-0000-0000000000a4', 'o@example.test');
insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, 'active', now()
  from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ketua'), ('00000000-0000-0000-0000-0000000000a2'::uuid, 'member')) u(id, rk) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;
insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'fx_k', 'Ketua Fixture'), ('00000000-0000-0000-0000-0000000000a2'::uuid, 'fx_m', 'Member Fixture')) u(id, un, fn) on true;
insert into public.tasks (class_id, title, deadline, course, target)
select id, '[fixture] tugas', now() + interval '1 day', 'Matkul', 'Seluruh kelas' from public.classes;
insert into public.password_reset_requests (class_id, email) select id, 'm@example.test' from public.classes;
select set_config('tap.class_id', (select id::text from public.classes), false);

-- ===== Member M ==============================================================
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true); end $$;
select throws_ok($$ insert into public.schedules (class_id, title, day_of_week, start_time, end_time, semester, type)
  values (current_setting('tap.class_id')::uuid, 'x', 1, '08:00', '09:00', '2026/2027 Ganjil', 'class') $$, '42501', null, 'M tidak bisa menambah jadwal');
select throws_ok($$ select public.provision_member('00000000-0000-0000-0000-0000000000a4', 'Orang Baru', 'fx_o', (select id from public.roles where key = 'member')) $$, '42501', null, 'M tidak bisa provision anggota');
select throws_ok($$ select public.update_member_identity('00000000-0000-0000-0000-0000000000a1', 'Hack', 'hack_name') $$, '42501', null, 'M tidak bisa mengubah identitas anggota lain');
select is(public.t_rows($$ select 1 from public.password_reset_requests $$)::int, 0, 'M tidak melihat antrean reset sandi');
select is(public.t_rows($$ update public.tasks set title = 'hack' $$)::int, 0, 'M tidak bisa mengubah tugas');
select is(public.t_rows($$ update public.member_profiles set nickname = 'Mimi', bio = 'halo' where user_id = '00000000-0000-0000-0000-0000000000a2' $$)::int, 1, 'M bisa mengubah profilnya sendiri');
select is(public.t_rows($$ update public.member_profiles set nickname = 'x' where user_id = '00000000-0000-0000-0000-0000000000a1' $$)::int, 0, 'M tidak bisa mengubah profil orang lain');
select is(public.t_rows($$ update public.memberships set role_id = (select id from public.roles where key = 'ketua') where user_id = '00000000-0000-0000-0000-0000000000a2' $$)::int, 0, 'M tidak bisa menaikkan role sendiri');

-- ===== Ketua K ===============================================================
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
select lives_ok($$ insert into public.schedules (class_id, title, day_of_week, start_time, end_time, semester, type)
  values (current_setting('tap.class_id')::uuid, 'Basis Data', 2, '08:00', '10:00', '2026/2027 Ganjil', 'class') $$, 'K menambah jadwal mingguan');
select throws_ok($$ insert into public.schedules (class_id, title, day_of_week, start_time, end_time, semester, type)
  values (current_setting('tap.class_id')::uuid, 'x', 2, '08:00', '10:00', '2026/2028 Ganjil', 'class') $$, '23514', null, 'semester dengan tahun tidak berurutan ditolak DB');
select throws_ok($$ insert into public.schedules (class_id, title, day_of_week, start_time, end_time, semester, type)
  values (current_setting('tap.class_id')::uuid, 'x', 2, '10:00', '08:00', '2026/2027 Ganjil', 'class') $$, '23514', null, 'jam selesai sebelum mulai ditolak DB');
select lives_ok($$ insert into public.tasks (class_id, title, deadline, target, course, status)
  values (current_setting('tap.class_id')::uuid, 'Tugas A', now() + interval '2 day', 'Seluruh kelas', 'Basis Data', 'active') $$, 'K menambah tugas dengan mata kuliah');
select lives_ok($$ insert into public.events (class_id, title, start_at, end_at)
  values (current_setting('tap.class_id')::uuid, 'Seminar', now() + interval '3 day', now() + interval '3 day 2 hours') $$, 'K menambah event');
select throws_ok($$ insert into public.events (class_id, title, start_at, end_at)
  values (current_setting('tap.class_id')::uuid, 'Terbalik', now() + interval '3 day', now() + interval '2 day') $$, '23514', null, 'event dengan selesai < mulai ditolak DB');
select lives_ok($$ update public.classes set theme = '{"layout":"standard","font_preset":"grotesk","palette":{"primary":"#A64B00","secondary":"#2C4A5E","background":"#F7F4ED","surface":"#FFFFFF","border":"#D9D3C5","text_primary":"#1C1B19","text_secondary":"#5A564D","success":"#2F6B3A","warning":"#8A5A00","error":"#B3261E"}}'::jsonb $$, 'K menyimpan tema valid');
select throws_ok($$ update public.classes set theme = '{"layout":"standard","font_preset":"comic","palette":{}}'::jsonb $$, '23514', null, 'tema dengan preset font tak dikenal ditolak DB');
select lives_ok($$ update public.classes set timezone = 'Asia/Makassar' $$, 'K mengubah zona waktu ke WITA');
select throws_ok($$ update public.classes set timezone = 'America/New_York' $$, '23514', null, 'zona waktu di luar tiga zona ditolak DB');
select lives_ok($$ select public.provision_member('00000000-0000-0000-0000-0000000000a3', 'Nana Baru', 'fx_n', (select id from public.roles where key = 'member')) $$, 'K provision anggota baru');
select is((select status::text from public.member_profile_v where username = 'fx_n'), 'invited', 'anggota baru berstatus invited');
select throws_ok($$ select public.provision_member('00000000-0000-0000-0000-0000000000a4', 'Orang Lain', 'fx_n', (select id from public.roles where key = 'member')) $$, '23505', null, 'username ganda ditolak (23505)');
select lives_ok($$ select public.update_member_identity('00000000-0000-0000-0000-0000000000a3', 'Nana Diganti', 'fx_n2') $$, 'K mengubah identitas anggota');
select throws_ok($$ select public.update_member_identity('00000000-0000-0000-0000-0000000000a3', 'Nana', 'fx_k') $$, '23505', null, 'ubah ke username yang sudah dipakai ditolak (23505)');
select throws_ok($$ update public.memberships set role_id = (select id from public.roles where key = 'member') where user_id = '00000000-0000-0000-0000-0000000000a1' $$, 'EC001', null, 'pengelola terakhir tidak bisa menurunkan dirinya');
select throws_ok($$ update public.memberships set status = 'inactive' where user_id = '00000000-0000-0000-0000-0000000000a1' $$, 'EC001', null, 'pengelola terakhir tidak bisa menonaktifkan dirinya');
select is(public.t_rows($$ select 1 from public.password_reset_requests where status = 'pending' $$)::int, 1, 'K melihat permintaan reset yang menunggu');
select is(public.t_rows($$ update public.password_reset_requests set status = 'issued' where email = 'm@example.test' $$)::int, 1, 'K menandai permintaan sebagai issued');
select ok((select issued_at is not null from public.password_reset_requests where email = 'm@example.test'), 'issued_at terisi otomatis oleh trigger');
select throws_ok($$ update public.password_reset_requests set status = 'pending' where email = 'm@example.test' $$, 'EC021', null, 'permintaan issued tidak bisa kembali pending');
select throws_ok($$ update public.password_reset_requests set email = 'lain@example.test' $$, '42501', null, 'email permintaan tidak bisa diubah (tanpa grant)');
select throws_ok($$ insert into public.password_reset_requests (class_id, email) values (current_setting('tap.class_id')::uuid, 'x@example.test') $$, '42501', null, 'K tidak bisa insert langsung (hanya service role)');

-- ===== Anggota undangan N: aktivasi ==========================================
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true); end $$;
select lives_ok($$ select public.activate_my_membership() $$, 'N mengaktifkan keanggotaan');
select is((select status::text from public.get_viewer_context()), 'active', 'status N menjadi active');
select throws_ok($$ select public.activate_my_membership() $$, 'EC020', null, 'aktivasi kedua ditolak (EC020)');

-- ===== Anonim ================================================================
do $$ begin perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{}', true); end $$;
select throws_ok($$ insert into public.password_reset_requests (class_id, email) values (current_setting('tap.class_id')::uuid, 'y@example.test') $$, '42501', null, 'anon tidak bisa insert antrean reset');
select throws_ok($$ select * from public.password_reset_requests $$, '42501', null, 'anon tidak bisa membaca antrean reset');

select * from finish();
rollback;
