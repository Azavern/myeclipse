# Eclipse — Sistem Kelas Mahasiswa

Rumah digital untuk satu kelas mahasiswa (±20 anggota): identitas kelas, anggota beserta profil dan portofolio, jadwal kuliah, event, tugas, dan beranda ringkas. Bukan LMS, bukan sistem akademik, bukan platform chat.

Nama kelas tidak ditulis di kode. Semua tampilan membaca `classes.name` (data awal: `Eclipse`).

## Fitur

- **Autentikasi tanpa pendaftaran mandiri.** Akun dibuat Ketua, lalu anggota masuk lewat tautan akses sekali pakai.
- **Dynamic Visibility.** Ketua dan anggota mengatur siapa yang boleh melihat halaman, section, field, dan item (portofolio, social media). Audience: `public`, `authenticated`, `class_member`, `class_admin`, `self`. Data personal default-nya `class_member`; hanya identitas kelas yang `public`.
- **Role dan permission.** Ketua dan Member. Hak admin berupa permission pada role, bukan pengecekan nama role.
- **Modul kelas.** Identitas dan tema kelas, direktori anggota, profil, portofolio (halaman pengelolaan terpisah dari profil), jadwal kuliah mingguan per semester, event, tugas (dengan mata kuliah), dan beranda.
- **Eclipse Knowledge.** Perpustakaan pengetahuan bersama: entri Markdown dengan pratinjau, pencarian/filter/sort, draf lokal, penanda bagian yang diedit, serta alur permintaan akses edit (penulis, editor, dan eskalasi ke Ketua). Entri publik dapat dibaca tanpa masuk.
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

   Migration berada di `supabase/migrations/` (0001–0014) dan diterapkan berurutan. Jangan menjalankan ulang atau mengubah migration yang sudah diterapkan; perubahan skema ditulis sebagai migration baru.

4. **Atur Auth** di dashboard Supabase (padanan `supabase/config.toml`):

   - Sign up dinonaktifkan
   - Panjang kata sandi minimum 10
   - Masa berlaku OTP/tautan 86400 detik (24 jam)
   - Site URL dan redirect allowlist diisi `APP_URL`

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
| `SUPABASE_SECRET_KEY` | Kunci service role. **Rahasia.** Hanya untuk Auth Admin API dan skrip |
| `APP_URL` | Dasar URL tautan akses, tanpa slash di akhir (lokal: `http://localhost:3000`) |
| `CRON_SECRET` | String acak ≥32 karakter untuk otorisasi `/api/health` |
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

Tidak ada pengiriman email; tautan dibagikan Ketua secara manual.

## Pemecahan masalah

**"Tautan ini tidak lengkap" di `/auth/confirm`.** Token ada di fragment URL (`#token_hash=…&type=recovery`) dan dihapus dari address bar setelah dibaca. Menyegarkan halaman setelah itu menghilangkan token. Buka ulang tautan aslinya secara utuh. Pastikan tautan tidak terpotong saat disalin.

**"Tautan ini tidak berlaku lagi".** Tautan berlaku 24 jam, sekali pakai, dan menerbitkan tautan baru membatalkan yang lama. Minta Ketua menerbitkan tautan baru, atau jalankan `npm run bootstrap:admin` lagi untuk Ketua pertama.

**`bootstrap:admin` gagal dengan "Kelas tidak ditemukan".** Migration belum diterapkan. Jalankan `supabase db push`.

**Skrip berhenti karena env kosong.** Pastikan `.env.local` berisi semua variabel yang diminta pada pesan error.

## Deployment

1. Terapkan migration ke proyek Supabase produksi (`supabase db push`).
2. Atur Auth di dashboard sesuai langkah 4 di atas.
3. Isi environment variable di Vercel (Production). Jangan isi `BOOTSTRAP_ADMIN_*`.
4. Deploy, lalu jalankan `npm run bootstrap:admin` secara lokal dengan env produksi.
5. Cron harian memanggil `/api/health` dengan `Authorization: Bearer <CRON_SECRET>` agar proyek Supabase free tier tidak dijeda.

Batasan free tier: tidak ada point-in-time recovery, jadi lakukan ekspor berkala dengan `supabase db dump` dan simpan di luar repo.

## Keamanan

- Jangan commit `.env.local`, kunci Supabase, atau tautan akses.
- Semua keputusan akses ditegakkan di database (RLS, view bermasker, RPC, policy Storage); UI hanya lapisan tambahan.
- Tautan akses adalah kredensial. Ketua yang menerbitkannya dapat mengambil alih akun anggota sebelum dipakai; risiko ini diterima untuk kelas kecil (lihat `blueprint.md` §23).
