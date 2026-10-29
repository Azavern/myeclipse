-- pgTAP 007: inventory pribadi dan inv_key (migrasi 0017–0018).
--
-- Empat akun dipasang deterministik: dua pemilik inventory, satu anggota aktif
-- lain, dan satu anggota nonaktif. Kuota key diuji sebagai 12 key AKTIF
-- bersamaan: key dicabut dan kedaluwarsa tidak menempati slot. Semua perubahan
-- di-rollback di akhir berkas.
begin;
select plan(45);

alter table public.memberships disable trigger user;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'invd1@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'invd2@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'invd3@example.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'invd4@example.test');

update public.memberships set role_id = (select id from public.roles where key = 'member');

insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, u.st::public.membership_status, now()
  from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000d1'::uuid, 'active'),
    ('00000000-0000-0000-0000-0000000000d2'::uuid, 'active'),
    ('00000000-0000-0000-0000-0000000000d3'::uuid, 'inactive'),
    ('00000000-0000-0000-0000-0000000000d4'::uuid, 'active')
  ) u(id, st) on true
  join public.roles r on r.class_id = c.id and r.key = 'member';

insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000d1'::uuid, 'inv_d1', 'Pemilik Inventory'),
    ('00000000-0000-0000-0000-0000000000d2'::uuid, 'inv_d2', 'Anggota Aktif'),
    ('00000000-0000-0000-0000-0000000000d3'::uuid, 'inv_d3', 'Anggota Nonaktif'),
    ('00000000-0000-0000-0000-0000000000d4'::uuid, 'inv_d4', 'Pemilik Kedua')
  ) u(id, un, fn) on true;

alter table public.memberships enable trigger user;

select set_config('tap.owner', '00000000-0000-0000-0000-0000000000d1', false);
select set_config('tap.other', '00000000-0000-0000-0000-0000000000d2', false);
select set_config('tap.inactive', '00000000-0000-0000-0000-0000000000d3', false);
select set_config('tap.owner2', '00000000-0000-0000-0000-0000000000d4', false);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

-- ===== Pemilik membuat key ====================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;

select set_config('tap.k1', id::text, false), set_config('tap.k1tok', token, false)
  from public.create_inventory_key(null, '7d');

select is(length(current_setting('tap.k1tok')), 16,
  'key acak memiliki panjang tetap 16');
select matches(current_setting('tap.k1tok'), '^[A-Z0-9]{16}$',
  'key acak hanya memakai huruf dan angka');
select is((select k.ttl from public.inventory_keys k where k.id = current_setting('tap.k1')::uuid),
  '7d', 'masa aktif key tercatat');
select ok((select k.expires_at between now() + interval '6 days' and now() + interval '8 days'
             from public.inventory_keys k where k.id = current_setting('tap.k1')::uuid),
  'masa aktif 7 hari dihitung dari sekarang');

select set_config('tap.k2', id::text, false), set_config('tap.k2tok', token, false)
  from public.create_inventory_key('customkey1234567', '24h');

select is(current_setting('tap.k2tok'), 'CUSTOMKEY1234567',
  'key custom huruf kecil disimpan sebagai kapital');
select ok((select k.expires_at between now() + interval '23 hours' and now() + interval '25 hours'
             from public.inventory_keys k where k.id = current_setting('tap.k2')::uuid),
  'key custom memakai masa aktif 24 jam');

select set_config('tap.k3', id::text, false)
  from public.create_inventory_key('INVENTORYKEY0001', 'never');
select ok((select k.expires_at is null from public.inventory_keys k
            where k.id = current_setting('tap.k3')::uuid),
  'key tanpa kedaluwarsa tidak punya expires_at');

select throws_ok($$ select public.create_inventory_key('SHORT', '7d') $$,
  'EC072', null, 'key kurang dari 16 karakter ditolak');
select throws_ok($$ select public.create_inventory_key('CUSTOMKEY12345!X', '7d') $$,
  'EC072', null, 'key dengan simbol di luar aturan ditolak');
select throws_ok($$ select public.create_inventory_key('CUSTOMKEY1234567', '7d') $$,
  '23505', null, 'key yang sudah dipakai ditolak');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true); end $$;
select throws_ok($$ select public.create_inventory_key(null, '7d') $$,
  '42501', null, 'anggota nonaktif tidak bisa membuat key');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;

-- ===== Batas 12 key aktif bersamaan ===========================================
do $$ declare i int; v_id uuid; begin
  for i in 1..9 loop
    select k.id into v_id from public.create_inventory_key(null, 'never') k;
  end loop;
  perform set_config('tap.k9', v_id::text, false);
end $$;
select is((select count(*) from public.inventory_keys k
            where k.owner_id = current_setting('tap.owner')::uuid)::int, 12,
  'pemilik menyimpan 12 baris key');
select is((select count(*) from public.inventory_keys k
            where k.owner_id = current_setting('tap.owner')::uuid
              and k.revoked_at is null
              and (k.expires_at is null or k.expires_at > now()))::int, 12,
  'kedua belas key sedang aktif');
select throws_ok($$ select public.create_inventory_key(null, '7d') $$,
  'EC070', null, 'key aktif ke-13 ditolak');

select lives_ok($$ select public.revoke_inventory_key(current_setting('tap.k1')::uuid) $$,
  'pemilik bisa mencabut key kapan saja');
select ok((select k.revoked_at is not null from public.inventory_keys k
            where k.id = current_setting('tap.k1')::uuid),
  'waktu pencabutan tercatat');
select lives_ok($$ select public.create_inventory_key('REPLACEMENT00001', '7d') $$,
  'mencabut key mengosongkan satu slot aktif');
select is((select count(*) from public.inventory_keys k
            where k.owner_id = current_setting('tap.owner')::uuid)::int, 13,
  'key lama tetap tersimpan sebagai riwayat');
select is((select count(*) from public.inventory_keys k
            where k.owner_id = current_setting('tap.owner')::uuid
              and k.revoked_at is null
              and (k.expires_at is null or k.expires_at > now()))::int, 12,
  'jumlah key aktif kembali 12, bukan 13');
select throws_ok($$ select public.create_inventory_key(null, '7d') $$,
  'EC070', null, 'slot aktif yang penuh tetap menolak key baru');

-- Key kedaluwarsa juga tidak menempati slot. Sisipkan langsung sebagai postgres
-- supaya tidak mengubah hitungan RPC, lalu cabut satu key aktif dan buat baru.
reset role;
insert into public.inventory_keys (class_id, owner_id, token, ttl, expires_at)
select m.class_id, m.user_id, 'EXPIREDKEY000001', '24h', now() - interval '1 hour'
  from public.memberships m where m.user_id = current_setting('tap.owner')::uuid;

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
select lives_ok($$ select public.revoke_inventory_key(current_setting('tap.k9')::uuid) $$,
  'key aktif lain dicabut untuk mengosongkan slot');
select lives_ok($$ select public.create_inventory_key('AFTEREXPIRED0001', 'never') $$,
  'key kedaluwarsa tidak dihitung sehingga key baru diterima');
select is((select count(*) from public.inventory_keys k
            where k.owner_id = current_setting('tap.owner')::uuid
              and k.revoked_at is null
              and (k.expires_at is null or k.expires_at > now()))::int, 12,
  'tetap hanya 12 key aktif setelah key pengganti');

-- ===== RLS key milik sendiri ==================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true); end $$;
select is((select count(*) from public.inventory_keys)::int, 0,
  'anggota lain tidak melihat key milik orang lain');
select set_config('tap.k4', id::text, false)
  from public.create_inventory_key('OTHEROWNER000001', 'never');
select is((select count(*) from public.inventory_keys)::int, 1,
  'pemilik kedua hanya melihat key miliknya');

select throws_ok($$ insert into public.inventory_keys (class_id, owner_id, token, ttl, expires_at)
  select class_id, owner_id, 'DIRECTINSERT0001', 'never', null
  from public.inventory_keys limit 1 $$,
  '42501', null, 'key tidak bisa ditulis langsung lewat PostgREST');
select throws_ok($$ update public.inventory_keys set revoked_at = now() $$,
  '42501', null, 'key tidak bisa diubah langsung lewat PostgREST');

-- ===== Item inventory =========================================================
do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
select lives_ok($$ insert into public.inventory_items (class_id, owner_id, url)
  select class_id, owner_id, 'https://example.test/a'
  from public.inventory_keys where id = current_setting('tap.k1')::uuid $$,
  'pemilik menambah tautan https');
select throws_ok($$ insert into public.inventory_items (class_id, owner_id, url)
  select class_id, owner_id, 'http://example.test/b'
  from public.inventory_keys where id = current_setting('tap.k1')::uuid $$,
  '23514', null, 'tautan yang tidak diawali https ditolak');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true); end $$;
select throws_ok($$ insert into public.inventory_items (class_id, owner_id, url)
  values ((select class_id from public.inventory_keys limit 1),
          current_setting('tap.owner')::uuid, 'https://example.test/c') $$,
  '42501', null, 'anggota lain tidak bisa menambah item ke inventory orang lain');
select is((select count(*) from public.inventory_items)::int, 0,
  'anggota lain tidak melihat item inventory orang lain');
select is(public.t_rows($$ delete from public.inventory_items
  where owner_id = current_setting('tap.owner')::uuid $$)::int, 0,
  'anggota lain tidak bisa menghapus item inventory orang lain');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true); end $$;
select is((select count(*) from public.inventory_items)::int, 1,
  'item pemilik tetap ada setelah percobaan anggota lain');

-- ===== Halaman akses publik ===================================================
do $$ begin perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;
select is((select count(*) from public.get_inventory_by_key('customkey1234567'))::int, 1,
  'key custom yang diketik huruf kecil membuka inventory');
select is((select item_count from public.get_inventory_by_key('CUSTOMKEY1234567')),
  1, 'jumlah item ikut dikembalikan');
select is((select url from public.get_inventory_by_key('CUSTOMKEY1234567')),
  'https://example.test/a', 'tautan inventory dikembalikan apa adanya');
select ok((select owner_name is null from public.get_inventory_by_key('CUSTOMKEY1234567')),
  'nama pemilik tidak bocor ke anonim saat halaman Anggota tertutup');

do $$ begin perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true); end $$;
select is((select owner_name from public.get_inventory_by_key('CUSTOMKEY1234567')),
  'Pemilik Inventory', 'anggota aktif melihat nama pemilik');

select is((select count(*) from public.get_inventory_by_key(current_setting('tap.k1tok')))::int,
  0, 'key yang dicabut tidak membuka inventory');
select is((select count(*) from public.get_inventory_by_key('INVENTORYKEY0001'))::int, 1,
  'key tanpa kedaluwarsa tetap membuka inventory');
select is((select item_count from public.get_inventory_by_key('OTHEROWNER000001')),
  0, 'key pemilik kedua tidak menampilkan item pemilik lain');
select is((select count(*) from public.get_inventory_by_key('EXPIREDKEY000001'))::int,
  0, 'key kedaluwarsa tidak membuka inventory');

reset role;
insert into public.inventory_keys (class_id, owner_id, token, ttl, expires_at)
select m.class_id, m.user_id, 'INACTIVEOWNER001', 'never', null
  from public.memberships m where m.user_id = current_setting('tap.inactive')::uuid;

select is((select count(*) from public.get_inventory_by_key('INACTIVEOWNER001'))::int,
  0, 'key milik anggota nonaktif tidak membuka inventory');
select is((select count(*) from public.get_inventory_by_key('SHORT'))::int,
  0, 'key dengan format salah tidak membuka inventory');

do $$ begin perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;
select throws_ok($$ select count(*) from public.inventory_items $$,
  '42501', null, 'tabel item tidak bisa dibaca langsung oleh anonim');

select * from finish();
rollback;
