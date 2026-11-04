-- Migration 0025 — foto event (maksimal 12) dan thumbnail.
--
-- Foto disimpan di bucket `class-media` pada folder `{class_id}/events` yang
-- sudah diizinkan policy Storage untuk pemegang events.manage. Ukuran dan tipe
-- tetap divalidasi server (JPEG/PNG/WebP maks 2 MB). Thumbnail tidak memakai
-- kolom baru: `events.cover_path` menunjuk salah satu path foto, dan NULL
-- berarti event sengaja tanpa thumbnail.
--
-- Trigger menjaga tiga invarian: kelas foto sama dengan kelas event, maksimum
-- 12 foto per event, dan cover selalu menunjuk foto yang masih ada (foto
-- pertama otomatis menjadi thumbnail, menghapus thumbnail memilih foto
-- berikutnya).

-- Izin dari jabatan saja (tanpa akses per anggota). Dipakai policy kepemilikan
-- event sampai migrasi 0026 menambahkan `member_access`.
create or replace function app.has_role_permission(p_class uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    join public.roles r on r.class_id = m.class_id and r.id = m.role_id
    where m.class_id = p_class and m.user_id = (select auth.uid())
      and m.status = 'active' and p_perm = any (r.permissions)) $$;

revoke all on function app.has_role_permission(uuid, text) from public;
grant execute on function app.has_role_permission(uuid, text) to anon, authenticated;

create table public.event_photos (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  event_id   uuid not null references public.events (id) on delete cascade,
  path       text not null unique,
  position   int not null default 0 check (position between 0 and 11),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index event_photos_event_idx on public.event_photos (event_id, position, created_at);

create function app.event_photos_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if new.class_id is distinct from (select e.class_id from public.events e where e.id = new.event_id) then
    raise exception 'event class mismatch' using errcode = 'EC080';
  end if;
  select count(*) into v_count from public.event_photos p where p.event_id = new.event_id;
  if v_count >= 12 then
    raise exception 'photo limit reached' using errcode = 'EC081';
  end if;
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  return new;
end $$;

create trigger event_photos_guard before insert on public.event_photos
  for each row execute function app.event_photos_guard();

create function app.event_photos_cover_ins() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events e set cover_path = new.path
   where e.id = new.event_id and e.cover_path is null;
  return null;
end $$;

create trigger event_photos_cover_ins after insert on public.event_photos
  for each row execute function app.event_photos_cover_ins();

create function app.event_photos_cover_del() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.events e
     set cover_path = (select p.path from public.event_photos p
                        where p.event_id = old.event_id
                        order by p.position, p.created_at limit 1)
   where e.id = old.event_id and e.cover_path = old.path;
  return null;
end $$;

create trigger event_photos_cover_del after delete on public.event_photos
  for each row execute function app.event_photos_cover_del();

alter table public.event_photos enable row level security;

-- Select mengikuti visibilitas event induknya (events punya policy sendiri).
create policy event_photos_select on public.event_photos for select to anon, authenticated
  using (exists (select 1 from public.events e
                 where e.id = event_photos.event_id
                   and e.class_id = event_photos.class_id));

-- Tulis hanya untuk event milik sendiri; pemegang events.manage dari role
-- (Ketua dan jabatan yang diberi akses) boleh mengelola semua event.
create policy event_photos_insert on public.event_photos for insert to authenticated
  with check (app.has_permission(event_photos.class_id, 'events.manage')
    and exists (select 1 from public.events e
                where e.id = event_photos.event_id
                  and e.class_id = event_photos.class_id
                  and (e.created_by = (select auth.uid())
                       or app.has_role_permission(event_photos.class_id, 'events.manage'))));

create policy event_photos_delete on public.event_photos for delete to authenticated
  using (app.has_permission(event_photos.class_id, 'events.manage')
    and exists (select 1 from public.events e
                where e.id = event_photos.event_id
                  and e.class_id = event_photos.class_id
                  and (e.created_by = (select auth.uid())
                       or app.has_role_permission(event_photos.class_id, 'events.manage'))));

-- anon ikut diberi SELECT tabel agar subquery policy Storage di atas bisa
-- dievaluasi untuk pengunjung; barisnya tetap disaring policy event_photos_select.
grant select on public.event_photos to anon, authenticated;
grant insert, delete on public.event_photos to authenticated;

-- Storage: objek foto event boleh dibaca selama barisnya terlihat pemanggil.
drop policy class_media_select on storage.objects;

create policy class_media_select on storage.objects for select to anon, authenticated
using (bucket_id = 'class-media' and (
     exists (select 1 from public.class_identity_v v
             where v.logo_path = storage.objects.name
                or v.cover_path = storage.objects.name)
  or exists (select 1 from public.events e where e.cover_path = storage.objects.name)
  or exists (select 1 from public.event_photos p where p.path = storage.objects.name)));

revoke all on function app.event_photos_guard(),
                       app.event_photos_cover_ins(),
                       app.event_photos_cover_del()
  from public;
