-- Migration 0027 — persetujuan tugas oleh Ketua.
--
-- Tugas yang dibuat lewat sesi anggota biasa (termasuk anggota yang diberi
-- akses `tasks.manage` dari /settings/access) berstatus `pending` dan baru
-- tampil bagi seluruh anggota setelah Ketua menyetujuinya. Tugas yang dibuat
-- Ketua langsung `approved`. Mengubah tugas sebagai non-Ketua mengembalikan
-- status ke `pending` sehingga perubahan itu ikut di-acc.
--
-- API memakai service role: ia menulis `approval = 'approved'` sendiri dan
-- trigger tidak menimpanya.

create type public.task_approval as enum ('pending', 'approved');

alter table public.tasks
  add column approval    public.task_approval not null default 'pending',
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_at timestamptz;

-- Tugas lama sudah tayang sebelum aturan ini ada; jangan sembunyikan.
update public.tasks
   set approval = 'approved',
       approved_at = coalesce(approved_at, created_at, now());

-- Service role (API) boleh menetapkan created_by sendiri; auth.uid() null di
-- sana sehingga nilai eksplisit harus dipertahankan.
create or replace function app.set_created_by() returns trigger language plpgsql as $$
begin
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;

create function app.tasks_approval_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if app.has_permission(new.class_id, 'class.manage') then
        new.approval := 'approved';
        new.approved_by := (select auth.uid());
        new.approved_at := now();
      else
        new.approval := 'pending';
        new.approved_by := null;
        new.approved_at := null;
      end if;
    elsif not app.has_permission(new.class_id, 'class.manage') then
      -- Perubahan oleh non-Ketua harus disetujui ulang.
      new.approval := 'pending';
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger tasks_approval_guard before insert or update on public.tasks
  for each row execute function app.tasks_approval_guard();

-- Tugas pending hanya terlihat oleh Ketua dan pembuatnya.
drop policy tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to anon, authenticated
  using (app.has_permission(class_id, 'class.manage')
         or (approval = 'approved' and app.can_view(class_id, 'page.tasks'))
         or (approval = 'pending' and created_by = (select auth.uid())));

-- Penulisan: jabatan dengan tasks.manage boleh semua; akses per anggota hanya
-- untuk tugas yang ia buat sendiri.
drop policy tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (app.has_role_permission(class_id, 'tasks.manage')
         or (app.has_permission(class_id, 'tasks.manage')
             and created_by = (select auth.uid())))
  with check (app.has_role_permission(class_id, 'tasks.manage')
         or (app.has_permission(class_id, 'tasks.manage')
             and created_by = (select auth.uid())));

drop policy tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (app.has_role_permission(class_id, 'tasks.manage')
         or (app.has_permission(class_id, 'tasks.manage')
             and created_by = (select auth.uid())));

revoke all on function app.tasks_approval_guard() from public;
