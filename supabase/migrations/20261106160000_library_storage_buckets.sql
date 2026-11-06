-- Migration 0033 — Library lintas bucket.
--
-- Sampai 0032, katalog `library_items` hanya berisi gambar yang diunggah lewat
-- Library (`member-media/{class}/{user}/library/...`). Media lain di Storage —
-- logo dan sampul kelas, sampul dan foto event di bucket `class-media` — tidak
-- punya baris katalog, jadi tidak bisa muncul di Library, tidak bisa dipakai
-- ulang di form gambar, dan tidak punya pemilik yang mengatur visibilitasnya.
--
-- Perubahan:
--   * `library_items.bucket` mencatat bucket asal objek (default `member-media`),
--     dan keunikan path menjadi (bucket, storage_path) karena nama objek hanya
--     unik di dalam bucketnya.
--   * Policy SELECT `class-media` menerima objek yang tercatat di Library,
--     sehingga URL bertanda tangan bisa dibuat untuk pemilik/penerima yang sah.
--     Visibilitas tetap ditentukan RLS `library_items` (pemilik, `all`, atau
--     `specific`); tidak ada baris katalog berarti tidak ada akses baru.
--   * Backfill: setiap objek `class-media` yang berupa gambar dan memenuhi batas
--     katalog dicatat dengan pemilik = pengunggah sebenarnya
--     (`storage.objects.owner`), bukan selalu Ketua. Untuk logo/sampul kelas,
--     pengunggahnya memang pemegang `class.manage` (Ketua).
--
-- Objek yatim hasil event yang sudah dihapus tetap dicatat: pemiliknya bisa
-- menghapusnya sendiri, dan `deleteLibraryItems` membersihkan objek `class-media`
-- hanya bila tidak ada baris kelas/event/foto yang masih merujuknya.

alter table public.library_items
  add column bucket text not null default 'member-media'
    constraint library_items_bucket_check check (bucket in ('member-media', 'class-media'));

-- `storage_path` sebelumnya unik sendiri; nama objek hanya unik per bucket.
alter table public.library_items drop constraint library_items_storage_path_key;
alter table public.library_items
  add constraint library_items_bucket_storage_key unique (bucket, storage_path);

-- Grant kolom bersifat aditif: kolom baru harus diberikan terpisah karena
-- INSERT dari aplikasi memakai daftar kolom eksplisit.
grant insert (bucket) on public.library_items to authenticated;

-- Objek class-media yang tercatat di katalog harus bisa ditandatangani lewat
-- JWT anggota. Klausa lama (rujukan kelas/event/foto) dipertahankan apa adanya.
drop policy if exists class_media_select on storage.objects;

create policy class_media_select on storage.objects for select to anon, authenticated
using (
  bucket_id = 'class-media'
  and (
    exists (select 1 from public.class_identity_v v
             where v.logo_path = storage.objects.name
                or v.cover_path = storage.objects.name)
    or exists (select 1 from public.events e where e.cover_path = storage.objects.name)
    or exists (select 1 from public.library_items i
                where i.bucket = 'class-media' and i.storage_path = storage.objects.name)
    or (
      (storage.foldername(name))[1] = app.current_class_id()::text
      and (
        (   (storage.foldername(name))[2] in ('logo','cover')
            and app.has_permission(app.current_class_id(), 'class.manage'))
        or (    (storage.foldername(name))[2] = 'events'
            and app.has_permission(app.current_class_id(), 'events.manage'))
      )
    )
  )
);

-- Policy member-media dibatasi ke baris bucket yang sama agar path class-media
-- tidak pernah membuka objek member-media (dan sebaliknya).
drop policy if exists member_media_select on storage.objects;

create policy member_media_select on storage.objects for select to anon, authenticated
using (bucket_id = 'member-media' and (
     (storage.foldername(name))[2] = (select auth.uid())::text  -- pemilik
  or exists (select 1 from public.member_profile_v v where v.avatar_path = storage.objects.name)
  or exists (select 1 from public.portfolio_items i where i.media_path = storage.objects.name)
  or exists (select 1 from public.library_items i
              where i.bucket = 'member-media' and i.storage_path = storage.objects.name)));

-- BACKFILL ------------------------------------------------------------------
-- Judul mengikuti jenis media; sampul event memakai judul eventnya bila masih
-- ada. Pemilik = pengunggah objek di Storage dan wajib anggota kelas tersebut
-- (foreign key katalog). Semua baris mulai `private`; pemilik yang membagikan.
insert into public.library_items (
  bucket, class_id, owner_id, title, storage_path, mime_type, size_bytes,
  original_ext, original_mime, original_size, drive_error, visibility
)
select
  'class-media',
  m.class_id,
  o.owner,
  left(case split_part(o.name, '/', 2)
         when 'logo' then 'Logo kelas'
         when 'cover' then 'Sampul kelas'
         else coalesce(ev.title, 'Gambar event')
       end, 120),
  o.name,
  o.metadata->>'mimetype',
  (o.metadata->>'size')::int,
  'webp',
  o.metadata->>'mimetype',
  (o.metadata->>'size')::bigint,
  'hd_unavailable',
  'private'
from storage.objects o
join public.memberships m
  on m.class_id::text = split_part(o.name, '/', 1)
 and m.user_id = o.owner
left join lateral (
  select e.title from public.events e
   where e.cover_path = o.name
     and e.class_id = m.class_id
   limit 1
) ev on true
where o.bucket_id = 'class-media'
  and o.owner is not null
  and o.metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp')
  and o.metadata->>'size' ~ '^[0-9]+$'
  and (o.metadata->>'size')::int between 1 and 2097152
on conflict (bucket, storage_path) do nothing;
