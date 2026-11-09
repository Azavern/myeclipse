-- Migration 0035 — kategori sistem dan mode Shortcut Knowledge.
--
-- Kategori bukan lagi teks bebas. Dua nilai sistem:
--   knowledge  Markdown (default)
--   shortcut   halaman berisi kartu kombinasi tombol + label/deskripsi
-- Semua kategori lama, termasuk "Everything", dipindahkan ke knowledge karena
-- belum ada entri lama yang memiliki data kartu shortcut.

-- Backfill dijalankan sebagai pemilik migrasi tanpa JWT; guard trigger akan
-- menolak perubahan kategori karena tidak ada pengguna. Matikan hanya trigger
-- guard selama UPDATE, lalu aktifkan lagi.
alter table public.knowledge_entries disable trigger knowledge_entries_guard;
update public.knowledge_entries
   set category = 'knowledge'
 where category is distinct from 'knowledge';
alter table public.knowledge_entries enable trigger knowledge_entries_guard;

alter table public.knowledge_entries
  alter column category set default 'knowledge',
  alter column category set not null;

-- Entri shortcut tidak menyimpan Markdown, jadi content_md boleh kosong hanya
-- untuk kategori shortcut. Entri knowledge tetap wajib berisi.
alter table public.knowledge_entries
  drop constraint if exists knowledge_entries_content_md_check;
alter table public.knowledge_entries
  add constraint knowledge_entries_content_md_check check (
    char_length(content_md) <= 50000
    and (category = 'shortcut' or char_length(btrim(content_md)) between 1 and 50000)
  );
alter table public.knowledge_entries
  drop constraint if exists knowledge_entries_category_check;
alter table public.knowledge_entries
  add constraint knowledge_entries_category_check
  check (category in ('knowledge', 'shortcut'));

create table public.knowledge_shortcuts (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.knowledge_entries(id) on delete cascade,
  position    int not null check (position between 0 and 49),
  keys        text[] not null check (cardinality(keys) between 1 and 12),
  label       text not null check (char_length(btrim(label)) between 1 and 120),
  note        text check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (entry_id, position)
);

create index knowledge_shortcuts_entry_idx
  on public.knowledge_shortcuts (entry_id, position);

-- Bentuk JSON kanonis untuk membandingkan kartu lama dengan kartu dari editor.
create function app.knowledge_shortcuts_json(p_entry uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('keys', s.keys, 'label', s.label, 'note', s.note)
    order by s.position
  ), '[]'::jsonb)
  from public.knowledge_shortcuts s
  where s.entry_id = p_entry
$$;

-- Mengganti seluruh kartu satu entri secara atomik. Nilai null berarti
-- "pertahankan kartu lama" agar jalur arsip tidak perlu mengirim ulang kartu.
create function app.replace_knowledge_shortcuts(p_entry uuid, p_shortcuts jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_card jsonb;
  v_key jsonb;
  v_key_text text;
begin
  if p_shortcuts is null then
    return;
  end if;
  if jsonb_typeof(p_shortcuts) <> 'array' then
    raise exception 'shortcut tidak valid' using errcode = '22023';
  end if;
  if jsonb_array_length(p_shortcuts) > 50 then
    raise exception 'terlalu banyak kartu shortcut' using errcode = '22023';
  end if;

  for v_card in select value from jsonb_array_elements(p_shortcuts) loop
    if jsonb_typeof(v_card) <> 'object'
       or jsonb_typeof(v_card->'label') is distinct from 'string'
       or char_length(btrim(v_card->>'label')) not between 1 and 120
       or jsonb_typeof(v_card->'keys') is distinct from 'array'
       or jsonb_array_length(v_card->'keys') not between 1 and 12 then
      raise exception 'shortcut tidak valid' using errcode = '22023';
    end if;
    if v_card ? 'note'
       and jsonb_typeof(v_card->'note') not in ('string', 'null') then
      raise exception 'catatan shortcut tidak valid' using errcode = '22023';
    end if;
    if v_card ? 'note'
       and jsonb_typeof(v_card->'note') = 'string'
       and char_length(btrim(v_card->>'note')) > 500 then
      raise exception 'catatan shortcut terlalu panjang' using errcode = '22023';
    end if;
    for v_key in select value from jsonb_array_elements(v_card->'keys') loop
      if jsonb_typeof(v_key) <> 'string' then
        raise exception 'tombol shortcut tidak valid' using errcode = '22023';
      end if;
      v_key_text := btrim(v_key #>> '{}');
      if char_length(v_key_text) not between 1 and 20 then
        raise exception 'tombol shortcut tidak valid' using errcode = '22023';
      end if;
    end loop;
  end loop;

  delete from public.knowledge_shortcuts where entry_id = p_entry;
  insert into public.knowledge_shortcuts (entry_id, position, keys, label, note)
  select
    p_entry,
    (x.ord - 1)::int,
    array(select btrim(k #>> '{}') from jsonb_array_elements(x.card->'keys') k),
    btrim(x.card->>'label'),
    nullif(btrim(coalesce(x.card->>'note', '')), '')
  from jsonb_array_elements(p_shortcuts) with ordinality as x(card, ord);
end $$;

-- Ganti RPC lama karena parameter baru tidak bisa ditambahkan lewat
-- CREATE OR REPLACE FUNCTION. Default dipertahankan agar pemanggil lama tetap
-- kompatibel selama migrasi aplikasi.
drop function public.create_knowledge_entry(
  text, text, text, text, public.knowledge_status,
  public.knowledge_visibility, text[]);
drop function public.update_knowledge_entry(
  uuid, int, text, text, text, text, public.knowledge_status, text[], jsonb);

create function public.create_knowledge_entry(
  p_title text, p_tagline text, p_content text, p_category text,
  p_status public.knowledge_status, p_visibility public.knowledge_visibility,
  p_tags text[] default '{}', p_shortcuts jsonb default '[]')
returns table (id uuid, slug text)
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_slug text;
  v_id uuid;
  v_category text := coalesce(nullif(btrim(p_category), ''), 'knowledge');
  v_shortcuts jsonb := coalesce(p_shortcuts, '[]'::jsonb);
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_category not in ('knowledge', 'shortcut') then
    raise exception 'kategori tidak valid' using errcode = '22023';
  end if;
  if coalesce(btrim(p_title), '') = '' or char_length(btrim(p_title)) > 50 then
    raise exception 'judul tidak valid' using errcode = '22023';
  end if;
  if v_category = 'knowledge'
     and (coalesce(p_content, '') = '' or char_length(p_content) > 50000) then
    raise exception 'isi tidak valid' using errcode = '22023';
  end if;
  if v_category = 'shortcut'
     and (jsonb_typeof(v_shortcuts) <> 'array' or jsonb_array_length(v_shortcuts) = 0) then
    raise exception 'minimal satu kartu shortcut' using errcode = '22023';
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
     case when v_category = 'knowledge' then p_content else '' end,
     v_category, p_status, p_visibility,
     case when p_status = 'published' then now() end)
  returning knowledge_entries.id into v_id;
  perform app.replace_knowledge_shortcuts(
    v_id, case when v_category = 'shortcut' then v_shortcuts else '[]'::jsonb end);
  perform app.replace_knowledge_tags(v_id, p_tags);
  return query select v_id, v_slug;
end $$;

create function public.update_knowledge_entry(
  p_id uuid, p_version int, p_title text, p_tagline text, p_content text,
  p_category text, p_status public.knowledge_status, p_tags text[],
  p_highlights jsonb default null, p_shortcuts jsonb default null)
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
  v_category text := coalesce(nullif(btrim(p_category), ''), 'knowledge');
  v_existing_shortcuts jsonb;
  v_shortcuts jsonb;
  v_shortcuts_changed boolean;
begin
  if v_uid is null or not app.knowledge_can_edit(p_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_category not in ('knowledge', 'shortcut') then
    raise exception 'kategori tidak valid' using errcode = '22023';
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
  if v_category = 'knowledge'
     and (coalesce(p_content, '') = '' or char_length(p_content) > 50000) then
    raise exception 'isi tidak valid' using errcode = '22023';
  end if;

  v_existing_shortcuts := app.knowledge_shortcuts_json(p_id);
  if v_category = 'shortcut' then
    v_shortcuts := coalesce(p_shortcuts, v_existing_shortcuts);
    if jsonb_typeof(v_shortcuts) <> 'array' or jsonb_array_length(v_shortcuts) = 0 then
      raise exception 'minimal satu kartu shortcut' using errcode = '22023';
    end if;
  else
    v_shortcuts := '[]'::jsonb;
  end if;
  v_shortcuts_changed := v_shortcuts is distinct from v_existing_shortcuts;

  v_changed := v_category = 'knowledge' and p_content is distinct from v_old_content;
  -- "Edited" juga muncul untuk perubahan judul/tagline/kategori/kartu; sorotan
  -- blok hanya dihitung ulang bila isi Markdown berubah.
  v_edited := v_changed
    or v_shortcuts_changed
    or v_category is distinct from v_old_category
    or btrim(p_title) is distinct from v_old_title
    or nullif(btrim(coalesce(p_tagline, '')), '') is distinct from v_old_tagline;

  update public.knowledge_entries
     set title = btrim(p_title),
         tagline = nullif(btrim(coalesce(p_tagline, '')), ''),
         content_md = case when v_category = 'knowledge' then p_content else '' end,
         category = v_category,
         status = p_status,
         highlights = case
           when v_category = 'shortcut' then null
           when v_changed then p_highlights
           when v_category is distinct from v_old_category then null
           else highlights
         end,
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
  -- Jangan hapus/reinsert kartu saat arsip yang tidak mengirim p_shortcuts;
  -- null berarti pertahankan kartu lama.
  if p_shortcuts is not null or v_shortcuts_changed then
    perform app.replace_knowledge_shortcuts(p_id, v_shortcuts);
  end if;
  perform app.replace_knowledge_tags(p_id, p_tags);
  select e.version into v_new_version from public.knowledge_entries e where e.id = p_id;
  return v_new_version;
end $$;

-- Pencarian teks juga menjangkau label/catatan kartu shortcut.
create or replace function public.search_knowledge(
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
         or exists (select 1 from public.knowledge_shortcuts ks
                    where ks.entry_id = e.id
                      and (ks.label ilike '%' || btrim(p_q) || '%'
                           or coalesce(ks.note, '') ilike '%' || btrim(p_q) || '%'))
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

-- Kategori kini selalu dua nilai sistem, termasuk saat salah satunya belum
-- memiliki entri. Aplikasi memakai label manusiawinya.
create or replace function public.get_knowledge_facets()
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
  select c.value, count(v.id) as n
  from (values ('knowledge'::text), ('shortcut'::text)) c(value)
  left join visible v on v.category = c.value
  group by c.value
) x
union all
select 'tag'::text, x.value, x.n from (
  select et.tag as value, count(distinct v.id) as n
  from visible v
  join public.knowledge_entry_tags et on et.entry_id = v.id
  group by et.tag order by n desc, et.tag limit 40
) x
$$;

revoke all on public.knowledge_shortcuts from anon, authenticated;
grant select on public.knowledge_shortcuts to anon, authenticated;
alter table public.knowledge_shortcuts enable row level security;

create policy knowledge_shortcuts_select on public.knowledge_shortcuts for select
  to anon, authenticated using (app.knowledge_can_read(entry_id));

grant execute on function public.create_knowledge_entry(
    text, text, text, text, public.knowledge_status,
    public.knowledge_visibility, text[], jsonb),
  public.update_knowledge_entry(
    uuid, int, text, text, text, text, public.knowledge_status, text[], jsonb, jsonb)
  to authenticated;
