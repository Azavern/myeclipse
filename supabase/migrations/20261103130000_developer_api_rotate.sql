-- Migration 0024 — rotasi secret Developer API.
--
-- Rotasi menghasilkan prefix dan secret baru untuk baris api_keys yang sama:
-- id, nama, izin, cakupan, dan pemilik tidak berubah. Secret lama langsung
-- tidak berlaku karena hash-nya ditimpa. Dipakai tombol "Refresh key" di
-- dashboard ketika secret hanya-tampil-sekali hilang atau diduga bocor.
-- Seperti RPC pengelolaan key lain, seluruhnya security definer + class.manage.

create function public.rotate_api_key(p_id uuid, p_prefix text, p_secret_hash text)
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
  if p_prefix is null or p_prefix !~ '^[a-f0-9]{12}$'
     or p_secret_hash is null or p_secret_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'key material invalid' using errcode = '22023';
  end if;

  update public.api_keys k
     set prefix = p_prefix,
         secret_hash = p_secret_hash,
         quota_window = now(),
         quota_count = 0
   where k.id = p_id and k.class_id = v_class;
end $$;

revoke all on function public.rotate_api_key(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.rotate_api_key(uuid, text, text) to authenticated;
