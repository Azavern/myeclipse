-- pgTAP 008: bucket publik QR Studio (migrasi 0019).
-- Bucket boleh dibaca lewat URL objek, tetapi tidak boleh didaftar, ditulis,
-- atau dihapus oleh anon/authenticated. Penulisan hanya lewat service role di
-- server; pembersihan 6 jam memakai Storage API yang sama.
begin;
select set_config('storage.allow_delete_query', 'true', true);
select plan(4);

create function public.t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
grant execute on function public.t_rows(text) to public;

select ok((select b.public and b.file_size_limit = 4194304
                  and b.allowed_mime_types = array['image/png']::text[]
             from storage.buckets b where b.id = 'qr-shares'),
  'qr-shares publik, maksimal 4 MB, hanya PNG');

insert into storage.objects (bucket_id, name)
values ('qr-shares', '00000000-0000-0000-0000-0000000000f1.png');

do $$ begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

select is((select count(*) from storage.objects where bucket_id = 'qr-shares')::int, 0,
  'anon tidak bisa mendaftar objek qr-shares');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('qr-shares', '00000000-0000-0000-0000-0000000000f2.png') $$,
  '42501', null, 'anon tidak bisa mengunggah ke qr-shares');
select is(public.t_rows($$ delete from storage.objects where bucket_id = 'qr-shares' $$)::int, 0,
  'anon tidak bisa menghapus objek qr-shares');

select * from finish();
rollback;
