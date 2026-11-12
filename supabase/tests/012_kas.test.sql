-- pgTAP 012: Kas Kelas (migrasi 0034).
-- Fokus: batas baca anggota/Ketua/Bendahara, alur pengajuan → verifikasi,
-- pencatatan sekali, pembatalan transaksi, dan policy media privat.
begin;
select plan(55);
select set_config('storage.allow_delete_query', 'true', true);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'kas_ketua@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'kas_bendahara@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'kas_m1@example.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'kas_m2@example.test');

insert into public.memberships (class_id, user_id, role_id, status, joined_at)
select c.id, u.id, r.id, 'active', now()
  from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 'ketua'),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 'bendahara'),
    ('00000000-0000-0000-0000-0000000000c3'::uuid, 'member'),
    ('00000000-0000-0000-0000-0000000000c4'::uuid, 'member')
  ) u(id, rk) on true
  join public.roles r on r.class_id = c.id and r.key = u.rk;

insert into public.member_profiles (class_id, user_id, username, full_name)
select c.id, u.id, u.un, u.fn from public.classes c
  join (values
    ('00000000-0000-0000-0000-0000000000c1'::uuid, 'kas_ketua', 'Ketua Kas'),
    ('00000000-0000-0000-0000-0000000000c2'::uuid, 'kas_bendahara', 'Bendahara Kas'),
    ('00000000-0000-0000-0000-0000000000c3'::uuid, 'kas_m1', 'Anggota Kas Satu'),
    ('00000000-0000-0000-0000-0000000000c4'::uuid, 'kas_m2', 'Anggota Kas Dua')
  ) u(id, un, fn) on true;

select set_config('tap.class_id', (select id::text from public.classes), false);
update public.roles set permissions = array['kas.manage'] where key = 'bendahara';

create function public.t_kas_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end $$;
grant execute on function public.t_kas_as(uuid) to public;

-- ===== Katalog dan akses =====================================================
select is((select widest_audience::text from public.visibility_catalog where key = 'page.kas'),
  'class_member', 'page.kas dibatasi sampai anggota kelas');
select is((select default_audience::text from public.visibility_catalog where key = 'page.kas'),
  'class_member', 'page.kas tertutup untuk tamu secara bawaan');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select is((select can_manage from public.get_kas_access()), false,
  'anggota biasa bukan pengelola kas');
select is((select can_read_all from public.get_kas_access()), false,
  'anggota biasa tidak boleh membaca status anggota lain');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c2');
select is((select can_manage from public.get_kas_access()), true,
  'Bendahara adalah pengelola kas');
select is((select can_read_all from public.get_kas_access()), true,
  'Bendahara boleh membaca semua bukti dan status');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select is((select can_manage from public.get_kas_access()), false,
  'Ketua tidak otomatis menjadi pengelola kas');
select is((select can_read_all from public.get_kas_access()), true,
  'Ketua tetap boleh membaca semua yang dikelola Bendahara');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select throws_ok($$ select public.create_kas_bill('Bukan hak', 50000, current_date + 7, null) $$,
  '42501', null, 'anggota biasa tidak bisa membuat tagihan');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select public.create_kas_bill('Iuran Uji', 50000, current_date + 7,
  array['00000000-0000-0000-0000-0000000000c3']::uuid[]) $$,
  'Bendahara membuat tagihan untuk satu anggota');
select set_config('tap.bill', (select id::text from public.kas_bills order by created_at desc limit 1), false);
select set_config('tap.bm1', (select id::text from public.kas_bill_members
  where bill_id = current_setting('tap.bill')::uuid), false);

select is((select count(*) from public.kas_bill_members
  where bill_id = current_setting('tap.bill')::uuid)::int, 1,
  'tagihan hanya mengenakan penerima yang dipilih');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select is((select count(*) from public.kas_bill_members
  where bill_id = current_setting('tap.bill')::uuid)::int, 1,
  'anggota melihat iurannya sendiri');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c4');
select is((select count(*) from public.kas_bill_members
  where bill_id = current_setting('tap.bill')::uuid)::int, 0,
  'anggota lain tidak melihat status iuran orang lain');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from public.kas_bill_members
  where bill_id = current_setting('tap.bill')::uuid)::int, 1,
  'Ketua melihat status penerima tagihan');

-- ===== Pengajuan dan verifikasi =============================================
select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select throws_ok($$ select public.submit_kas_deposit(25000, 'belum ada qris', null) $$,
  'EC108', null, 'setoran QRIS ditolak sebelum QRIS tersedia');
select lives_ok($$ select public.submit_kas_bill_payment(
  current_setting('tap.bm1')::uuid, 50000, 'transfer', 'transfer bank', null) $$,
  'anggota mengajukan pembayaran');
select is((select status::text from public.kas_bill_members
  where id = current_setting('tap.bm1')::uuid), 'pending',
  'status iuran menjadi menunggu verifikasi');
select is((select count(*) from public.kas_transactions)::int, 0,
  'pengajuan belum menambah transaksi');
select is((select balance from public.get_kas_summary()), 0::bigint,
  'pengajuan belum menambah saldo');

select throws_ok($$ select public.submit_kas_bill_payment(
  current_setting('tap.bm1')::uuid, 50000, 'transfer', 'lagi', null) $$,
  'EC103', null, 'pengajuan kedua saat masih menunggu ditolak');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select throws_ok($$ select public.review_kas_submission(
  (select id from public.kas_submissions where bill_member_id = current_setting('tap.bm1')::uuid), true, null) $$,
  '42501', null, 'Ketua tanpa izin tidak bisa memverifikasi');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select public.review_kas_submission(
  (select id from public.kas_submissions where bill_member_id = current_setting('tap.bm1')::uuid),
  false, 'Bukti belum sesuai') $$, 'Bendahara menolak dengan alasan');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select is((select rejection_reason from public.kas_bill_members
  where id = current_setting('tap.bm1')::uuid), 'Bukti belum sesuai',
  'alasan penolakan terlihat oleh anggota yang bersangkutan');

select lives_ok($$ select public.submit_kas_bill_payment(
  current_setting('tap.bm1')::uuid, 50000, 'transfer', 'sudah diperbaiki', null) $$,
  'anggota boleh mengajukan lagi setelah ditolak');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select public.review_kas_submission(
  (select id from public.kas_submissions where bill_member_id = current_setting('tap.bm1')::uuid
    and status = 'pending'), true, null) $$, 'Bendahara menerima pengajuan');
select set_config('tap.tx', (select id::text from public.kas_transactions
  order by created_at desc limit 1), false);
select is((select status::text from public.kas_bill_members
  where id = current_setting('tap.bm1')::uuid), 'paid', 'iuran menjadi lunas');
select is((select count(*) from public.kas_transactions)::int, 1,
  'penerimaan membuat tepat satu transaksi');
select is((select amount from public.kas_transactions
  where id = current_setting('tap.tx')::uuid), 50000, 'nominal pemasukan sesuai tagihan');
select is((select balance from public.get_kas_summary()), 50000::bigint,
  'saldo bertambah setelah verifikasi');
select is((select status::text from public.kas_bills
  where id = current_setting('tap.bill')::uuid), 'closed', 'tagihan tertutup saat semua lunas');

select throws_ok($$ select public.review_kas_submission(
  (select id from public.kas_submissions where bill_member_id = current_setting('tap.bm1')::uuid
    and status = 'approved'), true, null) $$, 'EC104', null,
  'pengajuan yang sudah diputus tidak bisa diputus lagi');

-- ===== Pembatalan dan konsistensi ===========================================
select lives_ok($$ select public.cancel_kas_transaction(
  current_setting('tap.tx')::uuid, 'koreksi pencatatan') $$,
  'Bendahara membatalkan pemasukan iuran');
select is((select status::text from public.kas_bill_members
  where id = current_setting('tap.bm1')::uuid), 'unpaid', 'iuran kembali belum bayar');
select is((select status::text from public.kas_bills
  where id = current_setting('tap.bill')::uuid), 'open', 'tagihan dibuka kembali');
select is((select balance from public.get_kas_summary()), 0::bigint,
  'saldo kembali nol setelah pembatalan');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select throws_ok($$ update public.kas_bills set title = 'diubah anggota'
  where id = current_setting('tap.bill')::uuid $$, '42501', null,
  'anggota tidak bisa mengubah tagihan langsung');
select throws_ok($$ insert into public.kas_transactions
  (class_id, direction, amount, category, description, occurred_on, source)
  values (current_setting('tap.class_id')::uuid, 'income', 1, 'Lainnya', 'x', current_date, 'manual') $$,
  '42501', null, 'anggota tidak bisa menulis transaksi langsung');

-- ===== QRIS dan media privat =================================================
select public.t_kas_as('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select public.set_kas_qris(current_setting('tap.class_id') ||
  '/qris/00000000-0000-0000-0000-0000000000aa.webp') $$,
  'Bendahara menyimpan QRIS');
select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select is((select qris_path from public.kas_settings), current_setting('tap.class_id') ||
  '/qris/00000000-0000-0000-0000-0000000000aa.webp', 'anggota dapat membaca QRIS');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('kas-media', current_setting('tap.class_id') ||
    '/proofs/00000000-0000-0000-0000-0000000000c3/00000000-0000-0000-0000-0000000000ab.webp') $$,
  'anggota mengunggah bukti ke foldernya');
select is((select count(*) from storage.objects where bucket_id = 'kas-media')::int, 1,
  'pengunggah melihat buktinya');
select public.t_kas_as('00000000-0000-0000-0000-0000000000c4');
select is((select count(*) from storage.objects where bucket_id = 'kas-media')::int, 0,
  'anggota lain tidak melihat bukti');
select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from storage.objects where bucket_id = 'kas-media')::int, 1,
  'Ketua melihat bukti');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select lives_ok($$ select public.submit_kas_deposit(25000, 'setoran qris', null) $$,
  'anggota mengajukan setoran QRIS umum');
select is((select balance from public.get_kas_summary()), 0::bigint,
  'setoran QRIS belum menambah saldo');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c2');
select lives_ok($$ select public.review_kas_submission(
  (select id from public.kas_submissions where kind = 'deposit' and status = 'pending'
    order by submitted_at desc limit 1), true, null) $$, 'Bendahara menerima setoran QRIS');
select is((select balance from public.get_kas_summary()), 25000::bigint,
  'setoran QRIS menambah saldo setelah diterima');

-- ===== Tamu dan langit-langit halaman ========================================
reset role;
do $$ begin perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{}', true); end $$;
select throws_ok($$ select * from public.get_kas_summary() $$, '42501', null,
  'anon tidak bisa membaca ringkasan kas');

reset role;
select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select public.save_class_visibility(
  '[{"key":"page.kas","audience":"class_admin"}]'::jsonb) $$,
  'Ketua mempersempit halaman Kas');

reset role;
select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select throws_ok($$ select * from public.get_kas_summary() $$, '42501', null,
  'anggota kehilangan akses saat halaman dipersempit');
select is((select count(*) from public.kas_bill_members)::int, 0,
  'status iuran juga tertutup saat halaman dipersempit');

reset role;
select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ select public.save_class_visibility(
  '[{"key":"page.kas","audience":"class_member"}]'::jsonb) $$,
  'Ketua membuka kembali halaman Kas');
select public.t_kas_as('00000000-0000-0000-0000-0000000000c3');
select lives_ok($$ select * from public.get_kas_summary() $$,
  'anggota kembali dapat membaca ringkasan');
select throws_ok($$ select * from public.get_kas_members() $$, '42501', null,
  'anggota tidak bisa mengambil daftar anggota kas');

select public.t_kas_as('00000000-0000-0000-0000-0000000000c1');
select is((select count(*) from public.get_kas_members())::int, 4,
  'Ketua dapat mengambil daftar anggota kas');

select * from finish();
rollback;
