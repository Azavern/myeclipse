# CHANGES — selisih terhadap ZIP `eclipse-v2` milik Anda

Dibandingkan berkas demi berkas (`diff -rq`) dengan ZIP yang Anda lampirkan. Yang tidak disebut di sini **identik** dengan ZIP Anda, termasuk `package.json`, `package-lock.json`, `tsconfig.json`, `vercel.json`, `.env.example`, `.nvmrc`, `.gitignore`, `AGENTS.md`, `DESIGN.md`, `blueprint.md`, dan migrasi 0001–0011.

Cara pakai: ZIP ini berisi proyek utuh. Jika Anda menimpa folder lama, **hapus dulu** daftar "Hapus" di bawah. Folder lama itu digantikan route group `(app)`/`(auth)`; bila dibiarkan, Next akan melihat dua halaman untuk rute yang sama dan build gagal.

## 1. Hapus (path lama, digantikan)

```
src/app/auth/
src/app/class/
src/app/events/
src/app/forgot-password/
src/app/login/
src/app/members/
src/app/schedule/
src/app/set-password/
src/app/settings/
src/app/tasks/
src/app/page.tsx
src/app/error.tsx
src/app/loading.tsx
src/app/globals.css
src/features/class/components.tsx
```

Gaya global pindah ke `src/styles/` (`tokens`, `base`, `components`, `shell`; diimpor dari `layout.tsx`). `error.tsx`, `loading.tsx`, dan `not-found.tsx` kini ada di `src/app/(app)/`, ditambah `src/app/global-error.tsx`.

## 2. Berubah

Konfigurasi dan infrastruktur
- `next.config.ts`: header keamanan (nosniff, Referrer-Policy, X-Frame-Options, Permissions-Policy, COOP).
- `src/proxy.ts`: CSP bernonce per permintaan, header diteruskan ke layout, cookie sesi diberi `httpOnly`/`sameSite=lax`/`secure` (produksi).
- `src/lib/supabase/server.ts`: bendera cookie yang sama (versi ZIP Anda tidak memuatnya). **Jangan timpa dengan versi lama.**
- `supabase/config.toml`: `schemas=["public"]`, bucket 2 MiB, `enable_signup=false` (dua tempat), sandi min 10, OTP 24 jam, `additional_redirect_urls` memakai `http`. Berlaku hanya lokal; setelan cloud diatur di dashboard.
- `scripts/bootstrap-admin.ts`
- `tests/unit/pure.test.ts`: 30 tes dalam 10 kelompok (sebelumnya 15 tes), termasuk CSP bernonce, flash, dan tema.

Layout dan komponen bersama
- `src/app/layout.tsx` (nonce untuk `<style>` tema), `src/app/not-found.tsx`
- `src/components/`: `app-shell.tsx`, `entity-form.tsx`, `image-upload.tsx`, `manage-pages.tsx`, `states.tsx`

Fitur dan pustaka
- `src/features/`: `auth/{actions,forms}`, `class/actions`, `events/actions`, `fields.ts`, `members/{actions,components}`, `portfolio/actions`, `profile/actions`, `theme/{actions,editor}`, `visibility/actions`
- `src/lib/`: `crud.ts`, `tasks.ts`, `time.ts`, `storage/{sign,upload}.ts`, `theme/{contrast,css,defaults,fonts}.ts`
- `upload.ts`: `removeObject` kini mencatat log bila tidak ada objek yang terhapus (RLS menyaringnya tanpa galat).

## 3. Baru

Aplikasi
- `src/app/(app)/` (semua halaman beranda, kelas, jadwal, event, tugas, anggota, pengaturan; `/settings` mengalihkan ke `/settings/profile`)
- `src/app/(auth)/` (login, lupa sandi, set sandi, konfirmasi tautan)
- `src/app/dev/ui/` (galeri state; 404 di produksi), `src/app/global-error.tsx`
- `src/styles/` (token, shell, komponen)
- `src/components/`: `field.tsx`, `flash.tsx`, `image-form.tsx`, `nav.tsx`, `ui/`
- `src/features/home/`, `members/{directory,member-card}.tsx`, `tasks/task-row.tsx`
- `src/lib/`: `cx.ts`, `flash.ts`, `security/` (CSP), `theme/presets.ts`, `storage/swap.ts`, `supabase/cookie-types.ts`

Database dan tes
- `supabase/migrations/20261012120000_theme_default_v2.sql` (0012): tema bawaan v2, hanya untuk kelas yang masih memakai bawaan lama.
- `supabase/migrations/20261017120000_class_media_manage_select.sql` (0013): **wajib diterapkan sebelum deploy kode.** Memperbaiki penghapusan objek `class-media` yang diam-diam gagal (lihat `STATUS.md`).
- `supabase/tests/003_storage.test.sql` (40 pengecekan).

CI dan dokumen
- `.github/workflows/ci.yml` (npm; `check:tokens`, `typecheck`, `test`, `build`; dan `supabase test db`)
- `docs/STATUS.md` (ditulis ulang), `docs/CHANGES.md` (berkas ini)

## 4. Tidak ikut

- Tes e2e Playwright/axe (tidak ada Playwright di manifest dan tidak dapat diverifikasi di sandbox).
- Harness render yang dipakai untuk pemeriksaan visual (memakai data palsu, bukan bagian aplikasi).
- `node_modules`, `.next`, `.env*` (kecuali `.env.example`), `supabase/.temp`.
