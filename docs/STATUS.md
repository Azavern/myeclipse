# STATUS

Dokumen ini mencatat keadaan yang BENAR-BENAR terverifikasi, bukan rencana. Aturan pengembangan ada di `AGENTS.md`, aturan tampilan di `DESIGN.md` (v2), spesifikasi produk di `blueprint.md`.

## Ringkasan

Semua halaman, alur akun, CRUD, pengaturan, tema, dan Storage yang dirancang sudah ada, dengan tampilan sesuai DESIGN.md v2. Kode, migrasi, dan tes yang bisa dijalankan di sandbox lulus. **Yang belum pernah terjadi:** `npm install`, `next build`, dan menjalankan aplikasi terhadap Supabase asli (registry npm dan Supabase tidak terjangkau dari sandbox). Jadi urutan di bagian "Sebelum deploy" wajib dijalankan di mesin Anda; jangan menganggap build ini sudah terbukti jalan sampai langkah itu hijau.

## Isi aplikasi

Manajer paket: **npm** (`package-lock.json` milik Anda, tidak diubah). Node 22 (`.nvmrc`).

Rute (32 halaman + 1 route handler):

| Kelompok | Rute |
|---|---|
| Publik/auth `(auth)` | `/login`, `/forgot-password`, `/set-password`, `/auth/confirm` |
| Aplikasi `(app)` | `/` (Beranda), `/class`, `/schedule` (+ `new`, `[id]/edit`), `/events` (+ `new`, `[id]`, `[id]/edit`), `/tasks` (+ `new`, `[id]`, `[id]/edit`), `/members`, `/members/[username]` |
| Pengaturan `(app)/settings` | `profile`, `account`, `class`, `visibility`, `theme`, `members`, `members/[id]`, `portfolio/new`, `portfolio/[id]/edit`, `social/new`, `social/[id]/edit`; `/settings` hanya mengalihkan ke `/settings/profile` |
| Lain-lain | `/api/health` (cron harian, Bearer `CRON_SECRET`), `/dev/ui` (galeri state; `notFound()` saat `NODE_ENV=production`) |

Database: migrasi **0001–0013** (`supabase/migrations`). Tes DB: `supabase/tests/001_visibility`, `002_actions`, `003_storage`.

## Keputusan tampilan (DESIGN.md v2) yang perlu Anda ketahui

- Sidebar ikon ≥1024px, **rel ikon 768–1023px** (bukan BottomNav), bilah atas + tab bawah <768px. Rel ikon untuk tablet menyimpang dari blueprint §16 karena DESIGN.md v2 yang menentukan; ubah di `src/components/nav.tsx` + `src/styles/shell.css` bila blueprint yang ingin diikuti.
- Beranda: kartu KPI langsung setelah hero, dan urutan preset `profile_focused` diterapkan di semua lebar layar. Blueprint menyebut ponsel mengabaikan preset; di sini tidak.
- Grafik tren aktivitas memakai batang HTML (kelas `.pct-N`), bukan SVG, supaya tidak butuh atribut `style` (lihat CSP).
- Tidak ada atribut `style` inline di mana pun. Pratinjau tema memakai CSSOM (`setProperty`), SVG memakai atribut `fill`.
- Form: `useActionState`, toast lewat cookie flash (`lib/flash.ts`), unggah gambar lewat `ImageForm`; hapus lewat `<dialog>` konfirmasi.
- Tema bawaan baru (teal + aksen hangat, font Rounded) ada di `lib/theme/defaults.ts`. Migrasi 0012 menggantinya di DB **hanya** untuk kelas yang temanya masih persis bawaan lama; tema kustom Ketua tidak disentuh. `DEFAULT_THEME` dan nilai di 0012 dijaga identik oleh tes unit.

## Keamanan

- `src/proxy.ts` (Next 16): CSP per-permintaan dengan nonce (`lib/security/csp.ts`), diteruskan ke layout lewat header `x-nonce`, dibangun ulang setelah refresh cookie. Baseline mengikuti blueprint §23; `unsafe-eval` dan `ws:` hanya di mode dev; `img-src` mengizinkan origin Supabase.
- `next.config.ts`: X-Content-Type-Options, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, COOP same-origin. HSTS diserahkan ke Vercel.
- Cookie sesi Supabase diberi `httpOnly`, `sameSite=lax`, `secure` (produksi), `path=/` di `proxy.ts` dan `lib/supabase/server.ts` (jangan dihapus saat merge dengan versi lama kedua berkas itu, yang tidak memuatnya).
- Admin client hanya untuk Auth Admin API; semua baca/tulis konten memakai JWT pengguna di bawah RLS.
- `supabase/config.toml`: `enable_signup=false` (lokal), sandi minimal 10, OTP 24 jam, hanya schema `public` yang diekspos, batas bucket 2 MiB. **Pengaturan ini hanya berlaku lokal.** Di proyek cloud, matikan "Allow new users to sign up" dan samakan Site URL/Redirect URL di dashboard.

## Temuan penting saat verifikasi

**Migrasi 0013 (WAJIB diterapkan sebelum kode ini dideploy).** Tes `003_storage` membuktikan cacat nyata di migrasi 0007: Postgres menerapkan policy SELECT juga pada DELETE ber-WHERE, sehingga setelah baris logo/sampul/cover event dialihkan ke objek baru, `storage.remove()` oleh Ketua mengenai 0 baris tanpa galat. Objek lama tidak pernah terhapus. 0013 menambahkan klausa baca untuk pemegang `class.manage`/`events.manage` hanya di folder yang memang boleh mereka tulis. Tidak ada perubahan untuk anonim dan anggota biasa. `removeObject` kini mencatat log bila tidak ada objek yang terhapus.

**Batasan yang tersisa (D-13).** Objek Storage yang yatim (mis. gagal dibersihkan, atau item/event dihapus) tidak disapu otomatis; tidak ada job pembersih.

## Hasil verifikasi (dijalankan, bukan dibaca)

| Cek | Hasil | Catatan |
|---|---|---|
| Tes unit | **30/30** lulus | Dijalankan di Node dengan shim vitest (vitest asli tidak terpasang). Memuat tes CSP nonce dan paritas tema bawaan. |
| `tsc` strict + `noUncheckedIndexedAccess` | **0 error** | TypeScript 6.0.3 di sandbox (manifest Anda: `^5.6.0`). Tipe `next`, `react`, `@supabase/*` memakai STUB longgar, jadi salah pakai API pihak ketiga tidak terdeteksi. |
| `scripts/check-tokens.mjs` | bersih | Tidak ada warna hex/rgb/hsl, nilai arbitrer ala Tailwind, atau warna literal di `src/components`, `src/features`, `src/app` (editor tema dikecualikan). |
| Tes DB (PostgreSQL 16 lokal) | 001: 18, 002: 36, 003: 40 = **94 lulus** | Pada DB baru dengan 13 migrasi. Lingkungan Supabase DISTUB (role, `auth.users`/`auth.uid()`, `storage.*`) dan pgTAP memakai shim; bukan `supabase test db` asli. |
| Render halaman | 33 skenario dirender dan dicek visual (ponsel, tablet, desktop) | Pemeriksaan otomatis pada 390 dan 768px: target sentuh ≥44px, tanpa overflow horizontal, nama aksesibel pada kontrol. Memakai harness dengan data palsu; bukan `next build`. Harness tidak disertakan dalam ZIP. |
| Kode ↔ skema | 0 ketidakcocokan | Kolom `.select()`, `.rpc()`, nama field form, dan kunci Zod dicocokkan dengan katalog DB. Satu positif palsu pada `features/profile/actions.ts` (variabel skema bernama `profile`). |
| Tautan internal | 32 rute, 0 tujuan tak dikenal | |

## BELUM terverifikasi

- `npm ci`, `next build`, hidrasi, dan interaktivitas klien (dialog, toast, MoreSheet, unggah/crop gambar, pratinjau tema) di browser sungguhan.
- Supabase asli: Auth (`generateLink`, `verifyOtp` recovery, `ban_duration`, `signOut` scope others), RLS dan Storage terhadap JWT sungguhan, `supabase test db` dengan pgTAP asli.
- CSP pada build asli: apakah nonce sampai ke skrip Next, perilaku HMR di dev, dan apakah `next/font/google` (Fraunces, Source Sans 3, Bricolage Grotesque, Public Sans, Nunito, Nunito Sans; build mengunduh dan menyajikannya dari origin sendiri, perlu akses jaringan saat build) lolos `font-src 'self'`.
- `npm audit`: laporan Anda menyebut 3 kerentanan (1 moderat, 2 kritis). Belum diselidiki di sini (tidak ada akses registry); jalankan `npm audit` dan kirim hasilnya. Juga peringatan postinstall esbuild.
- **Tes e2e Playwright dan axe tidak disertakan**: manifest tidak punya Playwright dan tidak bisa diverifikasi di sandbox. Aksesibilitas baru dicek lewat pemeriksaan otomatis di harness render dan baca kode.

## Sebelum deploy (urutan)

1. `npm ci` (memakai `package-lock.json` Anda) lalu `npm audit`.
2. `npm run check:tokens && npm run typecheck && npm test`.
3. `supabase start`, `supabase db reset` (0001–0013), `npm run test:db`.
4. Isi `.env.local` dari `.env.example`, lalu `npm run build`. Env hanya dibaca dari `.env.local`/environment; jangan menyalin nilai rahasia ke log.
5. Proyek cloud: `supabase db push` (**0013 harus ikut**), matikan signup, atur Site URL/Redirect URL, isi env di Vercel (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_URL`, `CRON_SECRET`).
6. `npm run bootstrap:admin` sekali (menolak jalan bila Ketua aktif sudah ada), buka tautan yang tercetak, buat kata sandi.
7. Buka tiap rute pada ponsel dan desktop; uji unggah logo, sampul, avatar, cover event; hapus salah satunya dan pastikan objek lama hilang dari bucket.

## Blueprint vs migrasi (migrasi = sumber kebenaran; blueprint belum diperbarui)

1. `schedules` (0010): `day_of_week`, `start_time`, `end_time`, `semester` (mingguan per semester) menggantikan `start_at/end_at`. Blueprint §5.3, §8.3, §10, §14.2, §19, AC-SCHEDULE masih memakai model bertanggal.
2. Halaman Schedule adalah jadwal KULIAH, terpisah dari event. V-08 (gabungan event + tenggat tugas) perlu diputuskan ulang.
3. `tasks.course` (0009): nullable di DB, wajib di Zod; baris lama tampil "Tanpa mata kuliah".
4. `password_reset_requests` (0011): antrean "lupa sandi" untuk Ketua. Insert memakai service role dari Server Action anonim (menyimpang dari blueprint §3.2); jawaban selalu generik, hanya email anggota yang dicatat, satu permintaan menunggu per email. **Belum ada limiter laju** (D-09 hanya mencakup login).
5. Typo pada komentar 0011 ("Chairs"): migrasi sudah applied, jangan diubah.
6. Pencarian email di aksi anggota memakai `listUsers` (200 pertama): cukup untuk ±20 anggota, tidak untuk kelas besar.

## Catatan runbook

- Migrasi yang sudah diterapkan ke database mana pun jangan diubah; tambah migrasi baru.
- `supabase/.temp/` tidak disertakan dan jangan di-commit (berisi referensi proyek).
