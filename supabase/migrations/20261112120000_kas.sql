-- Migration 0034 — Kas Kelas (Tahap 1).
--
-- Mencatat iuran dan kas kelas tanpa pembayaran online. Saldo hanya berubah
-- dari transaksi aktif; pengajuan anggota tidak menambah saldo sampai
-- diverifikasi pemegang `kas.manage`.
--
-- Peran:
--   * `kas.manage` (bawaan Bendahara): membuat tagihan, memverifikasi pengajuan,
--     mencatat transaksi, mengelola QRIS, dan membatalkan catatan.
--   * Ketua: membaca semua (termasuk bukti/nota) tetapi tidak otomatis mengelola.
--   * Anggota aktif: saldo, ringkasan, transaksi, QRIS, dan status iurannya sendiri.
--   * Tamu: tidak punya grant maupun policy kas; halaman dibatasi `class_member`.
--
-- Tidak ada DELETE untuk catatan keuangan. Koreksi dilakukan dengan pembatalan
-- beralasan yang tetap terlihat.

-- IZIN -----------------------------------------------------------------------
alter table public.roles drop constraint roles_permissions_check;
alter table public.roles add constraint roles_permissions_check
  check (permissions <@ array['class.manage','members.manage','schedule.manage',
                              'events.manage','tasks.manage','members.request',
                              'kas.manage']::text[]);

-- Bendahara adalah pemegang bawaan. Ketua sengaja tidak diberi `kas.manage`
-- agar tetap baca-saja; Ketua tetap dapat memberikannya ke jabatan lain.
update public.roles r
   set permissions = array_append(r.permissions, 'kas.manage')
 where r.key = 'bendahara' and not ('kas.manage' = any (r.permissions));

-- Satu-satunya izin yang bisa diatur lewat checklist adalah izin di bawah.
create or replace function public.set_role_access(
  p_role_id uuid, p_permission text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class uuid := app.current_class_id(); v_key text;
begin
  if not app.has_permission(v_class, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_permission not in ('class.manage','schedule.manage','events.manage',
                          'tasks.manage','members.request','kas.manage') then
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

-- VISIBILITAS ----------------------------------------------------------------
-- Kas hanya untuk anggota aktif. Ketua masih dapat mempersempit halaman lewat
-- /settings/visibility, tetapi tidak dapat membukanya untuk tamu.
insert into public.visibility_catalog
  (key, kind, scope, parent_key, default_audience, widest_audience)
values ('page.kas', 'page', 'class', null, 'class_member', 'class_member')
on conflict (key) do nothing;

-- TABEL ----------------------------------------------------------------------
create table public.kas_settings (
  class_id   uuid primary key references public.classes (id) on delete cascade,
  qris_path  text check (qris_path is null or char_length(qris_path) between 1 and 512),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.kas_settings (class_id)
select id from public.classes
on conflict (class_id) do nothing;

create table public.kas_bills (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  amount        integer not null check (amount between 1 and 100000000),
  due_on        date not null,
  status        text not null default 'open'
                check (status in ('open','closed','cancelled')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  closed_at     timestamptz,
  cancelled_by  uuid references auth.users (id) on delete set null,
  cancelled_at  timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 1 and 200),
  unique (class_id, id)
);
create index kas_bills_class_status_idx on public.kas_bills (class_id, status, created_at desc);

create table public.kas_bill_members (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null,
  bill_id          uuid not null,
  user_id          uuid references auth.users (id) on delete set null,
  member_name      text not null check (char_length(member_name) between 1 and 80),
  status           text not null default 'unpaid'
                   check (status in ('unpaid','pending','paid','rejected')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 200),
  rejected_at      timestamptz,
  paid_at          timestamptz,
  added_by         uuid references auth.users (id) on delete set null,
  added_at         timestamptz not null default now(),
  unique (class_id, id),
  unique (bill_id, user_id),
  foreign key (class_id, bill_id) references public.kas_bills (class_id, id) on delete cascade,
  check (status <> 'rejected' or rejection_reason is not null)
);
create index kas_bill_members_bill_idx on public.kas_bill_members (bill_id, status, added_at);
create index kas_bill_members_user_idx on public.kas_bill_members (class_id, user_id, status);

create table public.kas_submissions (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes (id) on delete cascade,
  bill_member_id   uuid references public.kas_bill_members (id) on delete restrict,
  user_id          uuid references auth.users (id) on delete set null,
  member_name      text not null check (char_length(member_name) between 1 and 80),
  kind             text not null check (kind in ('bill','deposit')),
  amount           integer not null check (amount between 1 and 100000000),
  method           text not null check (method in ('cash','transfer','qris')),
  note             text check (note is null or char_length(note) between 1 and 200),
  proof_path       text check (proof_path is null or char_length(proof_path) between 1 and 512),
  status           text not null default 'pending'
                   check (status in ('pending','approved','rejected','cancelled')),
  late             boolean not null default false,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) between 1 and 200),
  submitted_at     timestamptz not null default now(),
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_at      timestamptz,
  check ((kind = 'bill' and bill_member_id is not null)
      or (kind = 'deposit' and bill_member_id is null)),
  check (kind = 'bill' or method = 'qris'),
  check (status <> 'rejected' or rejection_reason is not null)
);
-- Satu pengajuan menunggu per tagihan anggota; pengajuan umum boleh beberapa.
create unique index kas_submissions_pending_bill_uq
  on public.kas_submissions (bill_member_id)
  where status = 'pending' and bill_member_id is not null;
create index kas_submissions_pending_idx
  on public.kas_submissions (class_id, status, submitted_at desc);
create index kas_submissions_user_idx
  on public.kas_submissions (class_id, user_id, submitted_at desc);

create table public.kas_transactions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,
  direction      text not null check (direction in ('income','expense')),
  amount         integer not null check (amount between 1 and 100000000),
  category       text not null
                 check (category in ('Iuran','Donasi','Konsumsi','Perlengkapan','Lainnya')),
  description    text not null check (char_length(description) between 1 and 200),
  occurred_on    date not null,
  source         text not null check (source in ('contribution','deposit','manual')),
  bill_member_id uuid references public.kas_bill_members (id) on delete set null,
  submission_id  uuid references public.kas_submissions (id) on delete set null,
  status         text not null default 'active' check (status in ('active','cancelled')),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  cancelled_by   uuid references auth.users (id) on delete set null,
  cancelled_at   timestamptz,
  cancel_reason  text check (cancel_reason is null or char_length(cancel_reason) between 1 and 200),
  check (
    (source = 'manual' and bill_member_id is null and submission_id is null)
    or (source = 'contribution' and direction = 'income'
        and bill_member_id is not null and category = 'Iuran')
    or (source = 'deposit' and direction = 'income'
        and bill_member_id is null and submission_id is not null)
  ),
  check (status <> 'cancelled' or cancel_reason is not null)
);
-- Satu pemasukan aktif per iuran; transaksi batal tidak menahan slot.
create unique index kas_transactions_active_contribution_uq
  on public.kas_transactions (bill_member_id)
  where source = 'contribution' and status = 'active';
create unique index kas_transactions_submission_uq
  on public.kas_transactions (submission_id) where submission_id is not null;
create index kas_transactions_class_date_idx
  on public.kas_transactions (class_id, occurred_on desc, created_at desc);
create index kas_transactions_status_idx
  on public.kas_transactions (class_id, status, occurred_on desc);

-- Nota transaksi manual disimpan terpisah agar path tidak pernah masuk ke daftar
-- transaksi yang dibaca anggota. Hanya pengunggah dan pembaca-penuh (Ketua /
-- pemegang kas.manage) yang dapat membaca barisnya.
create table public.kas_receipts (
  transaction_id uuid primary key references public.kas_transactions (id) on delete cascade,
  class_id       uuid not null references public.classes (id) on delete cascade,
  path           text not null unique check (char_length(path) between 1 and 512),
  uploaded_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create table public.kas_audit (
  id          bigserial primary key,
  class_id    uuid not null references public.classes (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null check (char_length(action) between 1 and 64),
  entity_type text not null check (entity_type in ('bill','bill_member','submission','transaction','settings')),
  entity_id   uuid not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index kas_audit_class_time_idx on public.kas_audit (class_id, created_at desc);

-- HELPER ---------------------------------------------------------------------
-- `kas.manage` atau Ketua; hanya anggota aktif yang dihitung. Dipakai untuk
-- membaca semua status/bukti, bukan untuk menulis.
create function app.kas_can_read_all(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member(p_class)
     and (app.has_permission(p_class, 'kas.manage')
          or exists (
            select 1 from public.memberships m
            join public.roles r on r.class_id = m.class_id and r.id = m.role_id
            where m.class_id = p_class and m.user_id = (select auth.uid())
              and m.status = 'active' and r.key = 'ketua'))
$$;

create function app.kas_can_view(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_active_member(p_class) and app.can_view(p_class, 'page.kas')
$$;

create function app.kas_today(p_class uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone c.timezone)::date from public.classes c where c.id = p_class
$$;

create function app.kas_valid_media_path(
  p_class uuid, p_owner uuid, p_folder text, p_path text)
returns boolean language sql immutable as $$
  select p_path is not null
     and p_folder in ('proofs','receipts')
     and p_path ~ ('^' || p_class::text || '/' || p_folder || '/' || p_owner::text
                   || '/[0-9a-f-]{36}[.](jpg|png|webp)$')
$$;

create function app.kas_valid_qris_path(p_class uuid, p_path text)
returns boolean language sql immutable as $$
  select p_path is not null
     and p_path ~ ('^' || p_class::text || '/qris/[0-9a-f-]{36}[.](jpg|png|webp)$')
$$;

create function app.kas_log(
  p_class uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.kas_audit (class_id, actor_id, action, entity_type, entity_id, meta)
  values (p_class, (select auth.uid()), p_action, p_entity_type, p_entity_id, p_meta)
$$;

-- Tagihan ditutup otomatis hanya bila sudah ada penerima dan semuanya Lunas.
-- Tagihan batal tidak pernah dibuka kembali.
create function app.kas_maybe_close_bill(p_class uuid, p_bill uuid)
returns void language sql security definer set search_path = '' as $$
  update public.kas_bills b
     set status = 'closed', closed_at = now(), updated_at = now()
   where b.class_id = p_class and b.id = p_bill and b.status = 'open'
     and exists (select 1 from public.kas_bill_members bm where bm.bill_id = p_bill)
     and not exists (select 1 from public.kas_bill_members bm
                     where bm.bill_id = p_bill and bm.status <> 'paid')
$$;

-- BACAAN ---------------------------------------------------------------------
create function public.get_kas_access()
returns table (can_manage boolean, can_read_all boolean)
language sql stable security definer set search_path = '' as $$
  with v as (select app.current_class_id() as class_id)
  select app.kas_can_view(v.class_id) and app.has_permission(v.class_id, 'kas.manage'),
         app.kas_can_view(v.class_id) and app.kas_can_read_all(v.class_id)
  from v
$$;

create function public.get_kas_summary()
returns table (
  balance bigint, month_income bigint, month_expense bigint,
  own_unpaid integer, own_pending integer, pending_verifications integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_today date;
  v_month date;
begin
  if not app.kas_can_view(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_today := app.kas_today(v_class);
  v_month := date_trunc('month', v_today)::date;

  return query select
    (select coalesce(sum(case when t.direction = 'income' then t.amount else -t.amount end), 0)::bigint
       from public.kas_transactions t
      where t.class_id = v_class and t.status = 'active'),
    (select coalesce(sum(t.amount), 0)::bigint
       from public.kas_transactions t
      where t.class_id = v_class and t.status = 'active' and t.direction = 'income'
        and t.occurred_on >= v_month and t.occurred_on < (v_month + interval '1 month')::date),
    (select coalesce(sum(t.amount), 0)::bigint
       from public.kas_transactions t
      where t.class_id = v_class and t.status = 'active' and t.direction = 'expense'
        and t.occurred_on >= v_month and t.occurred_on < (v_month + interval '1 month')::date),
    (select count(*)::int
       from public.kas_bill_members bm
       join public.kas_bills b on b.id = bm.bill_id and b.class_id = bm.class_id
      where bm.class_id = v_class and bm.user_id = v_uid and b.status = 'open'
        and bm.status in ('unpaid','rejected')),
    (select count(*)::int from public.kas_submissions s
      where s.class_id = v_class and s.user_id = v_uid and s.status = 'pending'),
    case when app.has_permission(v_class, 'kas.manage')
      then (select count(*)::int from public.kas_submissions s
             where s.class_id = v_class and s.status = 'pending')
      else 0 end;
end $$;

-- Hanya Ketua dan pemegang kas.manage yang boleh menerima daftar anggota untuk
-- pembuatan/penambahan tagihan. Nama tetap diperlukan untuk snapshot riwayat.
create function public.get_kas_members()
returns table (user_id uuid, full_name text, username text)
language plpgsql stable security definer set search_path = '' as $$
declare v_class uuid := app.current_class_id();
begin
  if not app.kas_can_view(v_class) or not app.kas_can_read_all(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.full_name, p.username
      from public.memberships m
      join public.member_profiles p
        on p.class_id = m.class_id and p.user_id = m.user_id
     where m.class_id = v_class and m.status = 'active'
     order by p.full_name;
end $$;

-- TULIS: TAGIHAN --------------------------------------------------------------
create function public.create_kas_bill(
  p_title text, p_amount integer, p_due_on date, p_user_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
  v_ids uuid[];
  v_open int;
  v_added int;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception 'title invalid' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'amount invalid' using errcode = '22023';
  end if;
  if p_due_on is null then
    raise exception 'due date required' using errcode = '22023';
  end if;

  -- Kunci kelas membuat dua pembuatan bersamaan tidak sama-sama melihat 23.
  perform 1 from public.classes c where c.id = v_class for update;
  select count(*) into v_open from public.kas_bills b
   where b.class_id = v_class and b.status = 'open';
  if v_open >= 24 then
    raise exception 'too many open bills' using errcode = 'EC100';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    select array_agg(m.user_id order by m.user_id) into v_ids
      from public.memberships m
     where m.class_id = v_class and m.status = 'active';
  else
    select array_agg(distinct u.user_id order by u.user_id) into v_ids
      from unnest(p_user_ids) as u(user_id);
    if exists (
      select 1 from unnest(v_ids) as u(user_id)
       where not exists (
         select 1 from public.memberships m
          where m.class_id = v_class and m.user_id = u.user_id and m.status = 'active')
    ) then
      raise exception 'invalid recipient' using errcode = 'EC101';
    end if;
  end if;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'no active recipients' using errcode = 'EC101';
  end if;

  insert into public.kas_bills (class_id, title, amount, due_on, created_by)
  values (v_class, v_title, p_amount, p_due_on, (select auth.uid()))
  returning id into v_id;

  insert into public.kas_bill_members (class_id, bill_id, user_id, member_name, added_by)
  select v_class, v_id, m.user_id, coalesce(p.full_name, m.user_id::text), (select auth.uid())
    from public.memberships m
    join public.member_profiles p
      on p.class_id = m.class_id and p.user_id = m.user_id
   where m.class_id = v_class and m.user_id = any (v_ids) and m.status = 'active'
  on conflict (bill_id, user_id) do nothing;
  get diagnostics v_added = row_count;
  if v_added = 0 then
    raise exception 'no recipients inserted' using errcode = 'EC101';
  end if;

  perform app.kas_log(v_class, 'bill.create', 'bill', v_id,
                      jsonb_build_object('recipients', v_added));
  return v_id;
end $$;

create function public.add_kas_bill_members(p_bill_id uuid, p_user_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_bill public.kas_bills%rowtype;
  v_added int := 0;
  v_open int;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;

  select * into v_bill from public.kas_bills b
   where b.class_id = v_class and b.id = p_bill_id for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  if v_bill.status = 'cancelled' then
    raise exception 'bill cancelled' using errcode = 'EC106';
  end if;
  if exists (
    select 1 from unnest(p_user_ids) as u(user_id)
     where not exists (
       select 1 from public.memberships m
        where m.class_id = v_class and m.user_id = u.user_id and m.status = 'active')
  ) then
    raise exception 'invalid recipient' using errcode = 'EC101';
  end if;

  insert into public.kas_bill_members (class_id, bill_id, user_id, member_name, added_by)
  select v_class, p_bill_id, m.user_id, coalesce(p.full_name, m.user_id::text), (select auth.uid())
    from public.memberships m
    join public.member_profiles p
      on p.class_id = m.class_id and p.user_id = m.user_id
   where m.class_id = v_class and m.user_id = any (p_user_ids) and m.status = 'active'
  on conflict (bill_id, user_id) do nothing;
  get diagnostics v_added = row_count;

  -- Tagihan yang sudah tertutup harus dibuka lagi bila benar-benar ada anggota
  -- baru. Bila semua pilihan sudah menjadi penerima, status tidak diubah.
  if v_added > 0 and v_bill.status = 'closed' then
    perform 1 from public.classes c where c.id = v_class for update;
    select count(*) into v_open from public.kas_bills b
     where b.class_id = v_class and b.status = 'open';
    if v_open >= 24 then
      raise exception 'too many open bills' using errcode = 'EC100';
    end if;
    update public.kas_bills
       set status = 'open', closed_at = null, updated_at = now()
     where id = p_bill_id;
  end if;

  if v_added > 0 then
    perform app.kas_log(v_class, 'bill.add_members', 'bill', p_bill_id,
                        jsonb_build_object('added', v_added));
  end if;
  return v_added;
end $$;

create function public.cancel_kas_bill(p_bill_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_bill public.kas_bills%rowtype;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 1 and 200 then
    raise exception 'reason invalid' using errcode = '22023';
  end if;
  select * into v_bill from public.kas_bills b
   where b.class_id = v_class and b.id = p_bill_id for update;
  if not found then raise exception 'bill not found' using errcode = 'P0002'; end if;
  if v_bill.status = 'cancelled' then
    raise exception 'bill already cancelled' using errcode = 'EC107';
  end if;

  update public.kas_submissions s
     set status = 'cancelled', reviewed_by = (select auth.uid()), reviewed_at = now(),
         rejection_reason = null
   where s.class_id = v_class and s.status in ('pending','approved')
     and s.bill_member_id in (
       select bm.id from public.kas_bill_members bm where bm.bill_id = p_bill_id);
  update public.kas_bill_members bm
     set status = 'unpaid', paid_at = null, rejection_reason = null, rejected_at = null
   where bm.bill_id = p_bill_id and bm.status in ('pending','paid','rejected');

  update public.kas_transactions t
     set status = 'cancelled', cancelled_by = (select auth.uid()),
         cancelled_at = now(), cancel_reason = left('Tagihan dibatalkan: ' || v_reason, 200)
   where t.class_id = v_class and t.source = 'contribution' and t.status = 'active'
     and exists (
       select 1 from public.kas_bill_members bm
        where bm.id = t.bill_member_id and bm.bill_id = p_bill_id);

  update public.kas_bills
     set status = 'cancelled', cancelled_by = (select auth.uid()),
         cancelled_at = now(), cancel_reason = v_reason,
         closed_at = null, updated_at = now()
   where id = p_bill_id;

  perform app.kas_log(v_class, 'bill.cancel', 'bill', p_bill_id,
                      jsonb_build_object('reason_present', true));
end $$;

-- TULIS: PENGAJUAN ANGGOTA ----------------------------------------------------
create function public.submit_kas_bill_payment(
  p_bill_member_id uuid, p_amount integer, p_method text,
  p_note text, p_proof_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_bm public.kas_bill_members%rowtype;
  v_bill public.kas_bills%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_late boolean;
  v_exists_pending boolean;
begin
  if not app.kas_can_view(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash','transfer','qris') then
    raise exception 'method invalid' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'note invalid' using errcode = '22023';
  end if;
  if p_proof_path is not null and not app.kas_valid_media_path(v_class, v_uid, 'proofs', p_proof_path) then
    raise exception 'proof invalid' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'amount invalid' using errcode = '22023';
  end if;

  select bm.* into v_bm
    from public.kas_bill_members bm
   where bm.class_id = v_class and bm.id = p_bill_member_id
   for update;
  if not found or v_bm.user_id is distinct from v_uid then
    raise exception 'bill member not found' using errcode = 'P0002';
  end if;
  -- Kunci tagihan ikut diambil agar pembatalan tagihan tidak bisa berlomba
  -- dengan pengajuan yang baru masuk.
  select b.* into v_bill from public.kas_bills b
   where b.class_id = v_class and b.id = v_bm.bill_id for update;
  if v_bill.status <> 'open' then
    raise exception 'bill not open' using errcode = 'EC106';
  end if;
  if v_bm.status = 'paid' then
    raise exception 'already paid' using errcode = 'EC105';
  end if;
  if v_bm.status = 'pending' then
    raise exception 'already pending' using errcode = 'EC103';
  end if;
  if p_amount <> v_bill.amount then
    raise exception 'amount mismatch' using errcode = '22023';
  end if;
  if p_method = 'qris' and not exists (
    select 1 from public.kas_settings s
     where s.class_id = v_class and s.qris_path is not null)
  then
    raise exception 'qris not available' using errcode = 'EC108';
  end if;

  select exists (
    select 1 from public.kas_submissions s
     where s.bill_member_id = p_bill_member_id and s.status = 'pending')
    into v_exists_pending;
  if v_exists_pending then
    raise exception 'already pending' using errcode = 'EC103';
  end if;

  v_late := app.kas_today(v_class) > v_bill.due_on;
  insert into public.kas_submissions
    (class_id, bill_member_id, user_id, member_name, kind, amount, method, note,
     proof_path, late)
  values
    (v_class, p_bill_member_id, v_uid, v_bm.member_name, 'bill', v_bill.amount,
     p_method, v_note, p_proof_path, v_late)
  returning id into v_id;

  update public.kas_bill_members
     set status = 'pending', rejection_reason = null, rejected_at = null,
         paid_at = null
   where id = p_bill_member_id;

  perform app.kas_log(v_class, 'submission.create', 'submission', v_id,
                      jsonb_build_object('amount', v_bill.amount, 'method', p_method));
  return v_id;
end $$;

create function public.submit_kas_deposit(
  p_amount integer, p_note text, p_proof_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if not app.kas_can_view(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'amount invalid' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'note invalid' using errcode = '22023';
  end if;
  if p_proof_path is not null and not app.kas_valid_media_path(v_class, v_uid, 'proofs', p_proof_path) then
    raise exception 'proof invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.kas_settings s
     where s.class_id = v_class and s.qris_path is not null)
  then
    raise exception 'qris not available' using errcode = 'EC108';
  end if;
  select p.full_name into v_name from public.member_profiles p
   where p.class_id = v_class and p.user_id = v_uid;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;

  insert into public.kas_submissions
    (class_id, bill_member_id, user_id, member_name, kind, amount, method, note,
     proof_path)
  values
    (v_class, null, v_uid, v_name, 'deposit', p_amount, 'qris', v_note, p_proof_path)
  returning id into v_id;

  perform app.kas_log(v_class, 'submission.create', 'submission', v_id,
                      jsonb_build_object('amount', p_amount, 'kind', 'deposit'));
  return v_id;
end $$;

-- TULIS: VERIFIKASI -----------------------------------------------------------
create function public.review_kas_submission(
  p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_sub public.kas_submissions%rowtype;
  v_bm public.kas_bill_members%rowtype;
  v_bill public.kas_bills%rowtype;
  v_tx uuid;
  v_today date;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_sub from public.kas_submissions s
   where s.class_id = v_class and s.id = p_id for update;
  if not found then raise exception 'submission not found' using errcode = 'P0002'; end if;
  if v_sub.status <> 'pending' then
    raise exception 'submission already decided' using errcode = 'EC104';
  end if;

  if not p_approve then
    if v_reason is null or char_length(v_reason) > 200 then
      raise exception 'reason invalid' using errcode = '22023';
    end if;
    update public.kas_submissions
       set status = 'rejected', rejection_reason = v_reason,
           reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = p_id;
    if v_sub.bill_member_id is not null then
      update public.kas_bill_members
         set status = 'rejected', rejection_reason = v_reason, rejected_at = now()
       where id = v_sub.bill_member_id;
    end if;
    perform app.kas_log(v_class, 'submission.reject', 'submission', p_id,
                        jsonb_build_object('reason_present', true));
    return;
  end if;

  v_today := app.kas_today(v_class);
  if v_sub.kind = 'bill' then
    select * into v_bm from public.kas_bill_members bm
     where bm.class_id = v_class and bm.id = v_sub.bill_member_id for update;
    if not found then raise exception 'bill member not found' using errcode = 'P0002'; end if;
    if v_bm.status = 'paid' then raise exception 'already paid' using errcode = 'EC105'; end if;
    if v_bm.status <> 'pending' then raise exception 'not pending' using errcode = 'EC104'; end if;
    select * into v_bill from public.kas_bills b
     where b.class_id = v_class and b.id = v_bm.bill_id;
    if v_bill.status <> 'open' then
      raise exception 'bill not open' using errcode = 'EC106';
    end if;

    update public.kas_submissions
       set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = p_id;
    update public.kas_bill_members
       set status = 'paid', paid_at = now(), rejection_reason = null, rejected_at = null
     where id = v_bm.id;

    begin
      insert into public.kas_transactions
        (class_id, direction, amount, category, description, occurred_on, source,
         bill_member_id, submission_id, created_by)
      values
        (v_class, 'income', v_sub.amount, 'Iuran', left('Iuran ' || v_bill.title, 200),
         v_today, 'contribution', v_bm.id, p_id, (select auth.uid()))
      returning id into v_tx;
    exception when unique_violation then
      raise exception 'income already recorded' using errcode = 'EC105';
    end;

    perform app.kas_maybe_close_bill(v_class, v_bill.id);
    perform app.kas_log(v_class, 'submission.approve', 'submission', p_id,
                        jsonb_build_object('amount', v_sub.amount, 'transaction', v_tx));
  else
    update public.kas_submissions
       set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = p_id;
    begin
      insert into public.kas_transactions
        (class_id, direction, amount, category, description, occurred_on, source,
         bill_member_id, submission_id, created_by)
      values
        (v_class, 'income', v_sub.amount, 'Lainnya',
         left('Setoran kas dari ' || v_sub.member_name, 200), v_today, 'deposit',
         null, p_id, (select auth.uid()))
      returning id into v_tx;
    exception when unique_violation then
      raise exception 'income already recorded' using errcode = 'EC105';
    end;
    perform app.kas_log(v_class, 'submission.approve', 'submission', p_id,
                        jsonb_build_object('amount', v_sub.amount, 'transaction', v_tx));
  end if;
end $$;

-- Menandai lunas tanpa pengajuan (mis. tunai). Bila ada pengajuan menunggu,
-- pengajuan itu yang disetujui agar bukti anggota tetap terhubung.
create function public.mark_kas_bill_member_paid(
  p_bill_member_id uuid, p_method text default 'cash')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_bm public.kas_bill_members%rowtype;
  v_bill public.kas_bills%rowtype;
  v_pending public.kas_submissions%rowtype;
  v_has_pending boolean := false;
  v_tx uuid;
  v_today date;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash','transfer','qris') then
    raise exception 'method invalid' using errcode = '22023';
  end if;

  -- Kunci baris tagihan anggota lebih dulu. Pengajuan baru juga mengunci baris
  -- ini, sehingga pengajuan yang masuk bersamaan tidak tertinggal sebagai
  -- pending setelah anggota ditandai lunas.
  select * into v_bm from public.kas_bill_members bm
   where bm.class_id = v_class and bm.id = p_bill_member_id for update;
  if not found then raise exception 'bill member not found' using errcode = 'P0002'; end if;
  select * into v_pending from public.kas_submissions s
   where s.class_id = v_class and s.bill_member_id = p_bill_member_id
     and s.status = 'pending' for update;
  v_has_pending := found;
  if v_bm.status = 'paid' then raise exception 'already paid' using errcode = 'EC105'; end if;
  select * into v_bill from public.kas_bills b
   where b.class_id = v_class and b.id = v_bm.bill_id;
  if v_bill.status <> 'open' then
    raise exception 'bill not open' using errcode = 'EC106';
  end if;
  v_today := app.kas_today(v_class);

  update public.kas_bill_members
     set status = 'paid', paid_at = now(), rejection_reason = null, rejected_at = null
   where id = v_bm.id;
  if v_has_pending then
    update public.kas_submissions
       set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = v_pending.id;
  end if;

  begin
    insert into public.kas_transactions
      (class_id, direction, amount, category, description, occurred_on, source,
       bill_member_id, submission_id, created_by)
    values
      (v_class, 'income', v_bill.amount, 'Iuran', left('Iuran ' || v_bill.title, 200),
       v_today, 'contribution', v_bm.id,
       case when v_has_pending then v_pending.id else null end, (select auth.uid()))
    returning id into v_tx;
  exception when unique_violation then
    raise exception 'income already recorded' using errcode = 'EC105';
  end;

  perform app.kas_maybe_close_bill(v_class, v_bill.id);
  perform app.kas_log(v_class, 'bill.mark_paid', 'bill_member', v_bm.id,
                      jsonb_build_object('amount', v_bill.amount, 'method', p_method));
end $$;

-- TULIS: TRANSAKSI MANUAL -----------------------------------------------------
create function public.create_kas_transaction(
  p_direction text, p_amount integer, p_category text, p_description text,
  p_occurred_on date, p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_desc text := btrim(coalesce(p_description, ''));
  v_id uuid;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('income','expense') then
    raise exception 'direction invalid' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'amount invalid' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('Iuran','Donasi','Konsumsi','Perlengkapan','Lainnya') then
    raise exception 'category invalid' using errcode = '22023';
  end if;
  if char_length(v_desc) not between 1 and 200 then
    raise exception 'description invalid' using errcode = '22023';
  end if;
  if p_occurred_on is null then
    raise exception 'date required' using errcode = '22023';
  end if;
  if p_receipt_path is not null and not app.kas_valid_media_path(v_class, v_uid, 'receipts', p_receipt_path) then
    raise exception 'receipt invalid' using errcode = '22023';
  end if;

  insert into public.kas_transactions
    (class_id, direction, amount, category, description, occurred_on, source, created_by)
  values
    (v_class, p_direction, p_amount, p_category, v_desc, p_occurred_on, 'manual', v_uid)
  returning id into v_id;

  if p_receipt_path is not null then
    insert into public.kas_receipts (transaction_id, class_id, path, uploaded_by)
    values (v_id, v_class, p_receipt_path, v_uid);
  end if;
  perform app.kas_log(v_class, 'transaction.create', 'transaction', v_id,
                      jsonb_build_object('amount', p_amount, 'direction', p_direction));
  return v_id;
end $$;

create function public.cancel_kas_transaction(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_tx public.kas_transactions%rowtype;
  v_bm public.kas_bill_members%rowtype;
  v_bill public.kas_bills%rowtype;
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 1 and 200 then
    raise exception 'reason invalid' using errcode = '22023';
  end if;
  select * into v_tx from public.kas_transactions t
   where t.class_id = v_class and t.id = p_id for update;
  if not found then raise exception 'transaction not found' using errcode = 'P0002'; end if;
  if v_tx.status <> 'active' then
    raise exception 'transaction already cancelled' using errcode = 'EC107';
  end if;

  update public.kas_transactions
     set status = 'cancelled', cancelled_by = (select auth.uid()),
         cancelled_at = now(), cancel_reason = v_reason
   where id = p_id;

  if v_tx.source = 'contribution' and v_tx.bill_member_id is not null then
    select * into v_bm from public.kas_bill_members bm
     where bm.class_id = v_class and bm.id = v_tx.bill_member_id for update;
    if found then
      update public.kas_bill_members
         set status = 'unpaid', paid_at = null, rejection_reason = null, rejected_at = null
       where id = v_bm.id;
      select * into v_bill from public.kas_bills b
       where b.class_id = v_class and b.id = v_bm.bill_id;
      if found and v_bill.status = 'closed' then
        update public.kas_bills
           set status = 'open', closed_at = null, updated_at = now()
         where id = v_bill.id;
      end if;
    end if;
    if v_tx.submission_id is not null then
      update public.kas_submissions
         set status = 'cancelled'
       where id = v_tx.submission_id and status = 'approved';
    end if;
  elsif v_tx.source = 'deposit' and v_tx.submission_id is not null then
    update public.kas_submissions
       set status = 'cancelled'
     where id = v_tx.submission_id and status = 'approved';
  end if;

  perform app.kas_log(v_class, 'transaction.cancel', 'transaction', p_id,
                      jsonb_build_object('reason_present', true));
end $$;

create function public.set_kas_qris(p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_class uuid := app.current_class_id();
begin
  if not app.kas_can_view(v_class) or not app.has_permission(v_class, 'kas.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_path is not null and not app.kas_valid_qris_path(v_class, p_path) then
    raise exception 'qris path invalid' using errcode = '22023';
  end if;
  insert into public.kas_settings (class_id, qris_path, updated_by, updated_at)
  values (v_class, p_path, (select auth.uid()), now())
  on conflict (class_id) do update
    set qris_path = excluded.qris_path, updated_by = excluded.updated_by,
        updated_at = now();
  perform app.kas_log(v_class, case when p_path is null then 'qris.remove' else 'qris.set' end,
                      'settings', v_class, '{}'::jsonb);
end $$;

-- RLS DAN HAK BACA ------------------------------------------------------------
revoke all on public.kas_settings, public.kas_bills, public.kas_bill_members,
              public.kas_submissions, public.kas_transactions, public.kas_receipts,
              public.kas_audit
  from anon, authenticated;

alter table public.kas_settings enable row level security;
alter table public.kas_bills enable row level security;
alter table public.kas_bill_members enable row level security;
alter table public.kas_submissions enable row level security;
alter table public.kas_transactions enable row level security;
alter table public.kas_receipts enable row level security;
alter table public.kas_audit enable row level security;

create policy kas_settings_select on public.kas_settings for select to authenticated
  using (app.kas_can_view(class_id));

create policy kas_bills_select on public.kas_bills for select to authenticated
  using (app.kas_can_view(class_id));

create policy kas_bill_members_select on public.kas_bill_members for select to authenticated
  using (app.kas_can_view(class_id)
         and (app.kas_can_read_all(class_id) or user_id = (select auth.uid())));

create policy kas_submissions_select on public.kas_submissions for select to authenticated
  using (app.kas_can_view(class_id)
         and (app.kas_can_read_all(class_id) or user_id = (select auth.uid())));

create policy kas_transactions_select on public.kas_transactions for select to authenticated
  using (app.kas_can_view(class_id));

create policy kas_receipts_select on public.kas_receipts for select to authenticated
  using (app.kas_can_view(class_id)
         and (app.kas_can_read_all(class_id) or uploaded_by = (select auth.uid())));

create policy kas_audit_select on public.kas_audit for select to authenticated
  using (app.kas_can_view(class_id) and app.kas_can_read_all(class_id));

grant select on public.kas_settings, public.kas_bills, public.kas_bill_members,
               public.kas_submissions, public.kas_transactions, public.kas_receipts,
               public.kas_audit
  to authenticated;

-- RPC baru: semua menulis lewat fungsi; tabel tidak punya grant tulis.
revoke all on function public.get_kas_access(), public.get_kas_summary(),
                       public.get_kas_members(), public.create_kas_bill(text, integer, date, uuid[]),
                       public.add_kas_bill_members(uuid, uuid[]), public.cancel_kas_bill(uuid, text),
                       public.submit_kas_bill_payment(uuid, integer, text, text, text),
                       public.submit_kas_deposit(integer, text, text),
                       public.review_kas_submission(uuid, boolean, text),
                       public.mark_kas_bill_member_paid(uuid, text),
                       public.create_kas_transaction(text, integer, text, text, date, text),
                       public.cancel_kas_transaction(uuid, text), public.set_kas_qris(text)
  from public, anon, authenticated;
grant execute on function public.get_kas_access(), public.get_kas_summary(),
                        public.get_kas_members(), public.create_kas_bill(text, integer, date, uuid[]),
                        public.add_kas_bill_members(uuid, uuid[]), public.cancel_kas_bill(uuid, text),
                        public.submit_kas_bill_payment(uuid, integer, text, text, text),
                        public.submit_kas_deposit(integer, text, text),
                        public.review_kas_submission(uuid, boolean, text),
                        public.mark_kas_bill_member_paid(uuid, text),
                        public.create_kas_transaction(text, integer, text, text, date, text),
                        public.cancel_kas_transaction(uuid, text), public.set_kas_qris(text)
  to authenticated;

revoke all on function app.kas_can_read_all(uuid), app.kas_can_view(uuid),
                       app.kas_today(uuid), app.kas_valid_media_path(uuid, uuid, text, text),
                       app.kas_valid_qris_path(uuid, text), app.kas_log(uuid, text, text, uuid, jsonb),
                       app.kas_maybe_close_bill(uuid, uuid)
  from public, anon, authenticated;

-- Policy RLS/storage dievaluasi sebagai authenticated dan memanggil helper ini,
-- jadi EXECUTE harus tersedia untuk role tersebut. Helper tulis lain tetap hanya
-- dipanggil dari RPC security definer.
grant execute on function app.kas_can_view(uuid), app.kas_can_read_all(uuid)
  to authenticated;

-- STORAGE --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kas-media', 'kas-media', false, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kas_media_select on storage.objects;
create policy kas_media_select on storage.objects for select to authenticated
using (
  bucket_id = 'kas-media'
  and app.kas_can_view(app.current_class_id())
  and (storage.foldername(name))[1] = app.current_class_id()::text
  and (
    ((storage.foldername(name))[2] = 'qris'
      and exists (
        select 1 from public.kas_settings s
         where s.class_id = app.current_class_id()
           and s.qris_path = storage.objects.name)
      and app.kas_can_view(app.current_class_id()))
    or ((storage.foldername(name))[2] in ('proofs','receipts')
      and ((storage.foldername(name))[3] = (select auth.uid())::text
           or app.kas_can_read_all(app.current_class_id())))
  )
);

drop policy if exists kas_media_insert on storage.objects;
create policy kas_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'kas-media'
  and app.kas_can_view(app.current_class_id())
  and (storage.foldername(name))[1] = app.current_class_id()::text
  and (
    ((storage.foldername(name))[2] = 'qris'
      and app.has_permission(app.current_class_id(), 'kas.manage'))
    or ((storage.foldername(name))[2] = 'proofs'
      and (storage.foldername(name))[3] = (select auth.uid())::text)
    or ((storage.foldername(name))[2] = 'receipts'
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and app.has_permission(app.current_class_id(), 'kas.manage'))
  )
);

drop policy if exists kas_media_delete on storage.objects;
create policy kas_media_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'kas-media'
  and app.kas_can_view(app.current_class_id())
  and (storage.foldername(name))[1] = app.current_class_id()::text
  and (
    ((storage.foldername(name))[2] = 'qris'
      and app.has_permission(app.current_class_id(), 'kas.manage')
      and not exists (
        select 1 from public.kas_settings s
         where s.class_id = app.current_class_id()
           and s.qris_path = storage.objects.name))
    or ((storage.foldername(name))[2] = 'proofs'
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and not exists (
        select 1 from public.kas_submissions s
         where s.proof_path = storage.objects.name))
    or ((storage.foldername(name))[2] = 'receipts'
      and (storage.foldername(name))[3] = (select auth.uid())::text
      and app.has_permission(app.current_class_id(), 'kas.manage')
      and not exists (
        select 1 from public.kas_receipts r
         where r.path = storage.objects.name))
  )
);
