# ADDENDUM — Media API Restrictions & Mandatory Approval

Bagian ini merupakan persyaratan tambahan yang wajib dipatuhi selama audit dan implementasi Developer API Eclipse.

## 1. Larangan Keras: Fitur Cloud Existing

**DILARANG KERAS mengekspos, membuat endpoint baru, memodifikasi, atau mengintegrasikan ulang fitur Cloud yang sudah ada ke dalam Developer API.**

Larangan ini mencakup seluruh fungsi dan workflow cloud yang saat ini tersedia dalam Eclipse, termasuk tetapi tidak terbatas pada:

- Google Drive uploader.
- Proses upload dan transfer file ke Google Drive.
- Pengelolaan folder dan direktori cloud.
- Integrasi penyimpanan cloud eksternal.
- Proses pemindahan, penghapusan, dan pengelolaan file cloud.
- Seluruh fungsi internal yang menjadi bagian dari workflow fitur Cloud Eclipse.

Ketentuan:

- Jangan membuat endpoint API untuk fitur-fitur tersebut.
- Jangan memberikan akses tidak langsung melalui endpoint lain.
- Jangan mengekspos internal service, server action, credential, token, atau mekanisme autentikasinya.
- Jangan mengubah workflow Cloud yang sudah berjalan.
- Jangan menganggap izin CRUD pada resource tertentu otomatis memberikan izin terhadap operasi Cloud.

Pengecualian hanya dapat dipertimbangkan apabila pemilik project memberikan persetujuan eksplisit secara terpisah.

## 2. Mandatory Media Feature Audit

Sebelum mengimplementasikan API, identifikasi seluruh fitur Eclipse yang melibatkan media atau file.

Contohnya:

- Foto profil anggota.
- Gambar pada halaman profil.
- Gambar portofolio.
- Thumbnail atau cover.
- Gambar pada Knowledge.
- Lampiran tugas.
- Media pada kegiatan dan event.
- Dokumen atau file lainnya.
- Fitur lain yang ditemukan selama audit.

Jangan langsung memasukkan seluruh fitur tersebut ke dalam API.

Buat inventaris khusus `docs/api-media-review.md`.

Untuk setiap fitur, dokumentasikan:

1. Nama fitur.
2. Lokasi UI dan implementasi backend.
3. Jenis media yang digunakan.
4. Lokasi penyimpanan file saat ini.
5. Mekanisme upload dan pengambilan file.
6. Apakah menggunakan Supabase Storage, Google Drive, URL eksternal, atau mekanisme lainnya.
7. Hubungan media dengan database.
8. Apakah fitur tersebut bergantung pada fitur Cloud yang dilarang.
9. Risiko keamanan dan kompleksitas implementasi API.
10. Rekomendasi apakah fitur layak diekspos melalui API.

## 3. Urutan Prioritas Review dan Rekomendasi

Kelompokkan seluruh fitur media berdasarkan urutan berikut, dari yang PALING TIDAK DIREKOMENDASIKAN sampai yang PALING BISA DITOLERANSI untuk dibuatkan API.

**Kategori 1 — Sangat Tidak Direkomendasikan**

Operasi yang melibatkan:
- Upload binary secara langsung melalui API.
- Upload file berukuran besar.
- Pengelolaan file dan folder cloud.
- Pemindahan atau penghapusan file fisik.
- Workflow yang memerlukan upload session, chunking, resumable upload, atau background processing.
- Operasi yang berpotensi memengaruhi integrasi Cloud yang sudah berjalan.

Secara default, jangan implementasikan API untuk kategori ini.

**Kategori 2 — Tidak Direkomendasikan**

Operasi media yang:
- Mengubah atau mengganti foto profil.
- Mengganti gambar cover atau thumbnail.
- Mengunggah gambar portofolio.
- Menghapus atau mengganti media yang sudah tersimpan.
- Melibatkan validasi file, pemrosesan gambar, atau pengelolaan storage.

Jangan implementasikan tanpa evaluasi dan persetujuan pemilik project.

**Kategori 3 — Dapat Dipertimbangkan dengan Pembatasan**

Operasi yang:
- Menyimpan referensi URL gambar eksternal.
- Menghubungkan URL media ke data portofolio.
- Mengubah metadata media tanpa memindahkan file fisik.
- Mengatur alt text, caption, urutan, dan deskripsi gambar.
- Menghapus relasi URL dari database tanpa menghapus file dari penyedia eksternal.

Kategori ini relatif lebih memungkinkan, tetapi tetap membutuhkan evaluasi keamanan dan persetujuan.

**Kategori 4 — Paling Bisa Ditoleransi**

Operasi yang hanya:
- Membaca URL media yang sudah tersedia.
- Mengambil metadata media yang memang boleh diakses.
- Menampilkan gambar melalui URL yang sudah tersimpan.
- Mengambil daftar media yang sudah terhubung dengan resource tertentu.

Tetap terapkan aturan visibility, privacy, ownership, dan authorization yang berlaku pada resource induknya.

Urutan tersebut merupakan prioritas evaluasi, bukan izin otomatis untuk implementasi.

## 4. Evaluasi Alternatif Media Berbasis URL

Saya masih mempertimbangkan alternatif agar aplikasi eksternal dapat menggunakan media tanpa harus mengirim binary file langsung ke API Eclipse.

Salah satu kemungkinan adalah API hanya menerima URL gambar dari penyedia eksternal.

Contoh penyedia yang perlu dievaluasi:

- Google Drive (hanya sebagai URL referensi, bukan integrasi Cloud Eclipse).
- Pixeldrain.
- Catbox.moe.
- Penyedia image hosting lainnya.
- URL dari server atau CDN milik pengguna sendiri.

Evaluasi setidaknya dua pendekatan:

### Pendekatan A — External URL Reference

Aplikasi eksternal mengunggah gambar ke layanan hosting pilihannya sendiri, kemudian mengirim URL gambar ke API Eclipse.

API Eclipse hanya menyimpan URL dan metadata yang relevan.

Contoh konseptual:

`POST /api/v1/portfolio`

Request:
- Title
- Description
- Image URL
- Alt text

Eclipse tidak menerima atau menyimpan binary file.

### Pendekatan B — Controlled Media Upload

Aplikasi eksternal mengirim file ke layanan penyimpanan khusus yang terpisah dari API data Eclipse.

API Eclipse hanya mengelola referensi file yang sudah berhasil disimpan.

Pendekatan ini harus dievaluasi secara terpisah karena dapat menambah kompleksitas dan berpotensi bersinggungan dengan arsitektur Cloud yang sudah ada.

### Aspek evaluasi keamanan

Untuk setiap alternatif, analisis:

- Keamanan URL dan potensi SSRF.
- Validitas domain dan protokol.
- Risiko URL palsu atau konten berbahaya.
- Validasi MIME type dan format file.
- Ketersediaan dan stabilitas URL.
- Risiko hotlinking dan bandwidth.
- Privasi dan visibility gambar.
- Risiko URL kedaluwarsa.
- Ketergantungan pada penyedia eksternal.
- Kemungkinan penghapusan gambar dari penyedia.
- Kebijakan hak akses dan kepemilikan gambar.

Jangan menganggap URL Google Drive atau URL file dari penyedia mana pun selalu dapat digunakan langsung sebagai image URL. Evaluasi apakah URL benar-benar dapat menampilkan gambar secara publik dan stabil.

Jangan melakukan server-side fetching terhadap URL yang tidak tervalidasi. Hindari SSRF, redirect ke alamat privat, dan akses ke metadata service.

## 5. Mandatory Approval — Jangan Implementasikan Sebelum Bertanya

Setelah seluruh audit media selesai, **HENTIKAN implementasi pada bagian media dan ajukan hasil evaluasi kepada pemilik project.**

Jangan memutuskan sendiri fitur media mana yang boleh masuk Developer API.

Susun daftar pertanyaan berdasarkan kategori, mulai dari fitur yang paling tidak direkomendasikan hingga yang paling bisa ditoleransi.

Untuk setiap fitur, tampilkan:

- Nama fitur.
- Operasi yang ingin diekspos.
- Tingkat rekomendasi.
- Risiko teknis.
- Alternatif yang tersedia.
- Rekomendasi pendekatan terbaik.
- Konsekuensi jika fitur tidak disediakan melalui API.

Ajukan pertanyaan satu per satu atau dalam kelompok kecil yang mudah dijawab.

Jangan mengajukan satu pertanyaan terlalu umum untuk seluruh fitur media.

Pemilik project harus dapat memilih:
- Tidak menyediakan API untuk fitur tersebut.
- Hanya menyediakan API Read.
- Menggunakan URL eksternal.
- Menggunakan pendekatan alternatif yang direkomendasikan.
- Meminta evaluasi lebih lanjut.

**Khusus fitur Cloud existing: tidak perlu meminta persetujuan untuk mengintegrasikannya. Anggap fitur tersebut sepenuhnya di luar cakupan Developer API.**

## 6. Batasan Eksekusi

Sampai persetujuan diberikan:

- Jangan membuat endpoint media.
- Jangan mengubah struktur penyimpanan media.
- Jangan mengubah mekanisme upload yang sudah ada.
- Jangan menambahkan ketergantungan pada image hosting eksternal.
- Jangan mengubah workflow foto profil atau portofolio.
- Jangan melakukan migrasi data media.
- Jangan membuat asumsi bahwa semua operasi media harus tersedia melalui API.

Implementasikan terlebih dahulu API untuk domain non-media yang telah disetujui.

Fitur media baru boleh dikerjakan setelah keputusan pemilik project terdokumentasi dalam `docs/api-media-review.md`.

**Prinsip utama: Developer API Eclipse harus memperluas akses terhadap data dan kemampuan sistem, bukan secara tidak sengaja membuka kembali atau menduplikasi infrastruktur pengelolaan file yang sudah ada.**