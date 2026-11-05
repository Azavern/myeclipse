-- Migration 0029 — Library media.
--
-- Setiap gambar milik anggota punya dua salinan:
--   * `storage_path` di bucket `member-media` (versi ringan/WebP yang ditampilkan), dan
--   * `drive_file_id` di Google Drive (versi asli, kualitas dan ekstensi tidak diubah).
-- Baris ini menjadi katalog Library: pemilik mengelola (ubah judul, atur
-- visibilitas, hapus) dan anggota lain hanya membaca sesuai visibilitas.
--
-- Visibilitas TIDAK memakai katalog Dynamic Visibility: nilainya per item
-- (`private`, `all`, `specific`) dan daftar penerima disimpan di
-- `library_item_access`. Semua pembacaan memakai satu fungsi definer agar policy
-- tabel, policy Storage, dan unduhan memakai aturan yang sama tanpa rekursi RLS.
--
-- Folder Drive per anggota dipetakan di `library_drive_folders`. Nama folder
-- mengikuti username; mengganti username hanya mengganti nama folder di Drive
-- (file dan ID folder tetap), tidak pernah menghapus file.

create table public.library_items (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null,
  owner_id        uuid not null,
  title           text not null check (char_length(title) between 1 and 120),
  storage_path    text not null unique check (char_length(storage_path) between 1 and 512),
  mime_type       text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes      integer not null check (size_bytes between 1 and 2097152),
  original_name   text check (original_name is null or char_length(original_name) between 1 and 255),
  original_ext    text check (original_ext is null or original_ext in ('jpg', 'jpeg', 'png', 'webp')),
  original_mime   text check (original_mime is null
    or original_mime in ('image/jpeg', 'image/png', 'image/webp')),
  original_size   bigint check (original_size is null or original_size between 1 and 10485760),
  drive_file_id   text check (drive_file_id is null
    or drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drive_folder_id text check (drive_folder_id is null
    or drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drive_file_name text check (drive_file_name is null
    or char_length(drive_file_name) between 1 and 180),
  drive_error     text check (drive_error is null or char_length(drive_error) <= 60),
  visibility      text not null default 'private'
    check (visibility in ('private', 'all', 'specific')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (class_id, id),
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create table public.library_item_access (
  item_id    uuid not null,
  class_id   uuid not null,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id),
  foreign key (class_id, item_id)
    references public.library_items (class_id, id) on delete cascade,
  foreign key (class_id, user_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create table public.library_drive_folders (
  class_id        uuid not null,
  owner_id        uuid not null,
  category        text not null default 'pictures' check (category in ('pictures')),
  drive_folder_id text not null check (drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  folder_name     text not null check (char_length(folder_name) between 1 and 120),
  updated_at      timestamptz not null default now(),
  primary key (class_id, owner_id, category),
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create index library_items_owner_idx
  on public.library_items (class_id, owner_id, created_at desc);
create index library_items_visibility_idx
  on public.library_items (class_id, visibility, created_at desc);
create index library_item_access_user_idx
  on public.library_item_access (user_id, item_id);

-- Satu-satunya aturan baca. SECURITY DEFINER agar policy Storage/tabel tidak
-- memanggil RLS tabel yang sama secara rekursif. Pemilik selalu boleh; anggota
-- lain hanya bila masih aktif dan item dibagikan ke semua anggota atau ke dia.
create function app.library_can_read(p_item uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.library_items i
     where i.id = p_item
       and app.is_active_member(i.class_id)
       and (
         i.owner_id = (select auth.uid())
         or i.visibility = 'all'
         or (i.visibility = 'specific' and exists (
              select 1 from public.library_item_access a
               where a.item_id = i.id and a.user_id = (select auth.uid())))
       )
  ) $$;

revoke all on function app.library_can_read(uuid) from public;
grant execute on function app.library_can_read(uuid) to authenticated;

-- RPC: UBAH VISIBILITAS (termasuk banyak item sekaligus) ----------------------
create function public.set_library_visibility(
  p_ids uuid[], p_visibility text, p_member_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_total int;
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('private', 'all', 'specific') then
    raise exception 'visibility invalid' using errcode = '22023';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 then
    raise exception 'items invalid' using errcode = '22023';
  end if;

  select count(*) into v_total from public.library_items i
   where i.id = any (p_ids) and i.class_id = v_class and i.owner_id = v_uid;
  if v_total <> cardinality(p_ids) then
    raise exception 'items not found' using errcode = '42501';
  end if;

  if p_visibility = 'specific' then
    if p_member_ids is null or cardinality(p_member_ids) = 0 then
      raise exception 'members required' using errcode = 'EC090';
    end if;
    if exists (
      select 1 from unnest(p_member_ids) as x(user_id)
       where x.user_id = v_uid
          or not exists (
            select 1 from public.memberships m
             where m.class_id = v_class and m.user_id = x.user_id
               and m.status = 'active')
    ) then
      raise exception 'member invalid' using errcode = '22023';
    end if;
  end if;

  update public.library_items i
     set visibility = p_visibility, updated_at = now()
   where i.id = any (p_ids) and i.owner_id = v_uid;

  delete from public.library_item_access a where a.item_id = any (p_ids);

  if p_visibility = 'specific' then
    insert into public.library_item_access (item_id, class_id, user_id)
    select i.id, v_class, m.user_id
      from public.library_items i
      cross join (select distinct user_id from unnest(p_member_ids) as u(user_id)) m
     where i.id = any (p_ids) and i.owner_id = v_uid and m.user_id <> v_uid;
  end if;
end $$;

revoke all on function public.set_library_visibility(uuid[], text, uuid[]) from public, anon;
grant execute on function public.set_library_visibility(uuid[], text, uuid[])
  to authenticated;

-- HAK AKSES ---------------------------------------------------------------
revoke all on public.library_items, public.library_item_access,
              public.library_drive_folders
  from anon, authenticated;

-- anon perlu SELECT tabel untuk merencanakan subquery policy Storage; RLS tetap
-- menolak semua barisnya karena hanya policy `authenticated` yang ada.
grant select on public.library_items to anon, authenticated;
grant insert (class_id, owner_id, title, storage_path, mime_type, size_bytes,
              original_name, original_ext, original_mime, original_size,
              drive_file_id, drive_folder_id, drive_file_name, drive_error)
  on public.library_items to authenticated;
grant update (title, updated_at) on public.library_items to authenticated;
grant delete on public.library_items to authenticated;

grant select on public.library_item_access to authenticated;

grant select, insert on public.library_drive_folders to authenticated;
grant update (drive_folder_id, folder_name, updated_at)
  on public.library_drive_folders to authenticated;

-- RLS -----------------------------------------------------------------------
alter table public.library_items enable row level security;
alter table public.library_item_access enable row level security;
alter table public.library_drive_folders enable row level security;

create policy library_items_select on public.library_items for select
  to authenticated using (app.library_can_read(id));

create policy library_items_insert on public.library_items for insert
  to authenticated with check (
    owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy library_items_update on public.library_items for update
  to authenticated using (owner_id = (select auth.uid()) and app.is_active_member(class_id))
  with check (owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy library_items_delete on public.library_items for delete
  to authenticated using (owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy library_item_access_select on public.library_item_access for select
  to authenticated using (app.library_can_read(item_id));

-- Penerima hanya ditulis lewat RPC; tidak ada policy INSERT/UPDATE/DELETE.

-- Pemilik mengelola foldernya; Ketua boleh membaca/menyesuaikan nama folder
-- anggota lain saat username diubah dari halaman anggota.
create policy library_drive_folders_select on public.library_drive_folders for select
  to authenticated using (
    app.is_active_member(class_id)
    and (owner_id = (select auth.uid()) or app.has_permission(class_id, 'class.manage')));

create policy library_drive_folders_insert on public.library_drive_folders for insert
  to authenticated with check (
    owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy library_drive_folders_update on public.library_drive_folders for update
  to authenticated using (
    app.is_active_member(class_id)
    and (owner_id = (select auth.uid()) or app.has_permission(class_id, 'class.manage')))
  with check (
    app.is_active_member(class_id)
    and (owner_id = (select auth.uid()) or app.has_permission(class_id, 'class.manage')));

-- STORAGE: objek Library terlihat selama barisnya terlihat pemanggil ----------
drop policy member_media_select on storage.objects;

create policy member_media_select on storage.objects for select to anon, authenticated
using (bucket_id = 'member-media' and (
     (storage.foldername(name))[2] = (select auth.uid())::text  -- pemilik
  or exists (select 1 from public.member_profile_v v where v.avatar_path = storage.objects.name)
  or exists (select 1 from public.portfolio_items i where i.media_path = storage.objects.name)
  or exists (select 1 from public.library_items i where i.storage_path = storage.objects.name)));

drop policy member_media_insert on storage.objects;

create policy member_media_insert on storage.objects for insert to authenticated
with check (bucket_id = 'member-media'
  and (storage.foldername(name))[1] = app.current_class_id()::text
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (storage.foldername(name))[3] in ('avatar','portfolio','library')
  and app.is_active_member(app.current_class_id()));
