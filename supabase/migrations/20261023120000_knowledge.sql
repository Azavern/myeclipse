-- Migration 0014 — Eclipse Knowledge (docs/eclipse-knowledge-blueprint.md)
--
-- Satu perpustakaan pengetahuan per kelas. Isi disimpan sebagai Markdown saat ini
-- saja: tanpa arsip revisi penuh. `highlights` hanya anotasi blok yang berubah pada
-- suntingan terakhir. Semua otorisasi konten ada di sini (RLS + trigger guard +
-- RPC), bukan di UI. Aksi visibilitas Ketua tidak memberi hak menulis konten.

-- KATALOG VISIBILITY ---------------------------------------------------------
-- Halaman penjelajah pengetahuan adalah langit-langit akses publik. Status per
-- entri (public/unlisted/class_only/private) tetap diperiksa terpisah.
insert into public.visibility_catalog
  (key, kind, scope, parent_key, default_audience, widest_audience) values
('page.knowledge', 'page', 'class', null, 'public', 'public');

-- ENUM -----------------------------------------------------------------------
create type public.knowledge_status as enum ('draft', 'published', 'archived');
create type public.knowledge_visibility as enum ('public', 'unlisted', 'class_only', 'private');
create type public.knowledge_request_status as enum
  ('pending_author', 'escalated', 'approved', 'rejected', 'revoked', 'expired');

-- TABEL ----------------------------------------------------------------------
create table public.knowledge_entries (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  author_id     uuid not null references auth.users(id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 80),
  title         text not null check (char_length(title) between 1 and 50),
  tagline       text check (char_length(tagline) <= 150),
  content_md    text not null check (char_length(content_md) between 1 and 50000),
  category      text check (char_length(category) between 1 and 40),
  status        public.knowledge_status not null default 'draft',
  visibility    public.knowledge_visibility not null default 'private',
  highlights    jsonb check (highlights is null or jsonb_typeof(highlights) = 'object'),
  version       int not null default 1 check (version > 0),
  published_at  timestamptz,
  edited_at     timestamptz,
  last_edited_by uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (class_id, slug)
);

create table public.knowledge_entry_tags (
  entry_id uuid not null references public.knowledge_entries(id) on delete cascade,
  tag      text not null check (tag ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  primary key (entry_id, tag)
);

create table public.knowledge_edit_requests (
  id              uuid primary key default gen_random_uuid(),
  class_id        uuid not null references public.classes(id) on delete cascade,
  entry_id        uuid not null references public.knowledge_entries(id) on delete cascade,
  requester_id    uuid not null references auth.users(id) on delete cascade,
  reason          text not null check (char_length(reason) between 5 and 500),
  escalation_reason text check (char_length(escalation_reason) between 5 and 500),
  status          public.knowledge_request_status not null default 'pending_author',
  decided_by      uuid references auth.users(id) on delete set null,
  decided_as      text check (decided_as in ('author', 'leader')),
  decided_at      timestamptz,
  escalated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Satu permintaan menunggu per entri/pemohon; permintaan lama yang sudah selesai
-- tetap disimpan sebagai riwayat izin.
create unique index knowledge_edit_requests_pending_uq
  on public.knowledge_edit_requests (entry_id, requester_id)
  where status in ('pending_author', 'escalated');

create table public.knowledge_editors (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  entry_id    uuid not null references public.knowledge_entries(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  granted_by  uuid references auth.users(id) on delete set null,
  request_id  uuid references public.knowledge_edit_requests(id) on delete set null,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (entry_id, user_id)
);

-- Jejak audit ringan untuk izin dan visibilitas. Tidak berisi snapshot konten.
create table public.knowledge_audit (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  entry_id    uuid references public.knowledge_entries(id) on delete set null,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null check (action in
    ('visibility_changed', 'edit_requested', 'edit_escalated', 'edit_approved',
     'edit_rejected', 'edit_revoked', 'editor_granted')),
  reason      text check (char_length(reason) <= 500),
  created_at  timestamptz not null default now()
);

create index knowledge_entries_explorer_idx
  on public.knowledge_entries (class_id, status, visibility, published_at desc);
create index knowledge_entry_tags_tag_idx on public.knowledge_entry_tags (tag);
create index knowledge_edit_requests_status_idx
  on public.knowledge_edit_requests (class_id, status, created_at desc);
create index knowledge_editors_entry_idx on public.knowledge_editors (entry_id, user_id);
create index knowledge_audit_class_idx on public.knowledge_audit (class_id, created_at desc);

-- HELPER (schema app, tidak diekspos PostgREST) -------------------------------
create function app.knowledge_tag(p_text text) returns text
language sql immutable as $$
  select left(trim(both '-' from regexp_replace(
    lower(regexp_replace(coalesce(p_text, ''), '^#+', '')),
    '[^a-z0-9]+', '-', 'g')), 40)
$$;

create function app.knowledge_entry_author(p_entry uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select e.author_id from public.knowledge_entries e where e.id = p_entry
$$;

-- Pembaca entri: publik/unlisted hanya bila halaman Pengetahuan terlihat;
-- anggota aktif untuk class_only; penulis, Ketua, dan editor aktif untuk draf,
-- privat, dan arsip. Keanggotaan nonaktif kehilangan akses ini.
create function app.knowledge_can_read(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.knowledge_entries e
    where e.id = p_entry and (
      (app.can_view(e.class_id, 'page.knowledge') and (
        (e.status = 'published' and e.visibility in ('public', 'unlisted'))
        or (e.status = 'published' and e.visibility = 'class_only'
            and app.is_active_member(e.class_id))))
      or (e.author_id = (select auth.uid()) and app.is_active_member(e.class_id))
      or (app.is_active_member(e.class_id) and exists (
        select 1 from public.knowledge_editors k
        where k.entry_id = e.id and k.user_id = (select auth.uid())
          and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())))
      or app.has_permission(e.class_id, 'class.manage')
    )
  )
$$;

-- Hak menulis konten. Ketua TIDAK otomatis mendapatkannya; hanya penulis dan
-- editor yang disetujui. Aksi visibilitas Ketua ditangani RPC terpisah.
create function app.knowledge_can_edit(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.knowledge_entries e
    where e.id = p_entry and app.is_active_member(e.class_id) and (
      e.author_id = (select auth.uid())
      or exists (
        select 1 from public.knowledge_editors k
        where k.entry_id = e.id and k.user_id = (select auth.uid())
          and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())))
  )
$$;

create function app.knowledge_slugify(p_title text, p_class uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare base text; candidate text; n int := 1;
begin
  base := trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'entri'; end if;
  -- Jangan bentrok dengan segmen rute statis /knowledge/new dan /knowledge/manage.
  if base in ('new', 'manage') then base := base || '-entri'; end if;
  base := left(base, 60);
  candidate := base;
  while exists (select 1 from public.knowledge_entries
                where class_id = p_class and slug = candidate) loop
    n := n + 1;
    candidate := left(base, 70) || '-' || n;
  end loop;
  return candidate;
end $$;

create function app.replace_knowledge_tags(p_entry uuid, p_tags text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.knowledge_entry_tags where entry_id = p_entry;
  insert into public.knowledge_entry_tags (entry_id, tag)
  select distinct p_entry, t.tag
  from (select app.knowledge_tag(x) as tag
        from unnest(coalesce(p_tags, '{}'::text[])) x) t
  where t.tag <> '' and char_length(t.tag) <= 40
  limit 10;
end $$;

-- GUARD TRIGGER --------------------------------------------------------------
-- Lapisan kedua setelah RLS: melarang penggantian identitas/slug, membatasi
-- perubahan status ke penulis, perubahan visibilitas ke penulis/Ketua, dan
-- perubahan konten ke penulis/editor. Ketua yang hanya mengubah visibilitas lolos.
create function app.knowledge_guard_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if new.id is distinct from old.id
     or new.class_id is distinct from old.class_id
     or new.author_id is distinct from old.author_id then
    raise exception 'identitas entri tidak dapat diubah' using errcode = 'EC050';
  end if;
  if new.slug is distinct from old.slug then
    raise exception 'slug entri tidak dapat diubah' using errcode = 'EC052';
  end if;
  if new.version is distinct from old.version
     and new.version <> old.version + 1 then
    raise exception 'versi entri tidak valid' using errcode = 'EC053';
  end if;
  if new.status is distinct from old.status
     and old.author_id is distinct from v_uid then
    raise exception 'hanya penulis yang dapat mengubah status' using errcode = 'EC051';
  end if;
  if new.visibility is distinct from old.visibility
     and old.author_id is distinct from v_uid
     and not app.has_permission(old.class_id, 'class.manage') then
    raise exception 'hanya penulis atau Ketua yang dapat mengubah visibilitas'
      using errcode = 'EC051';
  end if;
  if (new.title is distinct from old.title
      or new.tagline is distinct from old.tagline
      or new.content_md is distinct from old.content_md
      or new.category is distinct from old.category
      or new.status is distinct from old.status
      or new.highlights is distinct from old.highlights
      or new.published_at is distinct from old.published_at
      or new.edited_at is distinct from old.edited_at)
     and not app.knowledge_can_edit(old.id) then
    raise exception 'konten hanya dapat diubah penulis atau editor'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger knowledge_entries_guard
  before update on public.knowledge_entries
  for each row execute function app.knowledge_guard_entry();

-- RPC: KONTEN ----------------------------------------------------------------
create function public.create_knowledge_entry(
  p_title text, p_tagline text, p_content text, p_category text,
  p_status public.knowledge_status, p_visibility public.knowledge_visibility,
  p_tags text[] default '{}')
returns table (id uuid, slug text)
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_slug text;
  v_id uuid;
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or char_length(btrim(p_title)) > 50 then
    raise exception 'judul tidak valid' using errcode = '22023';
  end if;
  if coalesce(p_content, '') = '' or char_length(p_content) > 50000 then
    raise exception 'isi tidak valid' using errcode = '22023';
  end if;
  if p_status not in ('draft', 'published') then
    raise exception 'status awal tidak valid' using errcode = 'EC054';
  end if;
  v_slug := app.knowledge_slugify(p_title, v_class);
  insert into public.knowledge_entries
    (class_id, author_id, slug, title, tagline, content_md, category, status,
     visibility, published_at)
  values
    (v_class, v_uid, v_slug, btrim(p_title),
     nullif(btrim(coalesce(p_tagline, '')), ''),
     p_content, nullif(btrim(coalesce(p_category, '')), ''),
     p_status, p_visibility,
     case when p_status = 'published' then now() end)
  returning knowledge_entries.id into v_id;
  perform app.replace_knowledge_tags(v_id, p_tags);
  return query select v_id, v_slug;
end $$;

create function public.update_knowledge_entry(
  p_id uuid, p_version int, p_title text, p_tagline text, p_content text,
  p_category text, p_status public.knowledge_status, p_tags text[],
  p_highlights jsonb default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old_content text;
  v_old_status public.knowledge_status;
  v_old_author uuid;
  v_old_title text;
  v_old_tagline text;
  v_old_category text;
  v_new_version int;
  v_changed boolean;
  v_edited boolean;
begin
  if v_uid is null or not app.knowledge_can_edit(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select e.content_md, e.status, e.author_id, e.title, e.tagline, e.category
    into v_old_content, v_old_status, v_old_author, v_old_title, v_old_tagline, v_old_category
    from public.knowledge_entries e where e.id = p_id;
  if not found then raise exception 'entri tidak ditemukan' using errcode = 'P0002'; end if;
  if p_status is distinct from v_old_status and v_old_author is distinct from v_uid then
    raise exception 'hanya penulis yang dapat mengubah status' using errcode = 'EC051';
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'status tidak valid' using errcode = 'EC054';
  end if;
  v_changed := p_content is distinct from v_old_content;
  -- "Edited" juga muncul untuk perubahan judul/tagline/kategori; sorotan blok
  -- hanya dihitung ulang bila isi Markdown berubah.
  v_edited := v_changed
    or btrim(p_title) is distinct from v_old_title
    or nullif(btrim(coalesce(p_tagline, '')), '') is distinct from v_old_tagline
    or nullif(btrim(coalesce(p_category, '')), '') is distinct from v_old_category;
  update public.knowledge_entries
     set title = btrim(p_title),
         tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
         content_md = p_content,
         category = nullif(btrim(coalesce(p_category, '')), ''),
         status = p_status,
         highlights = case when v_changed then p_highlights else highlights end,
         edited_at = case when v_edited then now() else edited_at end,
         last_edited_by = case when v_edited then v_uid else last_edited_by end,
         published_at = case when p_status = 'published' and published_at is null
                             then now() else published_at end,
         version = version + 1
   where id = p_id and version = p_version;
  get diagnostics v_new_version = row_count;
  if v_new_version = 0 then
    raise exception 'entri sudah berubah' using errcode = '40001';
  end if;
  perform app.replace_knowledge_tags(p_id, p_tags);
  select e.version into v_new_version from public.knowledge_entries e where e.id = p_id;
  return v_new_version;
end $$;

create function public.set_knowledge_visibility(
  p_id uuid, p_visibility public.knowledge_visibility, p_reason text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_class uuid;
  v_old public.knowledge_visibility;
begin
  select e.author_id, e.class_id, e.visibility
    into v_author, v_class, v_old
    from public.knowledge_entries e where e.id = p_id;
  if not found then raise exception 'entri tidak ditemukan' using errcode = 'P0002'; end if;
  if v_uid is null
     or (v_author is distinct from v_uid and not app.has_permission(v_class, 'class.manage'))
     or (v_author = v_uid and not app.is_active_member(v_class)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_visibility is distinct from v_old then
    update public.knowledge_entries
       set visibility = p_visibility, updated_at = now()
     where id = p_id;
    insert into public.knowledge_audit (class_id, entry_id, actor_id, action, reason)
    values (v_class, p_id, v_uid, 'visibility_changed',
            nullif(btrim(coalesce(p_reason, '')), ''));
  end if;
end $$;

-- RPC: PERMINTAAN EDIT -------------------------------------------------------
create function public.request_knowledge_edit(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_author uuid;
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select e.author_id into v_author from public.knowledge_entries e
   where e.id = p_id and e.class_id = v_class;
  if not found then raise exception 'entri tidak ditemukan' using errcode = 'P0002'; end if;
  if v_author = v_uid then raise exception 'penulis tidak perlu meminta' using errcode = 'EC055'; end if;
  if not app.knowledge_can_read(p_id) then
    raise exception 'entri tidak ditemukan' using errcode = 'P0002';
  end if;
  if app.knowledge_can_edit(p_id) then
    raise exception 'sudah punya akses edit' using errcode = 'EC055';
  end if;
  if exists (select 1 from public.knowledge_edit_requests r
             where r.entry_id = p_id and r.requester_id = v_uid
               and r.status in ('pending_author', 'escalated')) then
    raise exception 'permintaan sudah menunggu' using errcode = 'EC056';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'alasan tidak valid' using errcode = '22023';
  end if;
  insert into public.knowledge_edit_requests
    (class_id, entry_id, requester_id, reason)
  values (v_class, p_id, v_uid, btrim(p_reason));
  insert into public.knowledge_audit (class_id, entry_id, actor_id, action, reason)
  values (v_class, p_id, v_uid, 'edit_requested', btrim(p_reason));
end $$;

create function public.escalate_knowledge_request(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry uuid;
  v_class uuid;
begin
  select r.entry_id, r.class_id into v_entry, v_class
    from public.knowledge_edit_requests r
   where r.id = p_request and r.requester_id = v_uid
     and r.status = 'pending_author';
  if not found or not app.is_active_member(v_class) then
    raise exception 'permintaan tidak dapat diteruskan' using errcode = 'EC057';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'alasan tidak valid' using errcode = '22023';
  end if;
  update public.knowledge_edit_requests
     set status = 'escalated', escalated_at = now(),
         escalation_reason = btrim(p_reason), updated_at = now()
   where id = p_request;
  insert into public.knowledge_audit (class_id, entry_id, actor_id, action, reason)
  values (v_class, v_entry, v_uid, 'edit_escalated', btrim(p_reason));
end $$;

create function public.decide_knowledge_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry uuid;
  v_class uuid;
  v_author uuid;
  v_requester uuid;
  v_status public.knowledge_request_status;
  v_as text;
begin
  select r.entry_id, r.class_id, r.requester_id, r.status, e.author_id
    into v_entry, v_class, v_requester, v_status, v_author
    from public.knowledge_edit_requests r
    join public.knowledge_entries e on e.id = r.entry_id
   where r.id = p_request;
  if not found then raise exception 'permintaan tidak ditemukan' using errcode = 'P0002'; end if;
  if v_status = 'pending_author' then
    if v_author is distinct from v_uid or not app.is_active_member(v_class) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_as := 'author';
  elsif v_status = 'escalated' then
    if not app.has_permission(v_class, 'class.manage') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_as := 'leader';
  else
    raise exception 'permintaan sudah diputuskan' using errcode = 'EC057';
  end if;

  update public.knowledge_edit_requests
     set status = (case when p_approve then 'approved' else 'rejected' end)::public.knowledge_request_status,
         decided_by = v_uid, decided_as = v_as, decided_at = now(),
         updated_at = now()
   where id = p_request;

  if p_approve then
    insert into public.knowledge_editors
      (class_id, entry_id, user_id, granted_by, request_id, expires_at)
    values (v_class, v_entry, v_requester, v_uid, p_request,
            case when v_as = 'leader' then now() + interval '7 days' end)
    on conflict (entry_id, user_id) do update
      set granted_by = excluded.granted_by,
          request_id = excluded.request_id,
          expires_at = excluded.expires_at,
          revoked_at = null,
          created_at = now();
    insert into public.knowledge_audit (class_id, entry_id, actor_id, action)
    values (v_class, v_entry, v_uid, 'editor_granted');
  end if;
  insert into public.knowledge_audit (class_id, entry_id, actor_id, action)
  values (v_class, v_entry, v_uid,
          case when p_approve then 'edit_approved' else 'edit_rejected' end);
end $$;

create function public.revoke_knowledge_editor(p_entry uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_author uuid;
  v_class uuid;
begin
  select e.author_id, e.class_id into v_author, v_class
    from public.knowledge_entries e where e.id = p_entry;
  if not found then raise exception 'entri tidak ditemukan' using errcode = 'P0002'; end if;
  if v_uid is null
     or (v_author = v_uid and not app.is_active_member(v_class))
     or (v_author is distinct from v_uid
         and not app.has_permission(v_class, 'class.manage')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.knowledge_editors
     set revoked_at = now(),
         expires_at = coalesce(expires_at, now())
   where entry_id = p_entry and user_id = p_user and revoked_at is null;
  if not found then raise exception 'akses edit tidak ditemukan' using errcode = 'P0002'; end if;
  update public.knowledge_edit_requests
     set status = 'revoked', updated_at = now()
   where entry_id = p_entry and requester_id = p_user and status = 'approved';
  insert into public.knowledge_audit (class_id, entry_id, actor_id, action)
  values (v_class, p_entry, v_uid, 'edit_revoked');
end $$;

-- RPC: PENJELAJAH ------------------------------------------------------------
create function public.search_knowledge(
  p_q text default null, p_category text default null, p_tags text[] default '{}',
  p_sort text default 'newest', p_limit int default 12, p_offset int default 0)
returns table (
  id uuid, slug text, title text, tagline text, category text,
  author_id uuid, author_name text, tags text[],
  published_at timestamptz, updated_at timestamptz, edited boolean, total bigint)
language sql stable security definer set search_path = '' as $$
with visible as (
  select e.*
  from public.knowledge_entries e
  where e.status = 'published'
    and e.visibility in ('public', 'class_only')
    and app.can_view(e.class_id, 'page.knowledge')
    and (e.visibility = 'public' or app.is_active_member(e.class_id))
    and (coalesce(btrim(p_q), '') = ''
         or e.title ilike '%' || btrim(p_q) || '%'
         or coalesce(e.tagline, '') ilike '%' || btrim(p_q) || '%'
         or e.content_md ilike '%' || btrim(p_q) || '%'
         or coalesce(e.category, '') ilike '%' || btrim(p_q) || '%'
         or exists (select 1 from public.knowledge_entry_tags et
                    where et.entry_id = e.id
                      and et.tag ilike '%' || lower(btrim(p_q)) || '%'))
    and (coalesce(btrim(p_category), '') = '' or e.category = btrim(p_category))
    and (coalesce(cardinality(p_tags), 0) = 0 or not exists (
      select 1 from unnest(p_tags) t(tag)
      where not exists (select 1 from public.knowledge_entry_tags et
                        where et.entry_id = e.id and et.tag = app.knowledge_tag(t.tag))))
), paged as (
  select v.*, count(*) over () as total
  from visible v
  order by
    case when p_sort = 'title_asc' then lower(v.title) end asc,
    case when p_sort = 'title_desc' then lower(v.title) end desc,
    case when p_sort = 'updated' then v.updated_at end desc,
    v.published_at desc nulls last,
    v.id
  limit least(greatest(coalesce(p_limit, 12), 1), 48)
  offset greatest(coalesce(p_offset, 0), 0)
)
select p.id, p.slug, p.title, p.tagline, p.category, p.author_id,
  case when app.can_view(p.class_id, 'page.members') then mp.full_name end,
  coalesce((select array_agg(et.tag order by et.tag)
            from public.knowledge_entry_tags et where et.entry_id = p.id),
           '{}'::text[]),
  p.published_at, p.updated_at, p.edited_at is not null, p.total
from paged p
left join public.member_profiles mp
  on mp.class_id = p.class_id and mp.user_id = p.author_id
order by
  case when p_sort = 'title_asc' then lower(p.title) end asc,
  case when p_sort = 'title_desc' then lower(p.title) end desc,
  case when p_sort = 'updated' then p.updated_at end desc,
  p.published_at desc nulls last,
  p.id
$$;

create function public.get_knowledge_facets()
returns table (kind text, value text, entry_count bigint)
language sql stable security definer set search_path = '' as $$
with visible as (
  select e.id, e.class_id, e.category
  from public.knowledge_entries e
  where e.status = 'published'
    and e.visibility in ('public', 'class_only')
    and app.can_view(e.class_id, 'page.knowledge')
    and (e.visibility = 'public' or app.is_active_member(e.class_id))
)
select 'category'::text, x.value, x.n from (
  select v.category as value, count(*) as n
  from visible v
  where v.category is not null
  group by v.category order by n desc, v.category limit 30
) x
union all
select 'tag'::text, x.value, x.n from (
  select et.tag as value, count(distinct v.id) as n
  from visible v
  join public.knowledge_entry_tags et on et.entry_id = v.id
  group by et.tag order by n desc, et.tag limit 40
) x
$$;

-- HAK AKSES ------------------------------------------------------------------
revoke all on public.knowledge_entries, public.knowledge_entry_tags,
  public.knowledge_edit_requests, public.knowledge_editors, public.knowledge_audit
  from anon, authenticated;

grant select on public.knowledge_entries to anon, authenticated;
grant select on public.knowledge_entry_tags to anon, authenticated;
grant select on public.knowledge_edit_requests to authenticated;
grant select on public.knowledge_editors to authenticated;
grant select on public.knowledge_audit to authenticated;
grant insert (class_id, author_id, slug, title, tagline, content_md, category,
              status, visibility, highlights, published_at)
  on public.knowledge_entries to authenticated;
grant update (title, tagline, content_md, category, status, visibility,
              highlights, published_at, edited_at, last_edited_by, version)
  on public.knowledge_entries to authenticated;
grant delete on public.knowledge_entries to authenticated;

alter table public.knowledge_entries enable row level security;
alter table public.knowledge_entry_tags enable row level security;
alter table public.knowledge_edit_requests enable row level security;
alter table public.knowledge_editors enable row level security;
alter table public.knowledge_audit enable row level security;

create policy knowledge_entries_select on public.knowledge_entries for select
  to anon, authenticated using (app.knowledge_can_read(id));
create policy knowledge_entries_insert on public.knowledge_entries for insert
  to authenticated with check (
    author_id = (select auth.uid())
    and class_id = app.current_class_id()
    and app.is_active_member(class_id));
create policy knowledge_entries_update on public.knowledge_entries for update
  to authenticated
  using (app.knowledge_can_edit(id) or app.has_permission(class_id, 'class.manage'))
  with check (app.is_active_member(class_id));
create policy knowledge_entries_delete on public.knowledge_entries for delete
  to authenticated using (
    author_id = (select auth.uid()) and app.is_active_member(class_id));

create policy knowledge_tags_select on public.knowledge_entry_tags for select
  to anon, authenticated using (app.knowledge_can_read(entry_id));

create policy knowledge_requests_select on public.knowledge_edit_requests for select
  to authenticated using (
    requester_id = (select auth.uid())
    or app.has_permission(class_id, 'class.manage')
    or app.knowledge_entry_author(entry_id) = (select auth.uid()));

create policy knowledge_editors_select on public.knowledge_editors for select
  to authenticated using (
    user_id = (select auth.uid())
    or app.has_permission(class_id, 'class.manage')
    or app.knowledge_entry_author(entry_id) = (select auth.uid()));

create policy knowledge_audit_select on public.knowledge_audit for select
  to authenticated using (
    app.has_permission(class_id, 'class.manage')
    or app.knowledge_entry_author(entry_id) = (select auth.uid()));

-- EXECUTE: hanya helper yang dipanggil policy. Fungsi penulisan internal
-- (slugify, replace_knowledge_tags) sengaja tidak diberi grant agar tidak bisa
-- dipanggil langsung dari luar RPC pemiliknya.
grant execute on function app.knowledge_entry_author(uuid),
  app.knowledge_can_read(uuid), app.knowledge_can_edit(uuid)
  to anon, authenticated;

grant execute on function public.create_knowledge_entry(text, text, text, text,
    public.knowledge_status, public.knowledge_visibility, text[]),
  public.update_knowledge_entry(uuid, int, text, text, text, text,
    public.knowledge_status, text[], jsonb),
  public.set_knowledge_visibility(uuid, public.knowledge_visibility, text),
  public.request_knowledge_edit(uuid, text),
  public.escalate_knowledge_request(uuid, text),
  public.decide_knowledge_request(uuid, boolean),
  public.revoke_knowledge_editor(uuid, uuid)
  to authenticated;

grant execute on function public.search_knowledge(text, text, text[], text, int, int),
  public.get_knowledge_facets() to anon, authenticated;
