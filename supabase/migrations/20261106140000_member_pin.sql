-- Migration 0031 — PIN 6 angka sebagai alternatif kata sandi.
--
-- PIN tidak pernah disimpan plaintext: Server Action menghitung scrypt
-- (N=16384, r=8, p=1, salt 16 byte) dan hanya hash-nya yang masuk tabel. Tabel
-- ini tidak punya grant untuk anon/authenticated dan tidak punya policy, jadi
-- PostgREST tidak bisa membacanya. Server Action memakai service role lewat
-- fungsi di bawah.
--
-- Lockout ditegakkan di database, bukan di memori instance: satu baris per
-- akun dikunci `for update`, percobaan dihitung sebelum verifikasi, dan lima
-- kegagalan mengunci PIN selama 15 menit. Ini yang membuat PIN 6 angka tidak
-- bisa dicoba berulang tanpa batas.

create table public.member_pins (
  user_id         uuid primary key,
  class_id        uuid not null,
  pin_hash        text not null
    check (pin_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{32,}$'),
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 10),
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (class_id, user_id)
    references public.memberships (class_id, user_id) on delete cascade
);

alter table public.member_pins enable row level security;

-- Tidak ada grant dan tidak ada policy: hanya service_role (bypass RLS) yang
-- menyentuh tabel, dan hanya lewat fungsi di bawah.
revoke all on public.member_pins from anon, authenticated;

-- HASIL: satu baris berisi hash dan status percobaan. `allowed = false`
-- berarti terkunci; `retry_after` hanya untuk diagnosa server, tidak
-- ditampilkan ke pengguna agar tidak membocorkan keberadaan akun.
create function public.pin_begin_by_user(p_user_id uuid)
returns table (pin_hash text, allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare
  v public.member_pins%rowtype;
begin
  select * into v from public.member_pins where user_id = p_user_id for update;
  if not found then
    return;
  end if;

  if v.locked_until is not null and v.locked_until > now() then
    return query select null::text, false,
      greatest(1, ceil(extract(epoch from (v.locked_until - now())))::integer);
    return;
  end if;

  -- Kunci yang sudah lewat waktunya membuka jendela baru.
  if v.locked_until is not null then
    update public.member_pins
       set failed_attempts = 0, locked_until = null, updated_at = now()
     where user_id = p_user_id
     returning * into v;
  end if;

  if v.failed_attempts >= 5 then
    update public.member_pins
       set locked_until = now() + interval '15 minutes', updated_at = now()
     where user_id = p_user_id;
    return query select null::text, false, 900;
    return;
  end if;

  update public.member_pins
     set failed_attempts = v.failed_attempts + 1, updated_at = now()
   where user_id = p_user_id
   returning * into v;

  return query select v.pin_hash, true, 0;
end $$;

create function public.pin_begin_by_email(p_email text)
returns table (user_id uuid, pin_hash text, allowed boolean, retry_after integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select u.id into v_user
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
   limit 1;
  if v_user is null then
    return;
  end if;
  return query
    select v_user, b.pin_hash, b.allowed, b.retry_after
      from public.pin_begin_by_user(v_user) b;
end $$;

create function public.pin_finish(p_user_id uuid, p_success boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.member_pins
     set failed_attempts = case when p_success then 0 else failed_attempts end,
         locked_until = case
           when p_success then null
           when failed_attempts >= 5 then now() + interval '15 minutes'
           else locked_until
         end,
         updated_at = now()
   where user_id = p_user_id;
end $$;

create function public.pin_set(p_user_id uuid, p_pin_hash text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid;
begin
  if p_pin_hash !~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{32,}$' then
    raise exception 'pin hash invalid' using errcode = '22023';
  end if;

  select m.class_id into v_class
    from public.memberships m
   where m.user_id = p_user_id and m.status = 'active'
   limit 1;
  if v_class is null then
    raise exception 'member not active' using errcode = 'EC081';
  end if;

  insert into public.member_pins (user_id, class_id, pin_hash)
  values (p_user_id, v_class, p_pin_hash)
  on conflict (user_id) do update
    set class_id = excluded.class_id,
        pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now();
end $$;

create function public.pin_remove(p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.member_pins where user_id = p_user_id;
end $$;

-- Dipakai halaman Keamanan akun. Hanya mengembalikan ada/tidak, bukan hash.
create function public.pin_status()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member_pins where user_id = (select auth.uid())
  );
$$;

revoke all on function public.pin_begin_by_user(uuid) from public, anon, authenticated;
revoke all on function public.pin_begin_by_email(text) from public, anon, authenticated;
revoke all on function public.pin_finish(uuid, boolean) from public, anon, authenticated;
revoke all on function public.pin_set(uuid, text) from public, anon, authenticated;
revoke all on function public.pin_remove(uuid) from public, anon, authenticated;
revoke all on function public.pin_status() from public, anon;

grant execute on function public.pin_begin_by_user(uuid) to service_role;
grant execute on function public.pin_begin_by_email(text) to service_role;
grant execute on function public.pin_finish(uuid, boolean) to service_role;
grant execute on function public.pin_set(uuid, text) to service_role;
grant execute on function public.pin_remove(uuid) to service_role;
grant execute on function public.pin_status() to authenticated;
