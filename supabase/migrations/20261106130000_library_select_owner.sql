-- Migration 0030 — perbaiki policy SELECT Library agar INSERT ... RETURNING lolos.
--
-- `app.library_can_read` bersifat STABLE dan membaca `library_items`. Ketika
-- PostgREST menjalankan `INSERT ... RETURNING id` (Supabase `.insert(...).select('id')`),
-- policy SELECT dievaluasi di statement yang sama dan fungsi STABLE itu belum
-- melihat baris yang baru disisipkan, sehingga setiap unggahan ditolak 42501.
--
-- Cabang pemilik langsung (`owner_id = auth.uid()`) tidak membaca tabel, jadi
-- RETURNING berhasil; syarat anggota aktif tetap dipertahankan. Untuk anggota
-- lain, `app.library_can_read` tetap menjadi satu-satunya aturan baca.
alter policy library_items_select on public.library_items
  to authenticated
  using (
    app.is_active_member(class_id)
    and (owner_id = (select auth.uid()) or app.library_can_read(id))
  );
