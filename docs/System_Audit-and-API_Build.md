# Task: Audit Sistem dan Implementasi Developer API Eclipse

Lakukan audit menyeluruh terhadap seluruh sistem Eclipse sebelum mengimplementasikan API. Tujuan akhirnya adalah menyediakan API resmi yang memungkinkan aplikasi eksternal mengakses dan mengelola data Eclipse secara aman, terstruktur, dan terkontrol.

**Jangan langsung melakukan implementasi sebelum menyelesaikan tahap audit dan pemetaan sistem.**

## 1. Audit Seluruh Sistem

Scan seluruh codebase, termasuk:

- Seluruh halaman, fitur, modul, dan komponen UI.
- Seluruh tombol, form, dialog, dropdown, dan aksi pengguna.
- Server Actions, API Routes, Route Handlers, dan fungsi backend lainnya.
- Database schema, tabel, relasi, views, functions, triggers, dan RLS policies Supabase.
- Authentication, authorization, membership, role, serta permission system.
- Seluruh proses Create, Read, Update, Delete (CRUD), termasuk operasi yang tidak memiliki tombol UI secara langsung.

Identifikasi seluruh operasi yang benar-benar tersedia dalam sistem, baik yang dapat dilakukan melalui UI maupun backend.

### Normalisasi fitur dan operasi

Jangan menganggap setiap tombol atau komponen UI sebagai fitur atau endpoint yang berbeda.

Contoh:
- Tombol "Edit Profil" dan "Ubah Informasi" yang mengarah pada perubahan data profil yang sama harus dipetakan sebagai satu operasi Update.
- Tombol "Hapus" pada beberapa lokasi yang menghapus entitas dan menggunakan proses bisnis yang sama tidak otomatis menjadi endpoint berbeda.
- Dua form dengan tampilan berbeda tetapi menghasilkan perubahan pada entitas dan operasi yang sama harus menggunakan endpoint yang sama.
- Perbedaan UI/UX, label tombol, layout, modal, atau navigasi tidak boleh menjadi alasan untuk membuat endpoint duplikat.
- Sebaliknya, operasi yang memiliki perbedaan domain, efek samping, validasi, atau aturan bisnis yang substantif harus tetap dibedakan.

Gunakan prinsip **Domain-Driven API Design**, bukan UI-Driven API Design.

## 2. Buat API Inventory

Sebelum coding, buat dokumentasi inventaris API yang berisi:

- Nama entitas/domain.
- Operasi yang tersedia.
- Sumber implementasi saat ini.
- Tabel atau resource database terkait.
- Metode HTTP yang sesuai.
- Endpoint yang diusulkan.
- Parameter dan request body.
- Bentuk response.
- Persyaratan autentikasi.
- Persyaratan otorisasi.
- Efek samping dan aturan bisnis.
- Potensi endpoint duplikat.

Kelompokkan berdasarkan domain, bukan berdasarkan halaman UI.

Contoh struktur:

- Members
- Class Profile
- Member Profiles
- Schedules
- Activities
- Events
- Assignments
- Knowledge
- Footer Contacts
- Dan seluruh domain lain yang ditemukan dalam codebase.

Daftar tersebut hanya contoh. Jangan membatasi audit pada daftar ini.

Buat dokumentasi `docs/api-inventory.md` dan gunakan sebagai acuan implementasi.

## 3. API Key Management

Implementasikan sistem pengelolaan API Key yang terintegrasi dengan Eclipse.

### Hak akses pengelolaan

- Hanya Ketua Kelas (role admin/ketua yang berlaku dalam sistem) yang dapat membuat API Key.
- Ketua Kelas dapat melihat daftar API Key yang telah dibuat.
- Ketua Kelas dapat memberikan nama atau label untuk setiap API Key.
- Ketua Kelas dapat mengatur izin akses setiap API Key.
- Ketua Kelas dapat mengubah konfigurasi permission API Key kapan saja.
- Ketua Kelas dapat menonaktifkan, mengaktifkan kembali, dan mencabut (revoke) API Key.
- Sediakan informasi waktu pembuatan, pembaruan, penggunaan terakhir, dan status API Key.
- Jangan pernah menyimpan API Key dalam bentuk plaintext di database.
- Tampilkan secret API Key hanya sekali ketika pertama kali dibuat. Simpan hash yang aman untuk verifikasi selanjutnya.
- Gunakan cryptographically secure random generator dengan entropi yang memadai.
- Jangan mencatat secret API Key ke log, error tracking, atau response yang tidak semestinya.

API Key harus terikat pada identitas kelas dan tidak boleh memberikan akses lintas kelas.

### Pengaturan Permission API Key

Setiap API Key harus memiliki konfigurasi permission CRUD yang independen.

Ketua kelas harus dapat mengatur:

- Read: izin melihat atau mengambil data.
- Create: izin membuat data baru.
- Update: izin mengubah data.
- Delete: izin menghapus data.

Pengaturan dilakukan berdasarkan resource/domain yang tersedia dalam sistem.

Contoh:

| Resource | Read | Create | Update | Delete |
|---|---|---|---|---|
| Members | ✓ | ✗ | ✗ | ✗ |
| Events | ✓ | ✓ | ✓ | ✗ |
| Assignments | ✓ | ✓ | ✓ | ✓ |
| Knowledge | ✓ | ✗ | ✗ | ✗ |

Contoh di atas hanya ilustrasi.

Jangan menganggap permission CRUD sebagai satu-satunya lapisan otorisasi. Operasi khusus yang memiliki aturan bisnis tersendiri harus memiliki permission atau policy khusus apabila memang diperlukan.

## 4. Pengaturan Cakupan Pengguna (Principal Scope)

Selain mengatur operasi CRUD, Ketua Kelas harus dapat menentukan **untuk siapa API Key tersebut berlaku**.

Jangan mencampurkan permission operasi dengan cakupan subjek yang dapat diakses.

Sediakan konfigurasi cakupan akses berdasarkan kemampuan dan struktur data yang benar-benar ada dalam sistem.

Contoh kemungkinan cakupan:

- Seluruh anggota kelas.
- Anggota tertentu.
- Pemilik API Key sendiri.
- Resource milik anggota tertentu.
- Data publik.
- Data privat yang diizinkan secara eksplisit.

Ketua Kelas harus dapat mengatur cakupan tersebut secara independen untuk setiap API Key.

Contoh:

API Key A:
- Read Members: semua anggota.
- Read Member Profiles: hanya profil publik.
- Update Member Profiles: hanya profil pemilik API Key.
- Delete Members: tidak diizinkan.

API Key B:
- Read Members: anggota tertentu.
- Read Events: seluruh data.
- Create Events: seluruh kelas.
- Update Events: hanya event yang dibuat oleh anggota tertentu.
- Delete Events: tidak diizinkan.

Contoh tersebut bukan aturan baku. Sesuaikan dengan relasi data, kepemilikan resource, dan kebijakan Eclipse.

Pastikan sistem mendukung kombinasi CRUD dan cakupan pengguna tanpa harus membuat API Key baru untuk setiap kombinasi.

## 5. Arsitektur dan Implementasi API

Gunakan stack dan arsitektur yang sudah digunakan Eclipse.

- Next.js App Router.
- Vercel Functions / Route Handlers.
- Supabase PostgreSQL.
- Supabase Auth jika diperlukan untuk konteks identitas internal.

Ketentuan:

1. Gunakan REST API dengan struktur endpoint yang konsisten.
2. Gunakan prefix versi, misalnya `/api/v1/`.
3. Gunakan HTTP methods sesuai semantik REST.
4. Hindari duplikasi business logic antara API dan UI.
5. Reuse service layer atau domain logic yang sudah ada apabila memungkinkan.
6. API harus menggunakan validasi input yang konsisten.
7. Terapkan authorization pada server, bukan hanya UI.
8. Jangan mengekspos Supabase service-role key atau secret internal kepada client.
9. Jangan membuat endpoint yang melewati validasi, RLS, atau aturan bisnis yang sudah berlaku.
10. Pastikan operasi API dan operasi UI menggunakan aturan bisnis yang sama.

Jika perlu, refactor logic yang sebelumnya tertanam dalam Server Actions agar dapat digunakan bersama oleh UI dan API.

Jangan membuat implementasi kedua yang menghasilkan perilaku berbeda.

## 6. Keamanan

Implementasikan setidaknya:

- API Key hashing dan secure verification.
- Rate limiting per API Key.
- Request validation.
- Authentication dan authorization.
- Protection terhadap IDOR.
- Protection terhadap mass assignment.
- Pagination dan batas maksimum jumlah data.
- Pembatasan ukuran request.
- Sanitasi dan validasi input.
- Error handling yang tidak membocorkan informasi internal.
- Audit log untuk aktivitas API yang relevan.
- Proteksi terhadap privilege escalation.
- Revocation API Key yang berlaku segera.
- Pemisahan akses public, authenticated user, dan API Key.

API Key tidak boleh otomatis mewarisi seluruh kewenangan Ketua Kelas atau service-role Supabase.

Pastikan API Key hanya memiliki izin yang secara eksplisit diberikan oleh Ketua Kelas.

Operasi sensitif seperti perubahan role, pengelolaan admin, perubahan permission, atau penghapusan akun harus mengikuti aturan keamanan khusus dan tidak boleh otomatis tersedia hanya karena memiliki izin CRUD umum.

## 7. Developer Dashboard

Buat halaman pengelolaan API di panel Ketua Kelas.

Sediakan:

- Daftar API Key.
- Buat API Key.
- Form nama/label API Key.
- Pengaturan CRUD per resource.
- Pengaturan cakupan pengguna dan kepemilikan data.
- Edit permission.
- Aktifkan/nonaktifkan.
- Revoke API Key.
- Informasi penggunaan terakhir.
- Riwayat aktivitas API yang relevan.

Buat UI permission yang mudah dipahami. Hindari menampilkan seluruh konfigurasi teknis dalam satu form yang membingungkan.

Sediakan dokumentasi API yang menjelaskan endpoint, metode HTTP, autentikasi, permission, parameter, request body, response, dan contoh penggunaan.

## 8. Konsistensi dan Pencegahan Endpoint Duplikat

Ini merupakan persyaratan wajib.

Sebelum membuat endpoint, pastikan endpoint tersebut belum diwakili oleh endpoint lain dengan fungsi domain yang sama.

Terapkan aturan:

- Satu operasi domain yang sama harus memiliki satu endpoint kanonis.
- Perbedaan lokasi tombol atau tampilan UI tidak menciptakan endpoint baru.
- Gunakan query parameter untuk variasi filter, sorting, pagination, dan kebutuhan pencarian.
- Gunakan resource relationship atau nested route hanya jika memang diperlukan secara semantik.
- Jangan membuat beberapa endpoint yang menjalankan business logic identik hanya karena dipanggil dari modul UI berbeda.
- Endpoint khusus hanya boleh dibuat apabila terdapat perbedaan operasi bisnis yang nyata.

Buat pemeriksaan konsistensi terhadap daftar endpoint agar tidak ada duplikasi yang tidak disengaja.

## 9. Testing dan Validasi

Buat pengujian untuk memastikan:

- API Key valid dapat mengakses resource sesuai permission.
- API Key tanpa permission ditolak.
- API Key yang dicabut langsung tidak dapat digunakan.
- API Key hanya dapat mengakses cakupan pengguna yang diizinkan.
- Tidak terjadi IDOR atau akses lintas kelas.
- CRUD melalui API menghasilkan konsistensi data dengan UI.
- Operasi yang sama tidak menghasilkan endpoint duplikat.
- Data sensitif tidak bocor melalui response.
- Rate limiting bekerja.
- Permission tetap berlaku setelah konfigurasi diubah.

Gunakan pengujian otomatis yang sesuai dengan infrastruktur project saat ini. Jangan mengasumsikan Docker tersedia apabila project tidak menggunakannya dalam workflow pengujian.

## 10. Dokumentasi dan Hasil Akhir

Hasil implementasi minimal harus mencakup:

1. `docs/api-inventory.md` — hasil audit seluruh operasi sistem.
2. `docs/api-reference.md` — dokumentasi endpoint resmi.
3. `docs/api-security.md` — arsitektur keamanan dan permission.
4. Database migrations — tabel API Key, permission, scope, dan audit log sesuai kebutuhan.
5. Developer Dashboard — pengelolaan API Key dan permission.
6. API Routes — seluruh endpoint kanonis yang disepakati.
7. Automated Tests — pengujian fungsi dan keamanan.

## 11. Aturan Eksekusi

- Audit terlebih dahulu, implementasi setelah pemetaan selesai.
- Jangan menghapus atau mengubah fitur lama tanpa alasan teknis yang jelas.
- Jangan mengasumsikan nama tabel, role, atau struktur database sebelum memeriksa implementasi aktual.
- Jangan membuat endpoint berdasarkan asumsi dari tampilan UI.
- Jangan mengubah aturan bisnis hanya demi mempermudah API.
- Pertahankan kompatibilitas dengan seluruh fitur Eclipse yang sudah berjalan.
- Gunakan migration yang aman dan dapat dilacak.
- Jangan melakukan perubahan production secara langsung.
- Jika ditemukan konflik arsitektur, jelaskan dan selesaikan berdasarkan implementasi aktual, bukan asumsi.

**Kriteria keberhasilan utama:** Eclipse memiliki satu API resmi yang konsisten, tidak memiliki endpoint duplikat akibat perbedaan UI/UX, serta menyediakan API Key yang dapat dikontrol secara granular oleh Ketua Kelas berdasarkan operasi CRUD dan cakupan pengguna/resource.