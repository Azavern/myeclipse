-- Migration 0015 — role kepengurusan: Wakil Ketua, Sekretaris, Bendahara.
--
-- Role baru sengaja TANPA permission: untuk sekarang hanya label; batas aksesnya
-- ditentukan terpisah. `app.has_permission` tidak berubah, jadi hanya `ketua`
-- yang masih bisa mengelola kelas.
--
-- Batas pemegang role (ditegakkan DB, bukan hanya UI): ketua 1, wakil 3,
-- sekretaris 5, bendahara 2. Mempromosikan anggota ke ketua menurunkan ketua
-- lama ke wakil dalam transaksi yang sama. Bila slot wakil sudah penuh, promosi
-- ditolak (EC041) supaya batas wakil tetap berlaku.

insert into public.roles (class_id, key, name, permissions)
select id, 'wakil', 'Wakil Ketua', '{}'::text[] from public.classes
union all
select id, 'sekretaris', 'Sekretaris', '{}'::text[] from public.classes
union all
select id, 'bendahara', 'Bendahara', '{}'::text[] from public.classes;

-- Data lama: hanya satu ketua dipertahankan (username `rleader`); ketua lain
-- menjadi wakil. Dijalankan sebelum guard dipasang agar riwayat data tidak
-- dianggap pelanggaran. Bila `rleader` tidak ada, trigger EC001 membatalkan
-- migrasi alih-alih meninggalkan kelas tanpa pengelola.
update public.memberships m
   set role_id = w.id
  from public.roles w
 where w.class_id = m.class_id
   and w.key = 'wakil'
   and m.role_id = (select r.id from public.roles r
                     where r.class_id = m.class_id and r.key = 'ketua')
   and not exists (select 1 from public.member_profiles p
                    where p.class_id = m.class_id and p.user_id = m.user_id
                      and p.username = 'rleader');

create function app.role_member_limit(p_key text) returns int
language sql immutable as $$
  select case p_key
    when 'ketua'     then 1
    when 'wakil'     then 3
    when 'sekretaris' then 5
    when 'bendahara' then 2
  end
$$;

-- Dua aturan dalam satu trigger agar urutannya tidak bergantung nama trigger:
-- (1) ketua tunggal — baris ketua lain diturunkan ke wakil, lalu
-- (2) batas pemegang role, dihitung atas semua status keanggotaan (undangan
--     yang belum aktif tetap memakai slot). Baris yang diturunkan ikut memicu
--     pemeriksaan ini, sehingga promosi yang membuat wakil melebihi batas gagal
--     dan seluruh transaksi dibatalkan.
create function app.memberships_role_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_key text; v_name text; v_limit int; v_count int; v_wakil uuid;
begin
  select r.key, r.name into v_key, v_name
    from public.roles r where r.class_id = new.class_id and r.id = new.role_id;

  if v_key = 'ketua' then
    select id into v_wakil from public.roles
     where class_id = new.class_id and key = 'wakil';
    if v_wakil is not null then
      update public.memberships m set role_id = v_wakil
       where m.class_id = new.class_id and m.user_id <> new.user_id
         and m.role_id = new.role_id;
    end if;
  end if;

  v_limit := app.role_member_limit(v_key);
  if v_limit is not null then
    select count(*) into v_count from public.memberships m
     where m.class_id = new.class_id and m.role_id = new.role_id;
    if v_count > v_limit then
      raise exception 'role % is limited to % members', v_key, v_limit
        using errcode = 'EC041', detail = v_name;
    end if;
  end if;
  return null;
end $$;

create trigger memberships_role_guard after insert or update of role_id on public.memberships
  for each row execute function app.memberships_role_guard();

revoke all on function app.role_member_limit(text), app.memberships_role_guard() from public;
