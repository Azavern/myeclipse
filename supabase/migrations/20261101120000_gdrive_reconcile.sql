-- 0022: rekonsiliasi unggahan yang terlanjur berakhir padahal Google Drive sudah
-- membuat filenya. Dipakai server setelah memeriksa sesi resumable dan memverifikasi
-- metadata serta signature file. Hanya berlaku untuk baris milik pemanggil yang
-- statusnya sudah tidak aktif, sehingga tidak mengubah alur complete/cancel biasa.
create function public.reconcile_gdrive_upload(p_id uuid, p_drive_file_id text, p_bytes bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_class uuid := app.current_class_id();
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not app.is_active_member(v_class) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_drive_file_id is null or p_drive_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'file id invalid' using errcode = '22023';
  end if;
  update public.gdrive_uploads u
     set status = 'completed', drive_file_id = p_drive_file_id,
         bytes_uploaded = least(greatest(coalesce(p_bytes, 0), 0), u.size_bytes),
         error_code = null, updated_at = now()
   where u.id = p_id and u.class_id = v_class and u.owner_id = v_uid
     and u.status in ('cancelled', 'failed', 'expired');
  if not found then
    raise exception 'upload not found' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.reconcile_gdrive_upload(uuid, text, bigint) from public, anon;

grant execute on function public.reconcile_gdrive_upload(uuid, text, bigint) to authenticated;
