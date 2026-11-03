# Audit Media — Developer API Eclipse

Dokumen ini adalah hasil audit media sesuai `docs/ADDENDUM.md`. **Belum ada endpoint
media yang dibuat.** Implementasi API v1 hanya mencakup domain non-media. Bagian
ini menunggu keputusan pemilik project.

## 1. Inventaris media

| # | Fitur | Lokasi UI | Implementasi backend | Jenis media | Penyimpanan | Hubungan DB | Bergantung pada Cloud? | Kategori |
|---|---|---|---|---|---|---|---|---|
| 1 | Foto profil | `/settings/profile`, `/members` | `uploadAvatar`, `removeAvatar` (`src/features/profile/actions.ts`) | Gambar | Supabase Storage `member-media` | `member_profiles.avatar_path` | Tidak | 2 |
| 2 | Gambar portofolio | `/settings/portfolio/{id}/edit` | `uploadPortfolioMedia`, `removePortfolioMedia` | Gambar | `member-media` | `portfolio_items.media_path` | Tidak | 2 |
| 3 | Logo kelas | `/settings/class` | `uploadClassImage` | Gambar | `class-media` | `classes.logo_path` | Tidak | 2 |
| 4 | Cover kelas | `/settings/class` | `uploadClassImage` | Gambar | `class-media` | `classes.cover_path` | Tidak | 2 |
| 5 | Cover event | `/events/{id}/edit` | `uploadEventCover`, `removeEventCover` | Gambar | `class-media` | `events.cover_path` | Tidak | 2 |
| 6 | Gambar di Knowledge | `/knowledge/{slug}` | Markdown `![alt](https://…)` dirender klien | URL eksternal | Penyedia pihak ketiga | `knowledge_entries.content_md` | Tidak | 3 |
| 7 | Pratinjau tautan | kartu portofolio/tautan | `src/components/link-preview.tsx` | Gambar Open Graph | Situs sumber | Tidak disimpan | Tidak | 4 |
| 8 | QR Studio | `/qr` | `src/lib/qr/*`, `qr_shares` | PNG biner | Tidak disimpan (dibuat saat request) | `qr_shares` (token, payload, kedaluwarsa) | Tidak | 1 |
| 9 | Google Drive uploader | `/cloud`, `/settings/cloud` | `src/lib/gdrive/*`, `src/features/gdrive/*` | Semua file | Google Drive | `gdrive_uploads`, `gdrive_folders`, `gdrive_profiles` | **Ya** | 1 (dilarang) |

Catatan penting:

- Media 1–5 memakai signed URL saat render; path bukan URL publik permanen.
- Media 6 hanya teks Markdown; tidak ada upload ke Eclipse.
- Media 8 menghasilkan respons biner dan tautan berbagi berumur pendek, bukan
  resource yang bisa di-CRUD.
- Media 9 sepenuhnya di luar cakupan (ADDENDUM §1). Audit ini tidak mengubah
  workflow, kredensial, session upload, atau folder.

## 2. Evaluasi alternatif URL eksternal (ADDENDUM §4)

### Pendekatan A — External URL Reference

Aplikasi eksternal mengunggah gambar ke hosting pilihannya, lalu mengirim URL ke
API Eclipse. Eclipse hanya menyimpan URL + alt/caption.

- SSRF: tidak ada server-side fetch jika URL hanya disimpan. Risiko muncul bila
  Eclipse mengambil gambar untuk validasi/thumbnail.
- Validasi: wajib `https`, host bertitik, tanpa kredensial; tolak `localhost`,
  IP privat, dan skema lain.
- MIME/format: tidak bisa dipastikan tanpa fetch. Jika tidak fetch, jangan klaim
  tervalidasi.
- Stabilitas: URL bisa mati, hotlink diblokir, atau berubah isi.
- Privasi: URL publik dapat dibagikan siapa pun; jangan menyimpan URL bertanda
  tangan yang kedaluwarsa.
- Google Drive: `drive.google.com/file/d/{id}/view` bukan URL gambar langsung;
  `uc?export=view` tidak stabil dan tidak boleh diasumsikan bisa dipakai.
- Rekomendasi: hanya untuk resource yang sudah menerima URL (portofolio `url`,
  social link), bukan untuk mengganti kolom media.

### Pendekatan B — Controlled Media Upload

Aplikasi eksternal mengirim file ke layanan penyimpanan terpisah, Eclipse hanya
menyimpan referensi. Ini memerlukan quota, pemindaian, lifecycle, dan otorisasi
baru; berpotensi bersinggungan dengan arsitektur Cloud yang dilarang. Tidak
direkomendasikan untuk v1.

## 3. Rekomendasi per fitur

| Fitur | Rekomendasi | Alasan |
|---|---|---|
| Foto profil | Jangan diekspos dulu | Kategori 2; mengganti media personal, validasi file, signed URL, dan risiko penyalahgunaan identitas. |
| Gambar portofolio | Jangan diekspos dulu | Kategori 2; upload/ganti/hapus media dan pemrosesan gambar. |
| Logo/cover kelas | Jangan diekspos dulu | Kategori 2; mengubah identitas visual seluruh kelas. |
| Cover event | Jangan diekspos dulu | Kategori 2; sama dengan portofolio. |
| Gambar Knowledge | Boleh dipertimbangkan sebagai bagian teks | Kategori 3; API hanya membaca Markdown yang sudah tersimpan, tanpa upload. |
| Pratinjau tautan | Tidak perlu endpoint | Kategori 4; dihasilkan saat render dari URL yang sudah ada. |
| QR PNG | Tidak perlu endpoint | Bukan resource media tersimpan; output biner. |
| Google Drive | Dilarang | ADDENDUM §1. |

## 4. Pertanyaan persetujuan (wajib dijawab sebelum implementasi media)

1. **Foto profil anggota** — Apakah API boleh mengganti/menghapus avatar?
   Pilihan: tidak sama sekali / hanya baca URL bertanda tangan / upload binary.
   Rekomendasi: tidak sama sekali di v1.
2. **Gambar portofolio** — Apakah API perlu upload/ganti/hapus gambar, atau cukup
   `media_url` read-only? Rekomendasi: read-only setelah ada mekanisme signed URL
   yang aman; upload ditunda.
3. **Logo dan cover kelas** — Apakah aplikasi eksternal boleh mengganti identitas
   visual kelas? Rekomendasi: tidak; ini operasi UI dengan konfirmasi.
4. **Cover event** — Sama seperti portofolio. Rekomendasi: ditunda.
5. **URL eksternal** — Jika kelak diizinkan, apakah Eclipse boleh mengambil gambar
   dari URL untuk validasi (SSRF), atau hanya menyimpan URL tanpa fetch?
   Rekomendasi: simpan tanpa fetch, validasi skema/host, jangan jadikan URL sebagai
   bukti MIME.

Sampai jawaban diterima, tidak ada endpoint media, tidak ada perubahan struktur
penyimpanan, dan tidak ada migrasi data media.
