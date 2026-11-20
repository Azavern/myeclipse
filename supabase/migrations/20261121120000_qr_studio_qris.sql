-- Migration 0035 — QRIS donasi untuk QR Studio.
--
-- QR Studio dipakai publik, tetapi QRIS yang ditampilkan setelah tamu memilih
-- "Ingin donasi?" harus sengaja diatur pengurus. Gambar disimpan di bucket
-- privat; server menandatanganinya sebentar hanya setelah pilihan donasi.
-- Konfigurasi terpisah dari `kas_settings.qris_path` supaya QRIS kas yang
-- bersifat anggota tidak otomatis terbuka ke publik.
--
-- Pengelola: Bendahara (atau pemegang `kas.manage`) dan Ketua.

create table public.qr_studio_settings (
  class_id   uuid primary key references public.classes (id) on delete cascade,
  qris_path  text check (qris_path is null or char_length(qris_path) between 1 and 512),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.qr_studio_settings (class_id)
select id from public.classes
on conflict (class_id) do nothing;

alter table public.qr_studio_settings enable row level security;

create policy qr_studio_settings_select on public.qr_studio_settings for select to authenticated
  using (app.is_active_member(class_id));

grant select on public.qr_studio_settings to authenticated;

-- Bendahara/pemegang kas.manage atau Ketua. Ketua tidak memegang kas.manage
-- secara bawaan (lihat migrasi 0034), jadi perannya diperiksa terpisah.
create function app.qr_studio_can_manage(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_active_member(p_class)
     and (
       app.has_permission(p_class, 'kas.manage')
       or exists (
         select 1
           from public.memberships m
           join public.roles r on r.class_id = m.class_id and r.id = m.role_id
          where m.class_id = p_class
            and m.user_id = (select auth.uid())
            and m.status = 'active'
            and r.key = 'ketua'
       )
     ) $$;

create function app.qr_studio_valid_qris_path(p_class uuid, p_path text)
returns boolean language sql immutable as $$
  select p_path ~ ('^' || p_class::text || '/qris/[0-9a-f-]{36}[.](jpg|png|webp)$') $$;

create function public.get_qr_studio_access()
returns table (can_manage boolean, qris_available boolean)
language sql stable security definer set search_path = '' as $$
  with v as (select app.current_class_id() as class_id)
  select app.qr_studio_can_manage(v.class_id),
         exists (
           select 1 from public.qr_studio_settings s
            where s.class_id = v.class_id and s.qris_path is not null
         )
    from v $$;

create function public.set_qr_studio_qris(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class uuid := app.current_class_id();
begin
  if not app.qr_studio_can_manage(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_path is not null and not app.qr_studio_valid_qris_path(v_class, p_path) then
    raise exception 'qris path invalid' using errcode = '22023';
  end if;
  insert into public.qr_studio_settings (class_id, qris_path, updated_by, updated_at)
  values (v_class, p_path, (select auth.uid()), now())
  on conflict (class_id) do update
    set qris_path = excluded.qris_path,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
end $$;

-- STORAGE --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr-studio-media', 'qr-studio-media', false, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists qr_studio_media_select on storage.objects;
create policy qr_studio_media_select on storage.objects for select to authenticated
using (
  bucket_id = 'qr-studio-media'
  and app.is_active_member(app.current_class_id())
  and (storage.foldername(name))[1] = app.current_class_id()::text
);

drop policy if exists qr_studio_media_insert on storage.objects;
create policy qr_studio_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'qr-studio-media'
  and app.qr_studio_can_manage(app.current_class_id())
  and (storage.foldername(name))[1] = app.current_class_id()::text
  and (storage.foldername(name))[2] = 'qris'
);

drop policy if exists qr_studio_media_delete on storage.objects;
create policy qr_studio_media_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'qr-studio-media'
  and app.qr_studio_can_manage(app.current_class_id())
  and (storage.foldername(name))[1] = app.current_class_id()::text
  and (storage.foldername(name))[2] = 'qris'
);

revoke all on function app.qr_studio_can_manage(uuid), app.qr_studio_valid_qris_path(uuid, text)
  from public, anon, authenticated;
grant execute on function app.qr_studio_can_manage(uuid) to authenticated;

revoke all on function public.get_qr_studio_access(), public.set_qr_studio_qris(text)
  from public, anon, authenticated;
grant execute on function public.get_qr_studio_access() to anon, authenticated;
grant execute on function public.set_qr_studio_qris(text) to authenticated;
