# Eclipse — Sistem Kelas Mahasiswa

Rumah digital untuk satu kelas mahasiswa (±20 anggota): identitas kelas, anggota beserta profil dan portofolio, jadwal kuliah, event, tugas, dan beranda ringkas. Bukan LMS, bukan sistem akademik, bukan platform chat.

Nama kelas tidak ditulis di kode. Semua tampilan membaca `classes.name` (data awal: `Eclipse`).

## Fitur

- **Autentikasi tanpa pendaftaran mandiri.** Akun dibuat Ketua, lalu anggota masuk lewat tautan akses sekali pakai. Tersedia juga **Masuk dengan Google** untuk email akun yang sudah terverifikasi, tanpa membuat akun atau keanggotaan baru.
- **Verifikasi email lewat OTP.** Di **Pengaturan → Keamanan akun**, anggota dapat mengganti email kapan saja. Kode 6 angka dikirim ke alamat baru lewat SMTP aplikasi, berlaku 5 menit, sekali pakai, dan email Supabase baru berubah setelah kode diverifikasi.
- **Dynamic Visibility.** Ketua dan anggota mengatur siapa yang boleh melihat halaman, section, field, dan item (portofolio, social media). Audience: `public`, `authenticated`, `class_member`, `class_admin`, `self`. Data personal default-nya `class_member`; hanya identitas kelas yang `public`.
- **Role dan permission.** Ketua, Wakil Ketua, Sekretaris, Bendahara, dan Member. Ketua hanya satu, Wakil Ketua maks. 3, Sekretaris maks. 5, Bendahara maks. 2; mempromosikan Ketua baru otomatis menurunkan Ketua lama menjadi Wakil Ketua. Hak admin berupa permission pada role, bukan pengecekan nama role. Halaman **Akses role** khusus Ketua berisi checklist akses per jabatan yang langsung tersimpan. Kelola anggota penuh hanya milik Ketua; jabatan lain dapat diberi akses mengajukan promosi/demosi jabatan, dan setiap pengajuan baru berlaku setelah Ketua menyetujuinya.
- **Modul kelas.** Identitas dan tema kelas, direktori anggota, profil, portofolio (halaman pengelolaan terpisah dari profil), jadwal kuliah mingguan per semester, event, tugas (dengan mata kuliah), dan beranda.
- **Eclipse Knowledge.** Perpustakaan pengetahuan bersama: entri Markdown dengan pratinjau, pencarian/filter/sort, draf lokal, penanda bagian yang diedit, serta alur permintaan akses edit (penulis, editor, dan eskalasi ke Ketua). Entri publik dapat dibaca tanpa masuk.
- **Inventory pribadi.** Daftar tautan https milik tiap anggota, tidak dijelajahi bersama. Pemilik membagikan seluruh isinya lewat `inv_key` 16 karakter (custom atau acak) dengan masa aktif 24 jam, 7 hari, 1 bulan, 6 bulan, atau tanpa kedaluwarsa. Maksimal 12 key aktif bersamaan; mencabut atau membiarkan key kedaluwarsa mengosongkan slot. Halaman `/inventory/access` membuka inventory dengan key tanpa perlu login.
- **QR Studio.** Halaman publik `/qr` untuk membuat QR tanpa login. Tautannya selalu ada di navigasi utama, untuk tamu maupun anggota. Dua mode: **Normal** (modul kotak standar) dan **Custom** (titik kotak/bulat/balok, warna, serta ikon tengah dengan bentuk border, crop/shrink, gap, ketebalan, dan outline). Balok dapat memakai orientasi horizontal, vertikal, diagonal turun, atau diagonal naik. Anggota aktif mendapat pratinjau langsung di browser; tamu mengirim parameter ke server dan tidak menerima modul pembuat QR. Sebelum tamu membuat QR, muncul pilihan **Ingin donasi?**; bila memilih ya, QRIS donasi yang diatur Bendahara/Ketua ditampilkan lebih dulu. Gambar PNG disimpan maksimal 6 jam di bucket publik `qr-shares`, dengan URL gambar dan tombol unduh.
- **Cloud Google Drive.** Anggota aktif mengunggah file langsung dari peramban ke Google Drive lewat sesi resumable yang dibuat server (file tidak melewati server Eclipse). Folder tujuan mengikuti pilihan unggahan → default pribadi → folder kategori → folder utama. Setiap anggota dapat membuat folder custom, menambahkan folder eksternal (wajib *Anyone with the link → Editor*, diuji dengan dummy.txt), dan menetapkan default. Ketua mengatur batas ukuran (bawaan 500 MB) dan izin ZIP/RAR di **Pengaturan → Cloud**.
- **Syarat & Privasi.** Halaman publik `/terms` dan `/privacy` menjelaskan ketentuan penggunaan dan pemrosesan data; ditautkan dari halaman masuk dan pengaturan keamanan akun.
- **PWA.** Manifest, service worker, dan halaman offline membuat aplikasi dapat dipasang ke beranda. Hanya aset statis yang di-cache; halaman berisi data anggota tidak disimpan di cache.

## Stack

| Lapisan | Pilihan |
|---|---|
| Framework | Next.js (App Router), React, TypeScript strict |
| Database, Auth, Storage | Supabase (Postgres + RLS) |
| Styling | Tailwind CSS dengan token desain |
| Validasi | Zod |
| Hosting | Vercel + Supabase free tier |

Semua baca/tulis konten memakai client Supabase dengan JWT pengguna, sehingga RLS di database menjadi penegak akses. Tidak ada client Supabase di browser; mutasi lewat Server Actions.

## Dokumen acuan

| File | Isi |
|---|---|
| `blueprint.md` | Rancangan lengkap: skema, RLS, visibility, route, komponen, fase, acceptance criteria |
| `AGENTS.md` | Aturan engineering untuk agent AI |
| `DESIGN.md` | Aturan desain UI/UX (v2) |
| `docs/STATUS.md` | Progres, gap, dan keputusan sementara |

Bila `blueprint.md` bertentangan dengan `AGENTS.md` atau `DESIGN.md`, dua yang terakhir menang.

## Prasyarat

- Node.js LTS dan npm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Proyek Supabase (region Singapore disarankan)

## Menjalankan secara lokal

1. **Pasang dependensi** dari lockfile:

   ```cmd
   npm ci
   ```

2. **Siapkan environment.** Salin template lalu isi nilainya (jangan commit `.env.local`):

   ```cmd
   copy .env.example .env.local
   ```

3. **Hubungkan dan terapkan migration** ke proyek Supabase:

   ```cmd
   supabase link --project-ref <project-ref>
   supabase db push
   ```

   Migration berada di `supabase/migrations/` (0001–0035) dan diterapkan berurutan. Jangan menjalankan ulang atau mengubah migration yang sudah diterapkan; perubahan skema ditulis sebagai migration baru.

4. **Atur Auth** di dashboard Supabase (padanan `supabase/config.toml`):

   - Sign up dinonaktifkan
   - Panjang kata sandi minimum 10
   - Masa berlaku OTP/tautan 86400 detik (24 jam)
   - Site URL dan redirect allowlist diisi `APP_URL`
   - **Provider Google** diaktifkan (Client ID/Secret dari Google Cloud Console). Login memakai Google Identity Services: browser mengambil ID token dari Google, lalu Server Action menukarnya menjadi sesi dengan `signInWithIdToken`. Di Google Cloud Console, *authorized JavaScript origin* = `APP_URL` (tambahkan `http://localhost:3000` untuk lokal); *authorized redirect URI* `https://<project-ref>.supabase.co/auth/v1/callback` tetap diperlukan saat membuat client OAuth. Client ID publik dibaca aplikasi dari `GOOGLE_CLIENT_ID`; client secret hanya ada di Supabase. Pengguna Google yang bukan anggota tidak mendapat akses.
   - Konfirmasi email Supabase **tidak** dipakai untuk alur ganti email: kode OTP dikirim aplikasi lewat SMTP sendiri (lihat `SMTP_EMAIL`/`SMTP_PASSWORD`).

5. **Buat Ketua pertama:**

   ```cmd
   npm run bootstrap:admin
   ```

   Skrip mencetak tautan akses ke terminal (tidak disimpan di mana pun). Buka tautan itu, tekan **Lanjutkan**, lalu buat kata sandi. Skrip menolak berjalan bila kelas sudah punya Ketua aktif, dan bila Ketua masih berstatus menunggu aktivasi, skrip hanya menerbitkan tautan baru.

6. **Jalankan aplikasi:**

   ```cmd
   npm run dev
   ```

   Buka `http://localhost:3000`.

## Variabel lingkungan

Tidak ada variabel `NEXT_PUBLIC_*`: semuanya dibaca di server dan divalidasi saat startup.

| Variabel | Fungsi |
|---|---|
| `SUPABASE_URL` | URL proyek Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Kunci publishable (anon). Dipakai server, tidak dikirim ke browser |
| `SUPABASE_SECRET_KEY` | Kunci service role. **Rahasia.** Hanya untuk Auth Admin API, unggah/pembersihan gambar QR, dan skrip |
| `APP_URL` | Dasar URL tautan akses dan origin login Google, tanpa slash di akhir (lokal: `http://localhost:3000`). Tulis dengan skema yang benar (`https://` di produksi): origin ini dipakai saat masuk dengan Google dan saat membuat sesi unggah Drive |
| `GOOGLE_CLIENT_ID` | Client ID OAuth (Web) untuk tombol Google Identity Services. Bukan rahasia; client secret tidak dipakai aplikasi |
| `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN` | **Rahasia**, hanya server. OAuth client + refresh token akun Google pemilik folder. Tanpa ketiganya fitur Cloud menampilkan pesan konfigurasi |
| `GDRIVE_ROOT_FOLDER_ID` | Folder utama Google Drive untuk fallback kategori dan induk default folder custom |
| `GDRIVE_PICTURES`, `GDRIVE_VIDEOS`, `GDRIVE_AUDIOS`, `GDRIVE_DOCUMENTS`, `GDRIVE_ARCHIVES_ID` | Folder kategori opsional. Yang kosong memakai `GDRIVE_ROOT_FOLDER_ID` |
| `GDRIVE_CUSTOM` | Induk folder custom anggota. Opsional; kosong berarti memakai root |
| `GDRIVE_UPLOAD_ORIGINS` | Origin peramban tambahan yang boleh mengunggah langsung (dipisah koma, tanpa path), mis. origin lain milik aplikasi. `APP_URL` dan origin yang host-nya sama dengan permintaan sudah otomatis diizinkan |
| `CRON_SECRET` | String acak ≥32 karakter untuk otorisasi `/api/health` dan pemanggilan pembersih QR terjadwal |
| `SMTP_EMAIL`, `SMTP_PASSWORD` | Akun Gmail pengirim OTP perubahan email (App Password). Opsional; tanpa keduanya tombol Verifikasi email gagal mengirim kode |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` | Data Ketua pertama. Hanya untuk skrip lokal, jangan diset di Vercel |

Jika `SUPABASE_SECRET_KEY` pernah terekspos (commit, log, screenshot), anggap bocor dan rotasi segera.

## Skrip

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run lint` | ESLint |
| `npm run typecheck` | Pemeriksaan tipe |
| `npm test` | Tes unit (Vitest) |
| `npm run test:db` | Tes database pgTAP lewat koneksi Postgres langsung (`POSTGRES_URL`); `-- --isolate` untuk DB berisi data |
| `npm run test:e2e` | Tes end-to-end (Playwright) |
| `npm run db:types` | Generate `src/lib/supabase/database.types.ts` |
| `npm run check:tokens` | Larang hex dan nilai arbitrer di komponen |
| `npm run bootstrap:admin` | Buat Ketua pertama + tautan akses |
| `npm run seed` | Buat akun anggota dari `SEED_MEMBERS` di `scripts/seed-fixtures.ts`; idempoten, dan `-- --dry-run` hanya mencetak rencana |

Daftar di atas mengikuti `blueprint.md` §20; sumber yang berlaku adalah `scripts` di `package.json`.

## Struktur proyek

```text
supabase/migrations/   skema, RLS, trigger, view, RPC, Storage, data referensi
supabase/tests/        tes pgTAP
scripts/               bootstrap-admin, seed fixture (lokal saja), check-tokens
e2e/                   tes Playwright
src/app/               route
src/features/<modul>/  queries, actions, schemas, komponen per modul
src/components/        primitive UI, layout, komponen visibility
src/lib/               env, Supabase client, visibility, theme, storage, waktu
docs/STATUS.md         progres dan gap
```

Aturan batas import: `lib/supabase/admin.ts` hanya boleh diimpor dari `features/*/actions.ts` dan `scripts/`; `components/ui` tidak boleh mengimpor dari `features/`.

## Alur akun

1. Ketua menambah anggota di **Pengaturan → Anggota**. Aplikasi menampilkan tautan akses sekali (tidak disimpan).
2. Ketua membagikan tautan itu, misalnya lewat WhatsApp.
3. Anggota membuka tautan, menekan **Lanjutkan**, lalu membuat kata sandi. Status berubah dari `invited` menjadi `active`.
4. Lupa kata sandi: anggota mengirim permintaan dari halaman masuk, lalu Ketua menerbitkan tautan akses baru.
5. Ganti email: anggota membuka **Pengaturan → Keamanan akun**, mengisi email baru, lalu menekan **Verifikasi**. Kode 6 angka dikirim ke alamat baru (berlaku 5 menit, sekali pakai, kirim ulang minimal 30 detik). Email akun baru berubah setelah kode benar.
6. Masuk dengan Google tersedia di halaman masuk lewat Google Identity Services, tetapi hanya untuk email yang sudah terverifikasi dan akun yang sudah menjadi anggota aktif. Akun Google dengan email yang sama dengan akun kata sandi memakai akun itu (automatic linking Supabase), jadi tidak ada akun ganda.

Email hanya dikirim untuk kode OTP perubahan email; tautan akses tetap dibagikan Ketua secara manual.

## Pemecahan masalah

**"Tautan ini tidak lengkap" di `/auth/confirm`.** Token ada di fragment URL (`#token_hash=…&type=recovery`) dan dihapus dari address bar setelah dibaca. Menyegarkan halaman setelah itu menghilangkan token. Buka ulang tautan aslinya secara utuh. Pastikan tautan tidak terpotong saat disalin.

**"Tautan ini tidak berlaku lagi".** Tautan berlaku 24 jam, sekali pakai, dan menerbitkan tautan baru membatalkan yang lama. Minta Ketua menerbitkan tautan baru, atau jalankan `npm run bootstrap:admin` lagi untuk Ketua pertama.

**`bootstrap:admin` gagal dengan "Kelas tidak ditemukan".** Migration belum diterapkan. Jalankan `supabase db push`.

**Skrip berhenti karena env kosong.** Pastikan `.env.local` berisi semua variabel yang diminta pada pesan error.

**Kode OTP tidak sampai.** Pastikan `SMTP_EMAIL` dan `SMTP_PASSWORD` (App Password Gmail) benar dan tidak dibatasi jaringan. Server memverifikasi kredensial saat mengirim; kegagalan dicatat di log server tanpa isi kode.

**"Belum terdaftar sebagai anggota" / "email belum terverifikasi" setelah menekan Masuk dengan Google.** Google hanya membuktikan identitas. Verifikasi email lewat OTP di Keamanan akun, dan keanggotaan tetap harus dibuat Ketua. Bila akun Google memakai alamat lain daripada akun kelas, sesi langsung diakhiri; masuk dengan kata sandi akun yang benar.

**Tombol Google tidak muncul atau "tidak bisa dimuat".** Skrip `accounts.google.com/gsi/client` diblokir ekstensi/ jaringan, atau `GOOGLE_CLIENT_ID` belum diisi; login kata sandi tetap berfungsi. Bila pop-up Google diblokir peramban, izinkan pop-up untuk situs ini lalu tekan **Coba masuk dengan Google lagi**.

## Deployment

1. Terapkan migration ke proyek Supabase produksi (`supabase db push`).
2. Atur Auth di dashboard sesuai langkah 4 di atas.
3. Isi environment variable di Vercel (Production). Jangan isi `BOOTSTRAP_ADMIN_*`.
4. Deploy, lalu jalankan `npm run bootstrap:admin` secara lokal dengan env produksi.
5. Cron harian memanggil `/api/health` dengan `Authorization: Bearer <CRON_SECRET>` agar proyek Supabase free tier tidak dijeda; cron itu juga menyapu gambar QR yang lewat 6 jam. Halaman `/qr` dan unggahan baru ikut menyapu file kedaluwarsa saat ada aktivitas. Untuk retensi yang lebih ketat, jadwalkan `POST /api/qr/cleanup` setiap jam dengan header `Authorization: Bearer <CRON_SECRET>` (Vercel Pro atau cron eksternal); jadwal per jam tidak tersedia di paket Hobby Vercel.

Batasan free tier: tidak ada point-in-time recovery, jadi lakukan ekspor berkala dengan `supabase db dump` dan simpan di luar repo.

## Keamanan

- Jangan commit `.env.local`, kunci Supabase, atau tautan akses.
- Semua keputusan akses ditegakkan di database (RLS, view bermasker, RPC, policy Storage); UI hanya lapisan tambahan.
- Bucket `qr-shares` sengaja publik agar gambar QR bisa dibuka tanpa login. Objek ditulis hanya oleh server dengan service role, memakai nama UUID acak; tidak ada policy daftar/tulis/hapus untuk anon, dan file disapu setelah 6 jam.
- QRIS donasi QR Studio disimpan di bucket privat `qr-studio-media`. Bendahara/pemegang `kas.manage` dan Ketua dapat mengunggahnya; tamu hanya menerima URL bertanda tangan singkat setelah memilih donasi. QRIS ini terpisah dari QRIS kas.
- Tautan akses adalah kredensial. Ketua yang menerbitkannya dapat mengambil alih akun anggota sebelum dipakai; risiko ini diterima untuk kelas kecil (lihat `blueprint.md` §23).
