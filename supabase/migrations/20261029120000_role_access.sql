-- Migration 0016 — akses per role dan pengajuan perubahan jabatan.
--
-- Ketua mengatur akses jabatan lain lewat checklist di /settings/access. Akses
-- langsung (class/schedule/events/tasks) disimpan apa adanya di roles.permissions.
-- "Kelola anggota" adalah pengecualian: hanya role Ketua yang boleh memegang
-- members.manage (akses penuh). Jabatan lain hanya dapat memegang
-- `members.request`, yang artinya boleh MENGAJUKAN promosi/demosi jabatan
-- anggota; perubahan baru berlaku setelah Ketua menyetujuinya.
--
-- Pengajuan tidak menyentuh memberships sampai disetujui. Semua validasi
-- (hanya jabatan member/wakil/sekretaris/bendahara, bukan Ketua, bukan diri
-- sendiri) dilakukan di fungsi security definer, dan penerapannya tetap melewati
-- trigger batas role (EC041) yang sudah ada.

-- roles.permissions kini mengenal members.request. members.manage tetap ada
-- agar baris Ketua tidak berubah.
alter table public.roles drop constraint roles_permissions_check;
alter table public.roles add constraint roles_permissions_check
  check (permissions <@ array['class.manage','members.manage','schedule.manage',
                              'events.manage','tasks.manage','members.request']::text[]);

-- ANTREAN PENGAJUAN ----------------------------------------------------------
create table public.role_change_requests (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes(id) on delete cascade,
  requested_by   uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null,
  from_role_id   uuid not null,
  to_role_id     uuid not null,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  decided_by     uuid references auth.users(id) on delete set null,
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  foreign key (class_id, target_user_id)
    references public.memberships (class_id, user_id) on delete cascade,
  foreign key (class_id, from_role_id) references public.roles (class_id, id),
  foreign key (class_id, to_role_id)   references public.roles (class_id, id),
  check (from_role_id <> to_role_id)
);
-- Satu pengajuan menunggu per anggota; mencegah pengajuan ganda.
create unique index role_change_requests_pending_uq
  on public.role_change_requests (class_id, target_user_id) where status = 'pending';
create index role_change_requests_queue_idx
  on public.role_change_requests (class_id, status, created_at desc);

alter table public.role_change_requests enable row level security;

-- Pengaju melihat pengajuannya sendiri; Ketua melihat seluruh antrean.
-- Tidak ada policy INSERT/UPDATE/DELETE: satu-satunya jalur tulis adalah RPC.
create policy role_change_requests_select on public.role_change_requests for select
  to authenticated
  using (requested_by = (select auth.uid())
         or app.has_permission(class_id, 'members.manage'));

-- FUNGSI ---------------------------------------------------------------------

-- Ubah satu akses jabatan. add/remove atomik dalam satu UPDATE, dan hanya untuk
-- jabatan di bawah Ketua. Role Ketua tidak dapat diubah supaya kelas tidak
-- pernah kehilangan pengelola.
create function public.set_role_access(p_role_id uuid, p_permission text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class uuid := app.current_class_id(); v_key text;
begin
  if not app.has_permission(v_class, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_permission not in ('class.manage','schedule.manage','events.manage',
                          'tasks.manage','members.request') then
    raise exception 'permission not assignable' using errcode = '22023';
  end if;
  select r.key into v_key from public.roles r
   where r.class_id = v_class and r.id = p_role_id;
  if not found then raise exception 'role not found' using errcode = 'P0002'; end if;
  if v_key = 'ketua' then
    raise exception 'ketua access is fixed' using errcode = 'EC063';
  end if;
  if v_key not in ('wakil','sekretaris','bendahara') then
    raise exception 'role cannot receive access' using errcode = 'EC064';
  end if;
  update public.roles r
     set permissions = case
       when not p_enabled then array_remove(r.permissions, p_permission)
       when p_permission = any (r.permissions) then r.permissions
       else r.permissions || p_permission end
   where r.class_id = v_class and r.id = p_role_id;
end $$;

-- Jabatan yang boleh dipilih pengaju: semua kecuali Ketua. Dipakai formulir
-- anggota; tidak membuka tabel roles untuk pemegang members.request.
create function public.get_role_change_options()
returns table (id uuid, key text, name text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.key, r.name
  from public.roles r
  where r.class_id = app.current_class_id()
    and r.key in ('member','wakil','sekretaris','bendahara')
    and (app.has_permission(r.class_id, 'members.request')
         or app.has_permission(r.class_id, 'members.manage'))
  order by case r.key
    when 'member' then 0 when 'wakil' then 1
    when 'sekretaris' then 2 else 3 end
$$;

-- Pengajuan: hanya jabatan, hanya untuk anggota (bukan Ketua), bukan diri
-- sendiri. Status dan role saat ini dibaca dari DB, bukan dari klien.
create function public.request_role_change(p_target uuid, p_role_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_from uuid; v_from_key text; v_to_key text; v_id uuid;
begin
  if not app.has_permission(v_class, 'members.request') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target = (select auth.uid()) then
    raise exception 'cannot request own role change' using errcode = 'EC060';
  end if;
  select m.role_id, r.key into v_from, v_from_key
    from public.memberships m
    join public.roles r on r.class_id = m.class_id and r.id = m.role_id
   where m.class_id = v_class and m.user_id = p_target;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  select r.key into v_to_key from public.roles r
   where r.class_id = v_class and r.id = p_role_id;
  if not found then raise exception 'role not found' using errcode = 'P0002'; end if;
  if v_from_key = 'ketua' or v_to_key = 'ketua' then
    raise exception 'ketua role is protected' using errcode = 'EC061';
  end if;
  if v_from_key not in ('member','wakil','sekretaris','bendahara')
     or v_to_key not in ('member','wakil','sekretaris','bendahara') then
    raise exception 'role not assignable' using errcode = '22023';
  end if;
  if v_from = p_role_id then
    raise exception 'role unchanged' using errcode = 'EC062';
  end if;
  insert into public.role_change_requests
    (class_id, requested_by, target_user_id, from_role_id, to_role_id)
  values (v_class, (select auth.uid()), p_target, v_from, p_role_id)
  returning id into v_id;
  return v_id;
end $$;

-- Persetujuan Ketua. Menerapkan role lewat UPDATE biasa supaya trigger batas
-- role tetap berlaku; bila batas penuh (EC041), seluruh transaksi batal dan
-- pengajuan tetap menunggu.
create function public.decide_role_change_request(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_req public.role_change_requests;
  v_key text; n int;
begin
  if not app.has_permission(v_class, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_req from public.role_change_requests
   where id = p_id and class_id = v_class for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if v_req.status <> 'pending' then
    raise exception 'request already decided' using errcode = 'EC057';
  end if;
  if p_approve then
    select r.key into v_key
      from public.memberships m
      join public.roles r on r.class_id = m.class_id and r.id = m.role_id
     where m.class_id = v_class and m.user_id = v_req.target_user_id
     for update of m;
    if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
    if v_key = 'ketua' then
      raise exception 'ketua role is protected' using errcode = 'EC061';
    end if;
    update public.memberships m set role_id = v_req.to_role_id
     where m.class_id = v_class and m.user_id = v_req.target_user_id;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'member not found' using errcode = 'P0002'; end if;
  end if;
  update public.role_change_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = (select auth.uid()), decided_at = now()
   where id = p_id;
end $$;

-- HAK AKSES ------------------------------------------------------------------
-- Tabel baru tertutup secara default; hanya SELECT yang dibuka (disaring RLS).
grant select on public.role_change_requests to authenticated;

revoke all on function public.set_role_access(uuid, text, boolean),
                       public.get_role_change_options(),
                       public.request_role_change(uuid, uuid),
                       public.decide_role_change_request(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_role_access(uuid, text, boolean),
                        public.get_role_change_options(),
                        public.request_role_change(uuid, uuid),
                        public.decide_role_change_request(uuid, boolean)
  to authenticated;
