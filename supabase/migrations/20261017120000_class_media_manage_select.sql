-- Migration 0013 — pemegang izin kelola boleh MELIHAT objek class-media di folder yang ia kelola.
--
-- Masalah (dibuktikan oleh supabase/tests/003_storage.test.sql): policy `class_media_select` di migration 0007 hanya
-- meloloskan objek yang masih direferensikan `class_identity_v` atau `events.cover_path`. Postgres menerapkan policy SELECT
-- juga pada DELETE yang punya klausa WHERE (dan Storage menghapus dengan `delete ... returning`), sehingga setelah baris
-- diperbarui dan tidak lagi menunjuk objek lama, `remove()` dengan JWT Ketua mengenai 0 baris tanpa galat.
-- Akibatnya objek lama (logo, sampul, cover event) tidak pernah terhapus, dan objek baru yang gagal disimpan barisnya
-- tidak bisa dibersihkan (lib/storage/swap.ts). Bucket member-media tidak terdampak karena policy SELECT-nya sudah
-- mencakup folder milik sendiri.
--
-- Perbaikan: tambahkan klausa yang sama dengan policy insert/delete (folder kelas + permission yang sesuai).
-- Dampak keterbukaan: hanya pemegang `class.manage` (logo, cover) atau `events.manage` (events) yang dapat membaca objek
-- yang belum/tidak lagi direferensikan, dan hanya di folder yang memang boleh mereka tulis dan hapus. Tidak ada perubahan
-- bagi anonim maupun anggota biasa.

drop policy if exists class_media_select on storage.objects;

create policy class_media_select on storage.objects for select to anon, authenticated
using (bucket_id = 'class-media' and (
     exists (select 1 from public.class_identity_v v
             where v.logo_path = storage.objects.name
                or v.cover_path = storage.objects.name)
  or exists (select 1 from public.events e where e.cover_path = storage.objects.name)
  or (    (storage.foldername(name))[1] = app.current_class_id()::text
      and (   ((storage.foldername(name))[2] in ('logo','cover')
               and app.has_permission(app.current_class_id(), 'class.manage'))
           or ((storage.foldername(name))[2] = 'events'
               and app.has_permission(app.current_class_id(), 'events.manage'))))));
