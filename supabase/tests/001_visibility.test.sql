-- pgTAP: anti-bypass dan resolver visibility (blueprint §7.7, §7.9). BELUM PERNAH DIJALANKAN — jalankan `supabase test db`.
begin;
select plan(18);

-- Fixture (sebagai superuser, di dalam transaksi). K = ketua, M = member.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'k@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'm@example.test');
insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, 'active', now()
  from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'ketua'), ('00000000-0000-0000-0000-0000000000a2'::uuid, 'member')) u(id, rk) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;
insert into public.member_profiles (class_id, user_id, username, full_name, nickname, bio)
select c.id, u.id, u.un, u.fn, 'Nick ' || u.un, 'Bio ' || u.un
  from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000a1'::uuid, 'fx_k', 'Ketua Fixture'), ('00000000-0000-0000-0000-0000000000a2'::uuid, 'fx_m', 'Member Fixture')) u(id, un, fn) on true;
insert into public.portfolio_items (class_id, user_id, title, occurred_on, visibility)
select c.id, '00000000-0000-0000-0000-0000000000a2', t.title, date '2026-01-01', t.v::public.visibility_audience
  from public.classes c join (values ('[fixture] inherit', null), ('[fixture] public', 'public'), ('[fixture] self', 'self')) t(title, v) on true;
insert into public.tasks (class_id, title, deadline, course)
select id, '[fixture] tugas', now() + interval '1 day', 'Matkul' from public.classes;
insert into public.events (class_id, title, start_at, end_at)
select id, '[fixture] event', now() + interval '1 day', now() + interval '2 day' from public.classes;

-- id kelas disimpan di GUC: role anggota tidak boleh membaca tabel classes (policy classes_select = class.manage)
select set_config('tap.class_id', (select id::text from public.classes), false);

-- Anonim, konfigurasi default ----------------------------------------------------
do $$ begin perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{}', true); end $$;
select throws_ok($$ select * from public.member_profiles $$, '42501', null, 'anon tidak boleh membaca tabel dasar profil');
select is((select count(*) from public.member_profile_v)::int, 0, 'anon tidak melihat anggota (page.members = class_member)');
select is((select name from public.class_identity_v), 'Eclipse', 'nama kelas terlihat anonim (identitas publik)');
select is((select count(*) from public.portfolio_items)::int, 0, 'anon tidak melihat portofolio');
select is((select count(*) from public.tasks)::int, 0, 'anon tidak melihat tugas');
select is((select count(*) from public.events)::int, 0, 'anon tidak melihat event');
select throws_ok($$ select * from public.class_activity $$, '42501', null, 'class_activity tertutup');

-- Member M ---------------------------------------------------------------------
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true); end $$;
select is((select count(*) from public.member_profile_v)::int, 2, 'anggota aktif melihat directory');
select is((select count(*) from public.portfolio_items where user_id = '00000000-0000-0000-0000-0000000000a2')::int, 3, 'pemilik melihat semua itemnya, termasuk self');
select throws_ok($$ insert into public.visibility_rules (class_id, key, owner_id, audience)
  values (current_setting('tap.class_id')::uuid, 'page.tasks', '00000000-0000-0000-0000-0000000000a2', 'class_member') $$,
  'EC012', null, 'aturan anggota pada key berscope kelas ditolak');
select lives_ok($$ select public.save_my_visibility('[{"key":"field.member.bio","audience":"public"}]'::jsonb) $$, 'M menyetel bio publik');

-- Ketua K ----------------------------------------------------------------------
do $$ begin perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
select is((select count(*) from public.portfolio_items where user_id = '00000000-0000-0000-0000-0000000000a2')::int, 2, 'Ketua tidak menembus item self (D-18)');
select is((select count(*) from public.member_profiles where user_id = '00000000-0000-0000-0000-0000000000a2')::int, 0, 'Ketua tidak punya jalur baca ke tabel dasar profil anggota');
select throws_ok($$ insert into public.visibility_rules (class_id, key, owner_id, audience)
  values (current_setting('tap.class_id')::uuid, 'page.tasks', null, 'public') $$, 'EC011', null, 'audience lebih luas dari widest ditolak');

-- E2/E3: bio publik tetap dibatasi ceiling page sampai Ketua membuka page.members -------
do $$ begin perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{}', true); end $$;
select is((select count(*) from public.member_profile_v)::int, 0, 'E2: bio publik tetap tertutup selama page.members = class_member');
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true); end $$;
select lives_ok($$ select public.save_class_visibility('[{"key":"page.members","audience":"public"}]'::jsonb) $$, 'Ketua membuka page.members');
do $$ begin perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{}', true); end $$;
select is((select bio from public.member_profile_v where username = 'fx_m'), 'Bio fx_m', 'E3: bio publik M terlihat anonim');
select is((select nickname from public.member_profile_v where username = 'fx_m'), null, 'E3: nickname M (default class_member) tidak terlihat anonim');

select * from finish();
rollback;
