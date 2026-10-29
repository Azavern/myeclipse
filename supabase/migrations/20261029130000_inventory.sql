-- Migration 0017 — Inventory pribadi dan inv_key.
--
-- Inventory adalah daftar tautan milik satu anggota. Tidak ada halaman jelajah
-- untuk anggota lain: satu-satunya jalan melihat inventory orang lain adalah
-- inv_key yang dibuat pemiliknya sendiri dari /inventory.
--
-- Aturan penting:
--   * Setiap key tepat 16 karakter, unik secara global, dan disimpan kapital
--     agar key yang diketik dengan huruf kecil di perangkat lain tetap cocok.
--   * Masa aktif: 24 jam, 7 hari, 1 bulan, 6 bulan, atau tanpa kedaluwarsa.
--   * Setiap anggota maksimal menghasilkan 12 key SEUMUR HIDUP. Mencabut key
--     tidak mengembalikan jatah; baris key tetap disimpan sebagai riwayat.
--   * Key mati bila dicabut, kedaluwarsa, atau pemiliknya bukan anggota aktif.
--   * URL hanya divalidasi diawali `https://` (sesuai permintaan produk).

-- TABEL -----------------------------------------------------------------------
create table public.inventory_items (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  owner_id   uuid not null,
  url        text not null check (
    left(url, 8) = 'https://' and char_length(url) between 8 and 2048),
  created_at timestamptz not null default now(),
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade
);

create table public.inventory_keys (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null,
  owner_id   uuid not null,
  token      text not null check (token ~ '^[A-Z0-9_-]{16}$'),
  ttl        text not null check (ttl in ('24h', '7d', '1m', '6m', 'never')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((ttl = 'never') = (expires_at is null)),
  foreign key (class_id, owner_id)
    references public.memberships (class_id, user_id) on delete cascade
);

-- Pencarian publik hanya memakai token, tanpa class, jadi token unik global.
create unique index inventory_keys_token_uq on public.inventory_keys (token);
create index inventory_items_owner_idx
  on public.inventory_items (class_id, owner_id, created_at desc);
create index inventory_keys_owner_idx
  on public.inventory_keys (class_id, owner_id, created_at desc);

-- RPC: BUAT DAN CABUT KEY ------------------------------------------------------
-- Pemilik memilih key sendiri (16 karakter) atau membiarkannya kosong untuk
-- key acak. Kunci baris keanggotaan pemilik men-serialisasi pemeriksaan kuota.
create function public.create_inventory_key(p_token text default null, p_ttl text default '7d')
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_token text;
  v_expires timestamptz;
  v_used int;
  v_id uuid;
  v_raw text;
  i int;
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_ttl is null or p_ttl not in ('24h', '7d', '1m', '6m', 'never') then
    raise exception 'ttl not allowed' using errcode = '22023';
  end if;
  v_expires := case p_ttl
    when '24h' then now() + interval '24 hours'
    when '7d'  then now() + interval '7 days'
    when '1m'  then now() + interval '1 month'
    when '6m'  then now() + interval '6 months'
    else null
  end;

  if p_token is not null and btrim(p_token) <> '' then
    v_token := upper(btrim(p_token));
    if v_token !~ '^[A-Z0-9_-]{16}$' then
      raise exception 'key format invalid' using errcode = 'EC072';
    end if;
  else
    -- 16 karakter dari 32 simbol (tanpa 0/O/1/I/L) = 80 bit acak.
    v_raw := replace(gen_random_uuid()::text, '-', '');
    v_token := '';
    for i in 1..16 loop
      v_token := v_token || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        1 + (get_byte(decode(v_raw, 'hex'), i - 1) % 32), 1);
    end loop;
  end if;

  perform 1 from public.memberships m
   where m.class_id = v_class and m.user_id = v_uid
     for update;

  select count(*) into v_used from public.inventory_keys k
   where k.class_id = v_class and k.owner_id = v_uid;
  if v_used >= 12 then
    raise exception 'inventory key quota exhausted' using errcode = 'EC070';
  end if;

  insert into public.inventory_keys (class_id, owner_id, token, ttl, expires_at)
  values (v_class, v_uid, v_token, p_ttl, v_expires);

  select k.id into v_id from public.inventory_keys k
   where k.class_id = v_class and k.owner_id = v_uid and k.token = v_token;
  return query select v_id, v_token, v_expires;
end $$;

create function public.revoke_inventory_key(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.inventory_keys k
     set revoked_at = now()
   where k.id = p_id and k.class_id = v_class and k.owner_id = v_uid
     and k.revoked_at is null;
  if not found then
    raise exception 'key not found' using errcode = 'P0002';
  end if;
end $$;

-- RPC: BUKA INVENTORY DENGAN KEY (publik, tanpa login) -------------------------
-- Fungsi ini satu-satunya jalur baca inventory orang lain. Tidak pernah
-- membocorkan apakah key ada tetapi mati: semua kegagalan menghasilkan nol baris.
-- Nama pemilik hanya ikut bila halaman Anggota memang terlihat oleh pemanggil.
create function public.get_inventory_by_key(p_key text)
returns table (
  owner_name text,
  expires_at timestamptz,
  item_id uuid,
  url text,
  item_created_at timestamptz,
  item_count int)
language sql stable security definer set search_path = '' as $$
  with target as (
    select k.id, k.class_id, k.owner_id, k.expires_at
    from public.inventory_keys k
    join public.memberships m
      on m.class_id = k.class_id and m.user_id = k.owner_id
     and m.status = 'active'
    where k.token = upper(btrim(coalesce(p_key, '')))
      and char_length(upper(btrim(coalesce(p_key, '')))) = 16
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
  ), visible_items as (
    select i.*
    from public.inventory_items i
    join target t on t.class_id = i.class_id and t.owner_id = i.owner_id
    order by i.created_at desc, i.id
    limit 500
  ), counted as (
    select count(*)::int as n from visible_items
  )
  select
    case when app.can_view(t.class_id, 'page.members') then mp.full_name end,
    t.expires_at,
    vi.id,
    vi.url,
    vi.created_at,
    c.n
  from target t
  cross join counted c
  left join visible_items vi on true
  left join public.member_profiles mp
    on mp.class_id = t.class_id and mp.user_id = t.owner_id
  order by vi.created_at desc nulls last, vi.id
$$;

-- HAK AKSES ------------------------------------------------------------------
revoke all on public.inventory_items, public.inventory_keys from anon, authenticated;

-- Item ditulis langsung oleh pemilik di bawah RLS; key hanya lewat RPC supaya
-- kuota, format, dan pencabutan tidak bisa dilewati lewat PostgREST.
grant select, insert, delete on public.inventory_items to authenticated;
grant select on public.inventory_keys to authenticated;

alter table public.inventory_items enable row level security;
alter table public.inventory_keys enable row level security;

create policy inventory_items_select on public.inventory_items for select
  to authenticated using (
    owner_id = (select auth.uid()) and app.is_active_member(class_id));
create policy inventory_items_insert on public.inventory_items for insert
  to authenticated with check (
    owner_id = (select auth.uid())
    and class_id = app.current_class_id()
    and app.is_active_member(class_id));
create policy inventory_items_delete on public.inventory_items for delete
  to authenticated using (
    owner_id = (select auth.uid()) and app.is_active_member(class_id));

create policy inventory_keys_select on public.inventory_keys for select
  to authenticated using (
    owner_id = (select auth.uid()) and app.is_active_member(class_id));

revoke all on function public.create_inventory_key(text, text),
                       public.revoke_inventory_key(uuid),
                       public.get_inventory_by_key(text)
  from public, anon, authenticated;
grant execute on function public.create_inventory_key(text, text),
                        public.revoke_inventory_key(uuid)
  to authenticated;
grant execute on function public.get_inventory_by_key(text)
  to anon, authenticated;
