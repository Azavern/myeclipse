-- Migration 0019 — bucket publik untuk gambar QR sementara (QR Studio).
--
-- Objek ditulis hanya oleh server memakai service role; anon/authenticated
-- tidak mendapat policy INSERT/UPDATE/DELETE, sehingga bucket publik ini hanya
-- dapat dibaca lewat URL objek (path UUID acak) dan tidak dapat didaftar.
-- Masa simpan 6 jam diurus aplikasi (route unggah + /api/qr/cleanup), karena
-- pembersihan objek Storage harus lewat Storage API, bukan DELETE SQL langsung.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('qr-shares', 'qr-shares', true, 4194304, array['image/png'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Tidak ada policy Storage untuk bucket ini. Pembacaan publik dilayani endpoint
-- /object/public (tanpa RLS); unggah dan hapus memakai service role di server.
