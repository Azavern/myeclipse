-- Migration 0032 — pembatas pengambilan Library.
--
-- Penjelajah Library memanggil Google Drive setiap kali dibuka atau dimuat
-- ulang. Supaya refresh berulang tidak membebani server dan kuota Drive, satu
-- baris per anggota menyimpan riwayat pengambilan dan waktu jeda. Baris itu
-- dikunci `for update`, jadi dua permintaan bersamaan tidak bisa sama-sama
-- lolos dengan riwayat yang sama.
--
-- Aturan keputusan (jendela 60 detik, jeda 60 detik, deteksi pola berirama)
-- dihitung di TypeScript (`src/lib/library/throttle.ts`) dan dites di
-- `tests/unit/library-throttle.test.ts`. Fungsi di sini hanya menyimpan data
-- dan menjaga atomisitas; tabel tidak punya grant maupun policy, jadi hanya
-- bisa disentuh lewat fungsi di bawah.

create table if not exists public.library_fetch_limits (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  hits          timestamptz[] not null default '{}',
  blocked_until timestamptz,
  updated_at    timestamptz not null default now()
);

alter table public.library_fetch_limits enable row level security;
revoke all on public.library_fetch_limits from anon, authenticated;

-- HASIL: riwayat terbaru (maksimal 11, urut lama → baru) dan status jeda.
-- Saat masih dijeda, riwayat tidak ditambah: memuat ulang halaman berkali-kali
-- selama jeda tidak memperpanjang atau memperberat apa pun.
create or replace function public.library_fetch_hit()
returns table (recent timestamptz[], blocked_until timestamptz, checked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := auth.uid();
  v_hits  timestamptz[];
  v_block timestamptz;
  v_now   timestamptz := now();
begin
  if v_user is null then
    raise exception 'library: sesi tidak ditemukan' using errcode = '42501';
  end if;

  insert into public.library_fetch_limits (user_id) values (v_user)
  on conflict (user_id) do nothing;

  select l.hits, l.blocked_until into v_hits, v_block
    from public.library_fetch_limits l
   where l.user_id = v_user
   for update;

  -- Jeda yang sudah lewat waktunya membuka jendela baru.
  if v_block is not null and v_block <= v_now then
    v_block := null;
    v_hits := '{}';
    update public.library_fetch_limits
       set hits = '{}', blocked_until = null, updated_at = v_now
     where user_id = v_user;
  end if;

  if v_block is null then
    select coalesce(array_agg(recent.h order by recent.h), '{}') into v_hits
      from (
        select h
          from unnest(coalesce(v_hits, '{}')) as t(h)
         where h > v_now - interval '60 seconds' and h <= v_now
         order by h desc
         limit 11
      ) as recent;
    update public.library_fetch_limits
       set hits = v_hits || v_now, updated_at = v_now
     where user_id = v_user;
  end if;

  -- Riwayat yang dikembalikan belum termasuk permintaan ini. Pemanggil
  -- menambahkan `checked_at` sendiri, jadi aturan di TypeScript dan isi tabel
  -- dihitung dari daftar yang sama (tidak terhitung dua kali).
  return query select coalesce(v_hits, '{}'), v_block, v_now;
end $$;

-- Mengunci pengambilan selama satu menit dan mengosongkan riwayat, sehingga
-- penghitung mulai dari nol ketika jeda selesai.
create or replace function public.library_fetch_block()
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := auth.uid();
  v_until timestamptz := now() + interval '1 minute';
begin
  if v_user is null then
    raise exception 'library: sesi tidak ditemukan' using errcode = '42501';
  end if;

  insert into public.library_fetch_limits (user_id, hits, blocked_until, updated_at)
  values (v_user, '{}', v_until, now())
  on conflict (user_id) do update
    set hits = '{}', blocked_until = excluded.blocked_until, updated_at = now();

  return v_until;
end $$;

revoke all on function public.library_fetch_hit() from public;
revoke all on function public.library_fetch_block() from public;
grant execute on function public.library_fetch_hit() to authenticated;
grant execute on function public.library_fetch_block() to authenticated;
