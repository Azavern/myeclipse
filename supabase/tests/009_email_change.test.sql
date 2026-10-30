-- pgTAP 009: tabel OTP perubahan email (migrasi 0020).
-- Tabel ini hanya boleh disentuh service role; peramban tidak punya grant
-- maupun policy. Bentuk data yang salah ditolak constraint.
begin;
select plan(6);

select ok((select relrowsecurity from pg_class where oid = 'public.email_change_requests'::regclass),
  'RLS aktif di email_change_requests');
select ok(not has_table_privilege('anon', 'public.email_change_requests', 'SELECT'),
  'anon tidak punya grant select');
select ok(not has_table_privilege('authenticated', 'public.email_change_requests', 'SELECT'),
  'authenticated tidak punya grant select');
select ok(not has_table_privilege('authenticated', 'public.email_change_requests', 'INSERT'),
  'authenticated tidak punya grant insert');

-- CHECK dievaluasi sebelum trigger foreign key, jadi pelanggaran bentuk data
-- terlihat sebagai 23514 meski user_id belum tentu ada.
select throws_ok($$ insert into public.email_change_requests (user_id, new_email, otp_hash, expires_at)
  values ('00000000-0000-0000-0000-0000000000e1', 'Bukan@Email.com', repeat('a', 64), now() + interval '5 minutes') $$,
  '23514', null, 'email harus huruf kecil');

select throws_ok($$ insert into public.email_change_requests (user_id, new_email, otp_hash, expires_at)
  values ('00000000-0000-0000-0000-0000000000e1', 'baru@email.com', 'bukan-hash', now() + interval '5 minutes') $$,
  '23514', null, 'otp_hash harus hex 64 karakter');

select * from finish();
rollback;
