-- Migration 0026 — akses khusus anggota dengan role `member` untuk event dan tugas.
--
-- Ketua dapat memberi akses `events.manage` atau `tasks.manage` kepada anggota
-- berjabatan Member lewat checklist di /settings/access. Akses ini berlaku
-- sebagai tambahan pada `app.has_permission`, sehingga RLS, Server Action, dan
-- `get_viewer_context` memakai aturan yang sama.
--
-- Batas kepemilikan event: izin dari jabatan (Ketua/Wakil/Sekretaris/Bendahara
-- yang diberi akses) boleh mengubah semua event; izin dari akses per anggota
-- hanya untuk event yang ia buat sendiri.

create table public.member_access (
  class_id   uuid not null references public.classes (id) on delete cascade,
  user_id    uuid not null,
  permission text not null check (permission in ('events.manage', 'tasks.manage')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id, permission),
  foreign key (class_id, user_id)
    references public.memberships (class_id, user_id) on delete cascade
);

alter table public.member_access enable row level security;

create policy member_access_select on public.member_access for select to authenticated
  using (user_id = (select auth.uid())
         or app.has_permission(class_id, 'members.manage'));

grant select on public.member_access to authenticated;

-- Izin dari jabatan tetap tersedia terpisah; `has_permission` menggabungkan
-- keduanya supaya policy yang sudah ada tidak perlu diubah satu per satu.
create or replace function app.has_permission(p_class uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role_permission(p_class, p_perm)
      or exists (select 1 from public.member_access a
                  join public.memberships m
                    on m.class_id = a.class_id and m.user_id = a.user_id
                 where a.class_id = p_class and a.user_id = (select auth.uid())
                   and a.permission = p_perm and m.status = 'active') $$;

revoke all on function app.has_permission(uuid, text) from public;
grant execute on function app.has_permission(uuid, text) to anon, authenticated;

-- Daftar izin untuk UI: apa yang berasal dari jabatan saja.
create function public.has_role_access(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.has_role_permission(app.current_class_id(), p_permission) $$;

create function public.set_member_access(p_user_id uuid, p_permission text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_key text;
begin
  if (select auth.uid()) is null or not app.has_permission(v_class, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_permission not in ('events.manage', 'tasks.manage') then
    raise exception 'permission not assignable' using errcode = '22023';
  end if;
  select r.key into v_key
    from public.memberships m
    join public.roles r on r.class_id = m.class_id and r.id = m.role_id
   where m.class_id = v_class and m.user_id = p_user_id and m.status = 'active';
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_key <> 'member' then
    raise exception 'member already has a role' using errcode = 'EC083';
  end if;

  if p_enabled then
    insert into public.member_access (class_id, user_id, permission, granted_by)
    values (v_class, p_user_id, p_permission, (select auth.uid()))
    on conflict do nothing;
  else
    delete from public.member_access a
     where a.class_id = v_class and a.user_id = p_user_id and a.permission = p_permission;
  end if;
end $$;

-- Kepemilikan event: akses per anggota hanya berlaku untuk event buatannya.
drop policy events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (app.has_permission(class_id, 'events.manage')
         and (app.has_role_permission(class_id, 'events.manage')
              or created_by = (select auth.uid())))
  with check (app.has_permission(class_id, 'events.manage')
         and (app.has_role_permission(class_id, 'events.manage')
              or created_by = (select auth.uid())));

drop policy events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (app.has_permission(class_id, 'events.manage')
         and (app.has_role_permission(class_id, 'events.manage')
              or created_by = (select auth.uid())));

revoke all on function public.has_role_access(text),
                       public.set_member_access(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.has_role_access(text),
                        public.set_member_access(uuid, text, boolean)
  to authenticated;
