-- Migration 0023 — Developer API Eclipse.
--
-- API key disimpan sebagai hash SHA-256 dari secret 256-bit. Secret hanya
-- dikembalikan sekali oleh Server Action saat dibuat dan tidak pernah masuk DB.
-- Izin CRUD dan cakupan subjek disimpan terpisah supaya satu key tidak perlu
-- diduplikasi untuk setiap kombinasi.
--
-- Semua tulisan key lewat RPC security definer di bawah (class.manage). Tabel
-- hanya membuka SELECT aman ke authenticated; secret_hash tidak pernah diberi
-- grant. Verifikasi key dilakukan server dengan service role, lalu setiap query
-- domain tetap dibatasi class_id dari baris key.

create table public.api_keys (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  prefix        text not null check (prefix ~ '^[a-f0-9]{12}$'),
  secret_hash   text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  permissions   jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  scope         jsonb not null default '{}'::jsonb check (jsonb_typeof(scope) = 'object'),
  status        text not null default 'active' check (status in ('active', 'disabled', 'revoked')),
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  quota_window  timestamptz not null default now(),
  quota_count   int not null default 0 check (quota_count >= 0),
  unique (prefix)
);

create table public.api_key_members (
  key_id   uuid not null references public.api_keys (id) on delete cascade,
  class_id uuid not null,
  user_id  uuid not null,
  primary key (key_id, user_id),
  foreign key (class_id, user_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create table public.api_audit_log (
  id          bigint generated always as identity primary key,
  class_id    uuid not null references public.classes (id) on delete cascade,
  api_key_id  uuid references public.api_keys (id) on delete set null,
  method      text not null check (char_length(method) between 3 and 10),
  path        text not null check (char_length(path) between 1 and 300),
  resource    text check (char_length(resource) <= 40),
  status_code int not null check (status_code between 100 and 599),
  duration_ms int not null default 0 check (duration_ms >= 0),
  created_at  timestamptz not null default now()
);

create index api_keys_class_idx on public.api_keys (class_id, created_at desc);
create index api_audit_log_key_idx on public.api_audit_log (api_key_id, created_at desc);
create index api_audit_log_class_idx on public.api_audit_log (class_id, created_at desc);

create trigger api_keys_touch before update on public.api_keys
  for each row execute function app.touch_updated_at();

-- Validasi bentuk JSON. Disimpan sebagai helper app supaya RPC create dan
-- update memakai aturan yang persis sama.
create function app.api_permissions_valid(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each(p) e
      where e.key not in ('class_profile', 'class_links', 'members',
                          'portfolio', 'social_links', 'schedules', 'events', 'tasks',
                          'knowledge', 'visibility', 'activity', 'inventory')
         or jsonb_typeof(e.value) <> 'object'
         or exists (
           select 1 from jsonb_each_text(e.value) x
           where x.key not in ('read', 'create', 'update', 'delete')
              or x.value not in ('true', 'false')))
$$;

create function app.api_scope_valid(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
    and not exists (
      select 1 from jsonb_each_text(p) s
      where s.key not in ('members', 'portfolio', 'social_links', 'inventory')
         or s.value not in ('none', 'all', 'selected', 'self', 'public'))
$$;

-- RPC: PENGELOLAAN KEY --------------------------------------------------------
create function public.create_api_key(
  p_name text, p_prefix text, p_secret_hash text,
  p_permissions jsonb, p_scope jsonb, p_member_ids uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or not app.has_permission(v_class, 'class.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'name invalid' using errcode = '22023';
  end if;
  if p_prefix is null or p_prefix !~ '^[a-f0-9]{12}$'
     or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'key material invalid' using errcode = '22023';
  end if;
  if not app.api_permissions_valid(p_permissions) or not app.api_scope_valid(p_scope) then
    raise exception 'permissions invalid' using errcode = '22023';
  end if;

  insert into public.api_keys
    (class_id, name, prefix, secret_hash, permissions, scope, created_by)
  values
    (v_class, btrim(p_name), p_prefix, p_secret_hash, p_permissions, p_scope, v_uid)
  returning id into v_id;

  if coalesce(cardinality(p_member_ids), 0) > 0 then
    insert into public.api_key_members (key_id, class_id, user_id)
    select v_id, v_class, m.user_id
    from public.memberships m
    where m.class_id = v_class
      and m.user_id = any (p_member_ids)
      and m.status = 'active'
    on conflict do nothing;
  end if;
  return v_id;
end $$;

create function public.update_api_key(
  p_id uuid, p_name text, p_permissions jsonb, p_scope jsonb,
  p_member_ids uuid[] default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_status text;
begin
  if (select auth.uid()) is null or not app.has_permission(v_class, 'class.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select k.status into v_status from public.api_keys k
   where k.id = p_id and k.class_id = v_class;
  if not found then raise exception 'key not found' using errcode = 'P0002'; end if;
  if v_status = 'revoked' then
    raise exception 'key revoked' using errcode = 'EC080';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'name invalid' using errcode = '22023';
  end if;
  if not app.api_permissions_valid(p_permissions) or not app.api_scope_valid(p_scope) then
    raise exception 'permissions invalid' using errcode = '22023';
  end if;

  update public.api_keys k
     set name = btrim(p_name), permissions = p_permissions, scope = p_scope
   where k.id = p_id and k.class_id = v_class;

  delete from public.api_key_members m where m.key_id = p_id;
  if coalesce(cardinality(p_member_ids), 0) > 0 then
    insert into public.api_key_members (key_id, class_id, user_id)
    select p_id, v_class, m2.user_id
    from public.memberships m2
    where m2.class_id = v_class
      and m2.user_id = any (p_member_ids)
      and m2.status = 'active'
    on conflict do nothing;
  end if;
end $$;

create function public.set_api_key_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
begin
  if (select auth.uid()) is null or not app.has_permission(v_class, 'class.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'status invalid' using errcode = '22023';
  end if;
  update public.api_keys k
     set status = p_status
   where k.id = p_id and k.class_id = v_class and k.status <> 'revoked';
  if not found then raise exception 'key not found' using errcode = 'P0002'; end if;
end $$;

create function public.revoke_api_key(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
begin
  if (select auth.uid()) is null or not app.has_permission(v_class, 'class.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.api_keys k
     set status = 'revoked', revoked_at = coalesce(k.revoked_at, now())
   where k.id = p_id and k.class_id = v_class;
  if not found then raise exception 'key not found' using errcode = 'P0002'; end if;
end $$;

create function public.delete_api_key(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
begin
  if (select auth.uid()) is null or not app.has_permission(v_class, 'class.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.api_keys k
   where k.id = p_id and k.class_id = v_class and k.status = 'revoked';
  if not found then raise exception 'key not found' using errcode = 'P0002'; end if;
end $$;

-- Kuota per menit. UPDATE ... RETURNING mengunci baris, jadi dua request paralel
-- tidak bisa melampaui batas karena sama-sama membaca nilai lama.
create function public.consume_api_quota(p_key_id uuid, p_limit int default 120)
returns table (allowed boolean, remaining int)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 120), 1), 10000);
  v_count int;
begin
  update public.api_keys k
     set quota_count = case
           when k.quota_window < date_trunc('minute', now()) then 1
           else k.quota_count + 1 end,
         quota_window = case
           when k.quota_window < date_trunc('minute', now()) then now()
           else k.quota_window end,
         last_used_at = now()
   where k.id = p_key_id and k.status = 'active'
   returning k.quota_count into v_count;

  if v_count is null then
    return query select false, 0;
  end if;
  return query select v_count <= v_limit, greatest(v_limit - v_count, 0);
end $$;

-- HAK AKSES ---------------------------------------------------------------
revoke all on public.api_keys, public.api_key_members, public.api_audit_log
  from anon, authenticated;

grant select (id, class_id, name, prefix, permissions, scope, status, created_by,
              created_at, updated_at, last_used_at, revoked_at)
  on public.api_keys to authenticated;
grant select on public.api_key_members to authenticated;
grant select on public.api_audit_log to authenticated;

alter table public.api_keys enable row level security;
alter table public.api_key_members enable row level security;
alter table public.api_audit_log enable row level security;

create policy api_keys_select on public.api_keys for select to authenticated
  using (app.has_permission(class_id, 'class.manage'));

create policy api_key_members_select on public.api_key_members for select to authenticated
  using (app.has_permission(class_id, 'class.manage')
         and exists (select 1 from public.api_keys k
                     where k.id = key_id and k.class_id = api_key_members.class_id));

create policy api_audit_log_select on public.api_audit_log for select to authenticated
  using (app.has_permission(class_id, 'class.manage'));

revoke all on function public.create_api_key(text, text, text, jsonb, jsonb, uuid[]),
                       public.update_api_key(uuid, text, jsonb, jsonb, uuid[]),
                       public.set_api_key_status(uuid, text),
                       public.revoke_api_key(uuid),
                       public.delete_api_key(uuid),
                       public.consume_api_quota(uuid, int)
  from public, anon, authenticated;

grant execute on function public.create_api_key(text, text, text, jsonb, jsonb, uuid[]),
                         public.update_api_key(uuid, text, jsonb, jsonb, uuid[]),
                         public.set_api_key_status(uuid, text),
                         public.revoke_api_key(uuid),
                         public.delete_api_key(uuid)
  to authenticated;

-- Hanya server (service role) yang boleh memakai kuota. Bila role tidak ada di
-- instance pengujian, grant dilewati agar migrasi tetap bisa diterapkan.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.consume_api_quota(uuid, int) to service_role;
    grant insert, select on public.api_audit_log to service_role;
    grant select on public.api_keys, public.api_key_members to service_role;
  end if;
end $$;
