-- Migration 0021 — Google Drive Uploader.
--
-- File TIDAK melewati Supabase Storage: peramban mengunggah langsung ke sesi
-- resumable Google Drive yang dibuat server. Tabel di sini hanya menyimpan
-- metadata tujuan, kepemilikan, dan sesi agar unggahan bisa dilanjutkan.
--
-- Aturan utama:
--   * Folder custom/external milik satu anggota; tidak ada akses lintas pemilik.
--   * Folder eksternal hanya didaftarkan setelah lolos uji tulis dummy.txt.
--   * Default folder per anggota disimpan terpisah dan boleh kosong.
--   * Batas ukuran dan izin arsip diatur Ketua (class.manage) per kelas.
--   * Slot unggahan bersamaan dihitung atomik per anggota saat klaim.

-- TABEL -----------------------------------------------------------------------
create table public.gdrive_settings (
  class_id          uuid primary key references public.classes (id) on delete cascade,
  max_file_mb       integer not null default 500 check (max_file_mb between 1 and 2048),
  archives_enabled  boolean not null default true,
  updated_at        timestamptz not null default now()
);

create table public.gdrive_folders (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null,
  owner_id        uuid not null,
  drive_folder_id text not null check (drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  name            text not null check (char_length(name) between 1 and 120),
  kind            text not null check (kind in ('custom', 'external')),
  parent_drive_id text check (parent_drive_id is null
    or parent_drive_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  validated_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade,
  unique (class_id, owner_id, drive_folder_id)
);

create table public.gdrive_profiles (
  class_id          uuid not null,
  owner_id          uuid not null,
  default_folder_id uuid references public.gdrive_folders (id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (class_id, owner_id),
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create table public.gdrive_uploads (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null,
  owner_id         uuid not null,
  folder_id        uuid references public.gdrive_folders (id) on delete set null,
  drive_folder_id  text not null check (drive_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drive_file_name  text not null check (char_length(drive_file_name) between 1 and 180),
  original_name    text not null check (char_length(original_name) between 1 and 255),
  size_bytes       bigint not null check (size_bytes between 1 and 2147483648),
  category         text not null check (category in ('pictures', 'videos', 'audios', 'documents', 'archives')),
  mime_type        text not null check (char_length(mime_type) between 1 and 160),
  session_uri      text check (session_uri is null
    or (char_length(session_uri) <= 4096 and session_uri ~ '^https://www[.]googleapis[.]com/')),
  drive_file_id    text,
  bytes_uploaded   bigint not null default 0 check (bytes_uploaded >= 0),
  status           text not null default 'pending'
    check (status in ('pending', 'uploading', 'verifying', 'completed', 'failed', 'cancelled', 'expired')),
  error_code       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz not null default now() + interval '12 hours',
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create index gdrive_folders_owner_idx
  on public.gdrive_folders (class_id, owner_id, created_at desc);
create index gdrive_uploads_owner_idx
  on public.gdrive_uploads (class_id, owner_id, status, created_at desc);

-- RPC: PENGATURAN KELAS -------------------------------------------------------
create function public.save_gdrive_settings(p_max_mb integer, p_archives boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
begin
  if v_class is null or not app.has_permission(v_class, 'class.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_max_mb is null or p_max_mb < 1 or p_max_mb > 2048 then
    raise exception 'max size invalid' using errcode = '22023';
  end if;
  insert into public.gdrive_settings (class_id, max_file_mb, archives_enabled, updated_at)
  values (v_class, p_max_mb, coalesce(p_archives, true), now())
  on conflict (class_id) do update
    set max_file_mb = excluded.max_file_mb,
        archives_enabled = excluded.archives_enabled,
        updated_at = now();
end $$;

-- RPC: FOLDER MILIK PENGGUNA --------------------------------------------------
create function public.register_gdrive_folder(
  p_drive_folder_id text, p_name text, p_kind text, p_parent_drive_id text default null)
returns table (id uuid, name text, kind text, drive_folder_id text, validated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_count int;
  v_id uuid;
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('custom', 'external') then
    raise exception 'kind invalid' using errcode = '22023';
  end if;
  if p_drive_folder_id is null or p_drive_folder_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'folder id invalid' using errcode = '22023';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'folder name invalid' using errcode = '22023';
  end if;
  if p_parent_drive_id is not null and p_parent_drive_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'parent invalid' using errcode = '22023';
  end if;

  perform 1 from public.memberships m
   where m.class_id = v_class and m.user_id = v_uid
     for update;
  select count(*) into v_count from public.gdrive_folders f
   where f.class_id = v_class and f.owner_id = v_uid;
  if v_count >= 20 then
    raise exception 'folder quota exhausted' using errcode = 'EC083';
  end if;

  insert into public.gdrive_folders (class_id, owner_id, drive_folder_id, name, kind, parent_drive_id, validated_at)
  values (v_class, v_uid, p_drive_folder_id, v_name, p_kind, p_parent_drive_id, now())
  returning gdrive_folders.id into v_id;

  return query select f.id, f.name, f.kind, f.drive_folder_id, f.validated_at
   from public.gdrive_folders f where f.id = v_id;
end $$;

create function public.set_gdrive_default(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform 1 from public.gdrive_folders f
   where f.id = p_folder_id and f.class_id = v_class and f.owner_id = v_uid;
  if not found then
    raise exception 'folder not found' using errcode = 'P0002';
  end if;
  insert into public.gdrive_profiles (class_id, owner_id, default_folder_id, updated_at)
  values (v_class, v_uid, p_folder_id, now())
  on conflict (class_id, owner_id) do update
    set default_folder_id = excluded.default_folder_id, updated_at = now();
end $$;

create function public.clear_gdrive_default()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.gdrive_profiles p
     set default_folder_id = null, updated_at = now()
   where p.class_id = v_class and p.owner_id = v_uid;
end $$;

create function public.remove_gdrive_folder(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.gdrive_folders f
   where f.id = p_id and f.class_id = v_class and f.owner_id = v_uid;
  if not found then
    raise exception 'folder not found' using errcode = 'P0002';
  end if;
end $$;

-- RPC: KLAIM UNGGAHAN ---------------------------------------------------------
-- Baris keanggotaan dikunci agar pemeriksaan slot tidak bisa balapan.
create function public.begin_gdrive_upload(
  p_folder_id uuid, p_drive_folder_id text, p_drive_file_name text, p_original_name text,
  p_size bigint, p_mime text, p_category text)
returns table (id uuid, status text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_max_mb int := 500;
  v_archives boolean := true;
  v_limit int;
  v_active int;
  v_recent int;
  v_day bigint;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_size is null or p_size <= 0 or p_size > 2147483648 then
    raise exception 'size invalid' using errcode = '22023';
  end if;
  if p_drive_file_name is null or char_length(p_drive_file_name) not between 1 and 180
     or p_original_name is null or char_length(p_original_name) not between 1 and 255 then
    raise exception 'name invalid' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('pictures', 'videos', 'audios', 'documents', 'archives') then
    raise exception 'category invalid' using errcode = '22023';
  end if;
  if p_drive_folder_id is null or p_drive_folder_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'folder invalid' using errcode = '22023';
  end if;

  select s.max_file_mb, s.archives_enabled into v_max_mb, v_archives
   from public.gdrive_settings s where s.class_id = v_class;
  if v_max_mb is null then v_max_mb := 500; end if;
  if v_archives is null then v_archives := true; end if;
  if p_size > v_max_mb::bigint * 1048576 then
    raise exception 'file too large' using errcode = 'EC081';
  end if;
  if p_category = 'archives' and not v_archives then
    raise exception 'archives disabled' using errcode = 'EC082';
  end if;

  if p_folder_id is not null then
    perform 1 from public.gdrive_folders f
     where f.id = p_folder_id and f.class_id = v_class and f.owner_id = v_uid;
    if not found then
      raise exception 'folder forbidden' using errcode = '42501';
    end if;
  end if;

  perform 1 from public.memberships m
   where m.class_id = v_class and m.user_id = v_uid
     for update;

  update public.gdrive_uploads u
     set status = 'expired', updated_at = now()
   where u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('pending', 'uploading', 'verifying')
     and u.expires_at < now();

  -- Rate limit berbasis database (bukan penghitung memori per instance).
  select count(*) into v_recent from public.gdrive_uploads u
   where u.class_id = v_class and u.owner_id = v_uid
     and u.created_at > now() - interval '10 minutes';
  if v_recent >= 30 then
    raise exception 'start rate limited' using errcode = 'EC084';
  end if;

  select coalesce(sum(u.size_bytes), 0) into v_day from public.gdrive_uploads u
   where u.class_id = v_class and u.owner_id = v_uid
     and u.created_at > now() - interval '24 hours';
  if v_day + p_size > 21474836480 then
    raise exception 'daily upload quota' using errcode = 'EC085';
  end if;

  v_limit := case
    when p_size > 103809024 then 1
    when p_size > 52428800 then 2
    when p_size > 26214400 then 3
    when p_size > 10485760 then 4
    when p_size > 1048576 then 5
    else 10
  end;

  select count(*) into v_active
    from public.gdrive_uploads u
   where u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('pending', 'uploading', 'verifying')
     and case
       when u.size_bytes > 103809024 then 1
       when u.size_bytes > 52428800 then 2
       when u.size_bytes > 26214400 then 3
       when u.size_bytes > 10485760 then 4
       when u.size_bytes > 1048576 then 5
       else 10
     end = v_limit;
  if v_active >= v_limit then
    raise exception 'upload slot full' using errcode = 'EC080';
  end if;

  v_expires := now() + interval '12 hours';
  insert into public.gdrive_uploads (
    class_id, owner_id, folder_id, drive_folder_id, drive_file_name, original_name,
    size_bytes, category, mime_type, status, expires_at)
  values (
    v_class, v_uid, p_folder_id, p_drive_folder_id, p_drive_file_name, p_original_name,
    p_size, p_category, p_mime, 'pending', v_expires)
  returning gdrive_uploads.id into v_id;

  return query select u.id, u.status, u.expires_at from public.gdrive_uploads u where u.id = v_id;
end $$;

create function public.set_gdrive_session(p_id uuid, p_session_uri text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_session_uri is null or char_length(p_session_uri) > 4096
     or p_session_uri !~ '^https://www[.]googleapis[.]com/' then
    raise exception 'session invalid' using errcode = '22023';
  end if;
  update public.gdrive_uploads u
     set session_uri = p_session_uri, status = 'uploading', updated_at = now()
   where u.id = p_id and u.class_id = v_class and u.owner_id = v_uid
     and u.status = 'pending';
  if not found then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;
end $$;

create function public.update_gdrive_progress(p_id uuid, p_bytes bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.gdrive_uploads u
     set bytes_uploaded = least(greatest(coalesce(p_bytes, 0), 0), u.size_bytes),
         updated_at = now()
   where u.id = p_id and u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('pending', 'uploading', 'verifying');
end $$;

create function public.complete_gdrive_upload(p_id uuid, p_drive_file_id text, p_bytes bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_drive_file_id is null or p_drive_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'file id invalid' using errcode = '22023';
  end if;
  update public.gdrive_uploads u
     set status = 'completed', drive_file_id = p_drive_file_id,
         bytes_uploaded = least(greatest(coalesce(p_bytes, 0), 0), u.size_bytes),
         error_code = null, updated_at = now()
   where u.id = p_id and u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('pending', 'uploading', 'verifying', 'completed');
  if not found then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;
end $$;

create function public.fail_gdrive_upload(p_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.gdrive_uploads u
     set status = 'failed', error_code = left(coalesce(p_error, 'unknown'), 40), updated_at = now()
   where u.id = p_id and u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('pending', 'uploading', 'verifying');
end $$;

create function public.cancel_gdrive_upload(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.gdrive_uploads u
     set status = 'cancelled', updated_at = now()
   where u.id = p_id and u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('pending', 'uploading', 'verifying');
end $$;

-- HAK AKSES DAN RLS -----------------------------------------------------------
revoke all on public.gdrive_settings, public.gdrive_folders,
              public.gdrive_profiles, public.gdrive_uploads
  from anon, authenticated;

-- Semua tulisan lewat RPC di atas; klien hanya boleh membaca barisnya sendiri.
grant select on public.gdrive_settings, public.gdrive_folders,
                public.gdrive_profiles, public.gdrive_uploads
  to authenticated;

alter table public.gdrive_settings enable row level security;
alter table public.gdrive_folders enable row level security;
alter table public.gdrive_profiles enable row level security;
alter table public.gdrive_uploads enable row level security;

create policy gdrive_settings_select on public.gdrive_settings for select
  to authenticated using (app.is_active_member(class_id));

create policy gdrive_folders_select on public.gdrive_folders for select
  to authenticated using (owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy gdrive_profiles_select on public.gdrive_profiles for select
  to authenticated using (owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy gdrive_uploads_select on public.gdrive_uploads for select
  to authenticated using (owner_id = (select auth.uid()) and app.is_active_member(class_id));

revoke all on function public.save_gdrive_settings(integer, boolean),
                       public.register_gdrive_folder(text, text, text, text),
                       public.set_gdrive_default(uuid),
                       public.clear_gdrive_default(),
                       public.remove_gdrive_folder(uuid),
                       public.begin_gdrive_upload(uuid, text, text, text, bigint, text, text),
                       public.set_gdrive_session(uuid, text),
                       public.update_gdrive_progress(uuid, bigint),
                       public.complete_gdrive_upload(uuid, text, bigint),
                       public.fail_gdrive_upload(uuid, text),
                       public.cancel_gdrive_upload(uuid)
  from public, anon;

grant execute on function public.save_gdrive_settings(integer, boolean),
                        public.register_gdrive_folder(text, text, text, text),
                        public.set_gdrive_default(uuid),
                        public.clear_gdrive_default(),
                        public.remove_gdrive_folder(uuid),
                        public.begin_gdrive_upload(uuid, text, text, text, bigint, text, text),
                        public.set_gdrive_session(uuid, text),
                        public.update_gdrive_progress(uuid, bigint),
                        public.complete_gdrive_upload(uuid, text, bigint),
                        public.fail_gdrive_upload(uuid, text),
                        public.cancel_gdrive_upload(uuid)
  to authenticated;
