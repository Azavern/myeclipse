-- pgTAP 010: Library media (migrasi 0029).
-- Prinsip yang diuji: pemilik penuh atas itemnya, anggota lain hanya membaca
-- sesuai visibilitas (private/all/specific), dan daftar penerima hanya ditulis
-- lewat RPC.
begin;
select plan(13);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

-- Fixture: A pemilik, B anggota penerima, C anggota lain.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'lib-a@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'lib-b@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'lib-c@example.test');
insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, 'active', now()
  from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000d1'::uuid),
               ('00000000-0000-0000-0000-0000000000d2'::uuid),
               ('00000000-0000-0000-0000-0000000000d3'::uuid)) u(id) on true
  join public.roles r on r.class_id = c.id and r.key = 'member';
insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000d1'::uuid, 'lib_a', 'Pemilik A'),
               ('00000000-0000-0000-0000-0000000000d2'::uuid, 'lib_b', 'Penerima B'),
               ('00000000-0000-0000-0000-0000000000d3'::uuid, 'lib_c', 'Anggota C')) u(id, un, fn) on true;

select set_config('tap.class_id', (select id::text from public.classes), false);

-- ===== Pemilik A =============================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
-- `returning id` meniru `.insert(...).select('id')` PostgREST: baris baru harus
-- terlihat oleh policy SELECT dalam statement yang sama (regresi migrasi 0030).
select lives_ok($$ insert into public.library_items (class_id, owner_id, title, storage_path, mime_type, size_bytes)
  values (current_setting('tap.class_id')::uuid, '00000000-0000-0000-0000-0000000000d1', 'Foto A',
          current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000d1/library/a.webp', 'image/webp', 1024)
  returning id $$,
  'pemilik menyimpan item Library dan menerima id-nya');
select set_config('tap.item_id', (select id::text from public.library_items), false);
select is((select count(*) from public.library_items)::int, 1, 'pemilik melihat itemnya');
select is((select count(*) from public.library_item_access)::int, 0, 'item baru belum dibagikan ke siapa pun');

-- ===== Anggota lain B: item masih privat =====================================
reset role;
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true); end $$;
select is((select count(*) from public.library_items)::int, 0, 'anggota lain tidak melihat item privat');
select is(public.t_rows($$ update public.library_items set title = 'dibajak' $$)::int, 0, 'anggota lain tidak bisa mengubah item');
select is(public.t_rows($$ delete from public.library_items $$)::int, 0, 'anggota lain tidak bisa menghapus item');

-- ===== A membagikan ke semua anggota ========================================
reset role;
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
select lives_ok($$ select public.set_library_visibility(array[current_setting('tap.item_id')::uuid], 'all') $$,
  'pemilik membagikan item ke semua anggota');

reset role;
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true); end $$;
select is((select count(*) from public.library_items)::int, 1, 'anggota aktif melihat item yang dibagikan ke semua');

-- ===== A membatasi ke B saja ================================================
reset role;
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
select lives_ok($$ select public.set_library_visibility(array[current_setting('tap.item_id')::uuid], 'specific',
  array['00000000-0000-0000-0000-0000000000d2'::uuid]) $$, 'pemilik membatasi item ke anggota tertentu');
select throws_ok($$ insert into public.library_item_access (item_id, class_id, user_id)
  values (current_setting('tap.item_id')::uuid, current_setting('tap.class_id')::uuid,
          '00000000-0000-0000-0000-0000000000d1') $$, '42501', null,
  'penerima hanya ditulis lewat RPC');

reset role;
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true); end $$;
select is((select count(*) from public.library_items)::int, 0, 'anggota di luar daftar tidak melihat item spesifik');

reset role;
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true); end $$;
select throws_ok($$ select public.set_library_visibility(array[current_setting('tap.item_id')::uuid], 'all') $$,
  '42501', null, 'bukan pemilik tidak bisa mengubah visibilitas');

select is((select count(*) from public.library_items)::int, 1, 'penerima spesifik tetap melihat item setelah percobaan ditolak');

select * from finish();
rollback;
