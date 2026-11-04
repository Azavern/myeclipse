-- Migration 0028 — izin akses anggota ikut terbaca UI.
--
-- 0026 menggabungkan `member_access` ke `app.has_permission` (dipakai RLS),
-- tetapi `get_viewer_context` masih mengembalikan izin jabatan saja. Akibatnya
-- `viewer.can('events.manage')` di UI bernilai false untuk anggota yang sudah
-- diberi akses, sehingga tombol tambah/ubah tidak muncul. Fungsi ini
-- menyatukan izin jabatan dengan izin per anggota; RLS tidak berubah.

create or replace function public.get_viewer_context()
returns table (class_id uuid, user_id uuid, status public.membership_status,
               role_name text, permissions text[])
language sql stable security definer set search_path = '' as $$
  select c.id, (select auth.uid()), m.status, r.name,
         case when m.status = 'active' then
           (select coalesce(array_agg(distinct p order by p), '{}'::text[])
              from unnest(
                coalesce(r.permissions, '{}'::text[]) || coalesce(
                  (select array_agg(a.permission)
                     from public.member_access a
                    where a.class_id = c.id
                      and a.user_id = (select auth.uid())),
                  '{}'::text[])
              ) as p)
         else '{}'::text[] end
  from public.classes c
  left join public.memberships m on m.class_id = c.id and m.user_id = (select auth.uid())
  left join public.roles r on r.class_id = m.class_id and r.id = m.role_id $$;
