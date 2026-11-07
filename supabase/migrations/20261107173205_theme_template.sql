-- Migration baru — validasi kunci template tema.
--
-- CREATE OR REPLACE mempertahankan ACL/EXECUTE yang sudah diberikan pada fungsi lama;
-- jangan menambahkan grant ulang di sini karena migration 0003 sudah mengaturnya.
-- Tema lama tanpa kunci `template` tetap valid (default).

create or replace function app.theme_is_valid(t jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(t) = 'object'
    and t->>'layout' in ('standard','profile_focused')
    and t->>'font_preset' in ('editorial','grotesk','rounded')
    and jsonb_typeof(t->'palette') = 'object'
    and (not (t ? 'template')
      or coalesce(t->>'template' in ('default','neobrutalism','archive'), false))
    and not exists (
      select 1 from unnest(array['primary','secondary','background','surface','border',
        'text_primary','text_secondary','success','warning','error']) k
      where coalesce(t->'palette'->>k, '') !~ '^#[0-9a-fA-F]{6}$');
$$;
