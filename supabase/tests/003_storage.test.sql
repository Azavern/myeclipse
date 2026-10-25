-- pgTAP 003: policy Storage (blueprint §13.3, AC-VIS-12, AC-STORAGE).
-- Prinsip yang diuji: visibilitas objek = visibilitas baris yang mereferensikannya; tulis/hapus dibatasi folder + permission.
-- Lulus 40/40 pada proyek Supabase asli (PostgreSQL 17.11, pgTAP 1.3.3) dengan data instance dinetralkan di dalam transaksi.
begin;
-- Supabase Storage memasang trigger storage.protect_objects_delete yang menolak
-- setiap DELETE langsung dari SQL. Storage API sendiri membuka gerbang itu lewat
-- GUC di bawah; tanpa ini seluruh berkas berhenti di DELETE pertama. Nilainya
-- lokal transaksi dan hanya mematikan pengaman "hapus tidak sengaja" — GRANT dan
-- policy DELETE yang justru diuji di sini tetap berlaku.
select set_config('storage.allow_delete_query', 'true', true);
select plan(40);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

-- Nama objek yang terlihat oleh peran saat ini (RLS berlaku karena fungsi berjalan sebagai pemanggil),
-- tanpa awalan id kelas dan dengan uuid M1 disingkat agar mudah dibaca.
create function public.t_names(b text) returns text[] language sql stable as $$
  select coalesce(array_agg(replace(replace(name, current_setting('tap.class_id') || '/', ''),
                                    '00000000-0000-0000-0000-0000000000b1', 'M1') order by name), '{}'::text[])
    from storage.objects where bucket_id = b $$;
grant execute on function public.t_names(text) to public;

-- Fixture: K = Ketua, M1 = pemilik konten, M2 = anggota lain, I = undangan yang belum aktif.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b0', 'k@example.test'), ('00000000-0000-0000-0000-0000000000b1', 'm1@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'm2@example.test'), ('00000000-0000-0000-0000-0000000000b3', 'i@example.test');
insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, u.st::public.membership_status, case when u.st = 'active' then now() end
  from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000b0'::uuid, 'ketua', 'active'), ('00000000-0000-0000-0000-0000000000b1'::uuid, 'member', 'active'),
               ('00000000-0000-0000-0000-0000000000b2'::uuid, 'member', 'active'), ('00000000-0000-0000-0000-0000000000b3'::uuid, 'member', 'invited')) u(id, rk, st) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;
insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values ('00000000-0000-0000-0000-0000000000b0'::uuid, 'fx_k', 'Ketua Fixture'), ('00000000-0000-0000-0000-0000000000b1'::uuid, 'fx_m1', 'Member Satu'),
               ('00000000-0000-0000-0000-0000000000b2'::uuid, 'fx_m2', 'Member Dua'), ('00000000-0000-0000-0000-0000000000b3'::uuid, 'fx_i', 'Undangan')) u(id, un, fn) on true;
select set_config('tap.class_id', (select id::text from public.classes), false);

-- Objek + baris yang mereferensikannya (superuser, melewati RLS).
update public.classes set logo_path = current_setting('tap.class_id') || '/logo/l.webp', cover_path = current_setting('tap.class_id') || '/cover/c.webp';
insert into public.events (class_id, title, start_at, end_at, cover_path)
select id, '[fixture] event', now() + interval '1 day', now() + interval '1 day 2 hours', id::text || '/events/e.webp' from public.classes;
update public.member_profiles set avatar_path = current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b1/avatar/a.webp'
 where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into public.portfolio_items (class_id, user_id, kind, title, occurred_on, media_path, visibility)
select c.id, '00000000-0000-0000-0000-0000000000b1', 'project', t.title, current_date, c.id::text || '/00000000-0000-0000-0000-0000000000b1/portfolio/' || t.f, t.v::public.visibility_audience
  from public.classes c join (values ('[fixture] biasa', 'p.webp', null), ('[fixture] privat', 'self.webp', 'self')) t(title, f, v) on true;
insert into storage.objects (bucket_id, name)
select 'class-media', c.id::text || '/' || f from public.classes c
  cross join unnest(array['logo/l.webp', 'cover/c.webp', 'events/e.webp', 'events/orphan.webp']) f;
insert into storage.objects (bucket_id, name)
select 'member-media', c.id::text || '/00000000-0000-0000-0000-0000000000b1/' || f from public.classes c
  cross join unnest(array['avatar/a.webp', 'avatar/orphan.webp', 'portfolio/p.webp', 'portfolio/self.webp']) f;

-- ===== Konfigurasi bucket (superuser) =======================================
select is((select count(*) from storage.buckets where id in ('class-media', 'member-media') and public = false)::int, 2, 'kedua bucket private');
select is((select count(*) from storage.buckets where id in ('class-media', 'member-media') and file_size_limit = 2097152
            and cardinality(allowed_mime_types) = 3 and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp'])::int, 2,
  'batas 2 MiB dan hanya JPEG/PNG/WebP di kedua bucket');

-- ===== Anonim ===============================================================
do $$ begin perform set_config('role', 'anon', true); perform set_config('request.jwt.claims', '{}', true); end $$;
select is(public.t_names('class-media'), array['cover/c.webp', 'logo/l.webp'], 'anon: hanya logo dan sampul publik; cover event (page.events = class_member) tertutup');
select is(public.t_names('member-media'), '{}'::text[], 'anon: tidak ada media anggota (avatar dan portofolio = class_member)');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', current_setting('tap.class_id') || '/logo/anon.webp') $$, '42501', null, 'anon tidak bisa mengunggah ke class-media');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b1/avatar/anon.webp') $$, '42501', null, 'anon tidak bisa mengunggah ke member-media');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'class-media' $$)::int, 0, 'anon tidak bisa menghapus objek');

-- ===== Undangan yang belum aktif (JWT valid, bukan anggota aktif) ===========
reset role;
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true); end $$;
select is(public.t_names('class-media'), array['cover/c.webp', 'logo/l.webp'], 'undangan: sama seperti anonim (konten class_member tertutup)');
select is(public.t_names('member-media'), '{}'::text[], 'undangan: tidak melihat media anggota');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b3/avatar/x.webp') $$, '42501', null, 'undangan belum aktif tidak bisa mengunggah avatar');

-- ===== Anggota biasa M2 =====================================================
reset role;
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true); end $$;
select is(public.t_names('class-media'), array['cover/c.webp', 'events/e.webp', 'logo/l.webp'], 'M2: melihat cover event yang terlihat; objek tak direferensikan tidak terlihat');
select is(public.t_names('member-media'), array['M1/avatar/a.webp', 'M1/portfolio/p.webp'], 'M2: avatar dan portofolio biasa M1; item self dan objek yatim tertutup');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', current_setting('tap.class_id') || '/logo/m2.webp') $$, '42501', null, 'M2 tidak bisa mengganti logo');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', current_setting('tap.class_id') || '/events/m2.webp') $$, '42501', null, 'M2 tidak bisa mengunggah cover event');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b2/avatar/new.webp') $$, 'M2 mengunggah avatar ke folder sendiri');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b1/avatar/m2.webp') $$, '42501', null, 'M2 tidak bisa menulis ke folder M1');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b2/lainnya/x.webp') $$, '42501', null, 'subfolder selain avatar/portfolio ditolak');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', '11111111-1111-1111-1111-111111111111/00000000-0000-0000-0000-0000000000b2/avatar/x.webp') $$, '42501', null, 'folder kelas lain ditolak');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'member-media' and name like '%b1/avatar/a.webp' $$)::int, 0, 'M2 tidak bisa menghapus avatar M1');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'class-media' and name like '%/logo/l.webp' $$)::int, 0, 'M2 tidak bisa menghapus logo');
select is(public.t_rows($$ update storage.objects set name = name || 'x' where bucket_id = 'member-media' $$)::int, 0, 'tidak ada policy UPDATE: rename objek ditolak');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'member-media' and name like '%b2/avatar/new.webp' $$)::int, 1, 'M2 menghapus objeknya sendiri');

-- ===== Ketua K ==============================================================
reset role;
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true); end $$;
select is(public.t_names('member-media'), array['M1/avatar/a.webp', 'M1/portfolio/p.webp'], 'K: tidak menembus item self dan tidak melihat objek yatim milik anggota (D-18)');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', current_setting('tap.class_id') || '/logo/new.webp') $$, 'K mengunggah logo');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', current_setting('tap.class_id') || '/events/new.webp') $$, 'K mengunggah cover event');
select is(public.t_names('class-media'), array['cover/c.webp', 'events/e.webp', 'events/new.webp', 'events/orphan.webp', 'logo/l.webp', 'logo/new.webp'], 'K: melihat semua objek di folder yang ia kelola, termasuk yang belum direferensikan');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', '11111111-1111-1111-1111-111111111111/logo/x.webp') $$, '42501', null, 'K tidak bisa menulis ke folder kelas lain');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('class-media', current_setting('tap.class_id') || '/lainnya/x.webp') $$, '42501', null, 'K tidak bisa menulis ke subfolder tak dikenal');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b1/avatar/k.webp') $$, '42501', null, 'K tidak bisa menulis ke folder anggota');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'member-media' and name like '%b1/portfolio/p.webp' $$)::int, 0, 'K tidak bisa menghapus media anggota');
-- Alur penggantian gambar (lib/storage/swap.ts): baris sudah tidak menunjuk objek lama, lalu objek lama dihapus lewat JWT pengguna.
update public.classes set logo_path = current_setting('tap.class_id') || '/logo/new.webp';
update public.events set cover_path = null where cover_path like '%/events/e.webp';
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'class-media' and name like '%/logo/l.webp' $$)::int, 1, 'K menghapus logo lama setelah baris diganti (pembersihan tidak boleh gagal diam-diam)');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'class-media' and name like '%/events/e.webp' $$)::int, 1, 'K menghapus cover event lama setelah referensi dilepas');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'class-media' and name like '%/events/orphan.webp' $$)::int, 1, 'K membersihkan objek yatim di folder yang ia kelola');

-- ===== Pemilik M1 ===========================================================
reset role;
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true); end $$;
select is(public.t_names('member-media'), array['M1/avatar/a.webp', 'M1/avatar/orphan.webp', 'M1/portfolio/p.webp', 'M1/portfolio/self.webp'], 'M1: melihat semua objek di folder sendiri, termasuk self dan yatim');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'member-media' and name like '%b1/avatar/orphan.webp' $$)::int, 1, 'M1 menghapus objek yatim miliknya');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('member-media', current_setting('tap.class_id') || '/00000000-0000-0000-0000-0000000000b1/portfolio/baru.webp') $$, 'M1 mengunggah media portofolio');

-- ===== Langit-langit page: Ketua mempersempit page.members ==================
reset role;
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true); end $$;
select lives_ok($$ insert into public.visibility_rules (class_id, key, owner_id, audience) values (current_setting('tap.class_id')::uuid, 'page.members', null, 'class_admin') $$, 'K mempersempit page.members menjadi class_admin');
select is(public.t_names('member-media'), array['M1/avatar/a.webp', 'M1/portfolio/p.webp'], 'K tetap melihat media anggota yang bukan self setelah page dipersempit');
reset role;
do $$ begin perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true); end $$;
select is(public.t_names('member-media'), '{}'::text[], 'M2 kehilangan akses ke media anggota segera setelah page dipersempit (tanpa deploy)');
select is(public.t_names('class-media'), array['cover/c.webp', 'logo/new.webp'], 'M2: sampul dan logo baru terlihat; objek lama yang sudah dihapus tidak ada');

select * from finish();
rollback;
