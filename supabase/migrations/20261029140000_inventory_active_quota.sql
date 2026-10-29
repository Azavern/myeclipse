-- Migration 0018 — kuota inv_key dihitung dari key AKTIF, bukan seumur hidup.
--
-- Koreksi atas 0017: pengguna boleh memiliki paling banyak 12 key yang sedang
-- aktif bersamaan. Mencabut key atau membiarkannya kedaluwarsa mengosongkan
-- satu slot, sehingga key baru bisa dibuat tanpa menunggu apa pun. Baris key
-- lama tetap disimpan sebagai riwayat dan tidak ikut dihitung.
--
-- 0017 sudah diterapkan, jadi perbaikan ini ditulis sebagai migrasi baru.
-- Tanda tangan fungsi tidak berubah; hanya isi pemeriksaan kuota.

create or replace function public.create_inventory_key(p_token text default null, p_ttl text default '7d')
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
  v_token text;
  v_expires timestamptz;
  v_active int;
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

  -- Serialisasi pembuatan key per pemilik agar dua permintaan bersamaan
  -- tidak sama-sama lolos batas 12 key aktif.
  perform 1 from public.memberships m
   where m.class_id = v_class and m.user_id = v_uid
     for update;

  -- Hanya key yang masih berlaku yang menempati slot. Key dicabut dan
  -- kedaluwarsa tetap tersimpan sebagai riwayat.
  select count(*) into v_active
    from public.inventory_keys k
   where k.class_id = v_class and k.owner_id = v_uid
     and k.revoked_at is null
     and (k.expires_at is null or k.expires_at > now());
  if v_active >= 12 then
    raise exception 'inventory key quota exhausted' using errcode = 'EC070';
  end if;

  insert into public.inventory_keys (class_id, owner_id, token, ttl, expires_at)
  values (v_class, v_uid, v_token, p_ttl, v_expires);

  select k.id into v_id from public.inventory_keys k
   where k.class_id = v_class and k.owner_id = v_uid and k.token = v_token;
  return query select v_id, v_token, v_expires;
end $$;

revoke all on function public.create_inventory_key(text, text)
  from public, anon, authenticated;
grant execute on function public.create_inventory_key(text, text)
  to authenticated;
