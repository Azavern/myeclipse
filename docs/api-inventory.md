# Eclipse API Inventory

Hasil audit codebase sebelum implementasi Developer API. Dokumen ini adalah acuan
kanonis: satu operasi domain = satu endpoint, bukan satu tombol UI = satu endpoint.

Riwayat audit: 3 November 2026. Sumber: `src/app`, `src/features`, `src/lib`,
`supabase/migrations`, dan `supabase/tests`.

## 1. Model otorisasi yang berlaku

- Identitas pengguna berasal dari Supabase Auth (`auth.users`), bukan tabel users baru.
- Keanggotaan: `memberships.status` (`invited`, `active`, `inactive`) + `roles`.
- Permission role saat ini: `class.manage`, `members.manage`, `members.request`,
  `schedule.manage`, `events.manage`, `tasks.manage`.
- RLS + trigger + RPC adalah penegak aturan. UI hanya lapisan tampilan.
- API Key **tidak** mewarisi permission Ketua atau service role. Izinnya eksplisit
  per resource dan per operasi, dengan cakupan subjek terpisah.

## 2. Domain dan operasi kanonis

Kolom "Sumber sekarang" menunjukkan implementasi yang sudah ada; API memakai
aturan validasi dan tabel yang sama, bukan implementasi kedua yang berbeda.

### 2.1 Class profile

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| Read | `class_identity_v` di Beranda/Kelas; `getClass()` | `classes` | `GET /api/v1/class` | `class_profile.read` |
| Update | `updateClass` (`src/features/class/actions.ts`) | `classes` | `PATCH /api/v1/class` | `class_profile.update` |
| Update theme | `updateTheme` (`src/features/theme/actions.ts`) | `classes.theme` | Tidak diekspos v1 | — |
| Logo/cover | `uploadClassImage`, `removeClassImage` | `classes.logo_path/cover_path`, Storage | Tidak diekspos (media) | — |

Aturan: `name` 1–60, `code` `^[A-Za-z0-9-]{2,20}$` atau null, `tagline` ≤120,
`description` ≤800, `highlight_text` ≤160, `highlight_url` https, timezone salah satu
dari tiga zona. `class_id` selalu dari sesi/API key, tidak pernah dari body.

### 2.2 Class links

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| Read | `src/app/(app)/class/page.tsx` | `class_links` | `GET /api/v1/class/links` | `class_links.read` |
| Create | Belum ada tombol UI; policy/GRANT sudah ada | `class_links` | `POST /api/v1/class/links` | `class_links.create` |
| Update | Belum ada tombol UI | `class_links` | `PATCH /api/v1/class/links/{id}` | `class_links.update` |
| Delete | Belum ada tombol UI | `class_links` | `DELETE /api/v1/class/links/{id}` | `class_links.delete` |

Ini satu-satunya domain yang operasinya sudah tersedia di database tetapi belum
punya UI. Endpoint tetap kanonis karena operasinya nyata dan sudah dijaga RLS.

### 2.3 Members (keanggotaan)

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/members`, `/settings/members` | `member_profile_v`, `memberships`, `roles` | `GET /api/v1/members` | `members.read` |
| Detail | `/members/{username}`, `/settings/members/{id}` | idem | `GET /api/v1/members/{user_id}` | `members.read` |
| Create | `createMember` + Auth Admin + `provision_member` | `auth.users`, `memberships`, `member_profiles` | Tidak diekspos | — |
| Update identity | `updateMemberIdentity` | `member_profiles` | Tidak diekspos | — |
| Change role | `changeMemberRole`, `request_role_change`, `decide_role_change_request` | `memberships`, `role_change_requests` | Tidak diekspos | — |
| Activate/deactivate | `setMemberStatus` + Auth ban | `memberships` | Tidak diekspos | — |
| Delete | `deleteMember` + Auth Admin | `auth.users` | Tidak diekspos | — |
| Access/reset link | `issueAccessLink`, `issueResetLink` | `password_reset_requests` | Tidak diekspos | — |

Sengaja read-only: perubahan role, status, penghapusan akun, dan penerbitan tautan
akses adalah operasi sensitif yang tidak boleh otomatis tersedia karena izin CRUD
umum (sesuai §6 brief API).

### 2.4 Member profiles

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| Read | `member_profile_v`, `/members`, `/settings/profile` | `member_profiles`, `memberships`, `roles` | `GET /api/v1/members`, `GET /api/v1/members/{id}` | `members.read` |
| Update sendiri | `updateProfile` | `member_profiles` | Tidak diekspos | — |
| Avatar | `uploadAvatar`, `removeAvatar` | Storage `member-media` | Tidak diekspos (media) | — |
| Visibility diri | `saveMyVisibility` | `visibility_rules` | Tidak diekspos | — |

`member_profiles` tidak menjadi resource terpisah di v1: endpoint anggota sudah
mengembalikan profil. Tidak ada update profil lewat API karena aturan
`EC031` (hanya pemilik) dan `EC032` (username oleh pengelola) adalah aturan
kepemilikan personal, bukan operasi kelas.

### 2.5 Portfolio

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/settings/portfolio`, profil anggota | `portfolio_items` | `GET /api/v1/portfolio` | `portfolio.read` |
| Detail | `portfolio-card` | idem | `GET /api/v1/portfolio/{id}` | `portfolio.read` |
| Create | `createPortfolioItem` | idem | `POST /api/v1/portfolio` | `portfolio.create` |
| Update | `updatePortfolioItem` | idem | `PATCH /api/v1/portfolio/{id}` | `portfolio.update` |
| Delete | `deletePortfolioItem` | idem | `DELETE /api/v1/portfolio/{id}` | `portfolio.delete` |
| Media | `uploadPortfolioMedia`, `removePortfolioMedia` | Storage `member-media` | Tidak diekspos (media) | — |

Cakupan (`scope.portfolio`) menentukan baris yang boleh dibaca: `all`, `selected`,
`self`, `public`, `none`. Penulisan hanya untuk `self`; API tidak mewakili anggota
lain. `media_path` tidak pernah diterima atau dikembalikan.

### 2.6 Social links

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/settings/profile`, profil anggota | `social_links` | `GET /api/v1/social-links` | `social_links.read` |
| Create | `createSocialLink` | idem | `POST /api/v1/social-links` | `social_links.create` |
| Update | `updateSocialLink` | idem | `PATCH /api/v1/social-links/{id}` | `social_links.update` |
| Delete | `deleteSocialLink` | idem | `DELETE /api/v1/social-links/{id}` | `social_links.delete` |

Aturan host per platform sama dengan UI (instagram.com, linkedin.com, github.com,
tiktok.com, x.com/twitter.com); `website`/`custom` memakai URL https bebas. Satu
platform unik per anggota (kecuali website/custom).

### 2.7 Schedules

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/schedule` | `schedules` | `GET /api/v1/schedules` | `schedules.read` |
| Detail | `/schedule/{id}/edit` | idem | `GET /api/v1/schedules/{id}` | `schedules.read` |
| Create | `createSchedule` | idem | `POST /api/v1/schedules` | `schedules.create` |
| Update | `updateSchedule` | idem | `PATCH /api/v1/schedules/{id}` | `schedules.update` |
| Delete | `deleteSchedule` | idem | `DELETE /api/v1/schedules/{id}` | `schedules.delete` |

Jadwal adalah kuliah mingguan: `day_of_week` 1–7, `start_time`/`end_time` `HH:mm`,
`end_time > start_time`, `semester` `YYYY/YYYY Ganjil|Genap` dengan tahun kedua =
tahun pertama + 1. API menerima waktu dinding (`HH:mm`) karena tidak ada tanggal.

### 2.8 Events

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/events` | `events` | `GET /api/v1/events` | `events.read` |
| Detail | `/events/{id}` | idem | `GET /api/v1/events/{id}` | `events.read` |
| Create | `createEvent` | idem | `POST /api/v1/events` | `events.create` |
| Update | `updateEvent` | idem | `PATCH /api/v1/events/{id}` | `events.update` |
| Delete | `deleteEvent` | idem | `DELETE /api/v1/events/{id}` | `events.delete` |
| Cover | `uploadEventCover`, `removeEventCover` | Storage `class-media` | Tidak diekspos (media) | — |

Waktu API memakai ISO 8601 dengan offset (`2026-11-03T09:00:00+07:00`) dan disimpan
UTC; UI memakai waktu dinding + timezone kelas. `cover_path` tidak diekspos.

### 2.9 Tasks

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/tasks` | `tasks` | `GET /api/v1/tasks` | `tasks.read` |
| Detail | `/tasks/{id}` | idem | `GET /api/v1/tasks/{id}` | `tasks.read` |
| Create | `createTask` | idem | `POST /api/v1/tasks` | `tasks.create` |
| Update | `updateTask` | idem | `PATCH /api/v1/tasks/{id}` | `tasks.update` |
| Delete | `deleteTask` | idem | `DELETE /api/v1/tasks/{id}` | `tasks.delete` |
| Status selesai | `TaskRow`/`updateTask` | `tasks.status` | lewat `PATCH` yang sama | `tasks.update` |

`deadline` ISO 8601; `course` wajib dari aplikasi; `target` default
`Seluruh kelas`; status `active|completed|archived`.

### 2.10 Knowledge

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List | `/knowledge`, `search_knowledge` | `knowledge_entries`, tags | `GET /api/v1/knowledge` | `knowledge.read` |
| Detail | `/knowledge/{slug}` | idem | `GET /api/v1/knowledge/{slug}` | `knowledge.read` |
| Create/update/archive/delete | `saveKnowledge`, `archiveKnowledge`, `deleteKnowledge` | idem | Tidak diekspos | — |
| Visibility | `changeKnowledgeVisibility` | idem | Tidak diekspos | — |
| Edit request/approval/revoke | `requestEdit`, `escalateRequest`, `decideRequest`, `revokeEditor` | `knowledge_edit_requests`, `knowledge_editors` | Tidak diekspos | — |

Alasan: hak menulis Knowledge melekat pada penulis/editor personal dan dijaga
trigger `EC050`–`EC053`; API key atas nama Ketua tidak boleh mengubah konten orang
lain. Read mengikuti aturan `knowledge_can_read`: published `public`/`class_only`,
ditambah entri milik pemilik API key (draft/privat/arsip).

### 2.11 Visibility

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| Read aturan kelas | `/settings/visibility`, `get_visibility_map` | `visibility_rules`, `visibility_catalog` | `GET /api/v1/visibility` | `visibility.read` |
| Update aturan kelas | `saveClassVisibility` | `visibility_rules` | `PATCH /api/v1/visibility` | `visibility.update` |
| Aturan per anggota | `saveMyVisibility` | `visibility_rules` | Tidak diekspos | — |

API hanya mengubah aturan `owner_id is null` (kelas). Batas `widest_audience` dan
larangan `self` tetap ditegakkan trigger `EC011`/`EC013`.

### 2.12 Activity

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| Read | `get_activity_trend`, Beranda | `class_activity` | `GET /api/v1/activity` | `activity.read` |

`class_activity` hanya ditulis trigger; API read-only.

### 2.13 Inventory

| Operasi | Sumber sekarang | Tabel | Endpoint v1 | Izin API |
|---|---|---|---|---|
| List item | `/inventory` | `inventory_items` | `GET /api/v1/inventory` | `inventory.read` |
| Create item | `addInventoryItem` | idem | `POST /api/v1/inventory` | `inventory.create` |
| Delete item | `deleteInventoryItem` | idem | `DELETE /api/v1/inventory/{id}` | `inventory.delete` |
| Buat/cabut inv_key | `createInventoryKey`, `revokeInventoryKey` | `inventory_keys` | Tidak diekspos | — |
| Akses publik inv_key | `openInventory`, `get_inventory_by_key` | idem | Tidak diekspos | — |

`inv_key` adalah kredensial; API key tidak boleh membuat atau membacanya. Item
inventory hanya URL, tanpa media. Satu-satunya cakupan yang diterima adalah
`self`; `all`/`selected` ditolak karena bertentangan dengan aturan produk bahwa
inventory orang lain hanya dibuka lewat `inv_key` miliknya.

## 3. Domain yang dikecualikan dari API v1

| Domain | Alasan |
|---|---|
| Cloud / Google Drive uploader (`src/lib/gdrive`, `src/features/gdrive`) | Dilarang keras oleh ADDENDUM §1. Tidak ada endpoint, tidak ada akses tidak langsung, workflow tidak diubah. |
| Autentikasi, OTP email, reset password, session | Kredensial dan identitas; bukan resource data. |
| Role change requests, member status/role, delete account | Operasi sensitif; tidak otomatis tersedia dari izin CRUD. |
| Pengaturan tema kelas | Payload palet kompleks; belum ada kebutuhan API. Bisa ditambahkan terpisah. |
| QR Studio dan `qr_shares` | Output biner/stateless dan tautan publik berumur pendek; bukan domain CRUD. |
| Media (avatar, logo/cover, cover event, gambar portofolio) | Menunggu keputusan pemilik di `docs/api-media-review.md`. |
| Knowledge write dan workflow edit | Hak personal penulis/editor; tidak boleh diwakili API key kelas. |
| `class_activity` write | Hanya trigger. |

## 4. Analisis duplikasi

- `updateProfile` vs `updateMemberIdentity`: bukan duplikat. Yang pertama pemilik
  mengubah nama panggilan/bio; yang kedua Ketua mengubah nama lengkap/username
  milik anggota. Keduanya tidak diekspos di v1.
- `changeMemberRole` vs `request_role_change` vs `decide_role_change_request`:
  satu alur domain (perubahan jabatan) dengan tiga tahap otorisasi berbeda; bukan
  tiga endpoint CRUD. Tidak diekspos.
- `createTask`/`updateTask` dan tombol "selesai" di `TaskRow`: satu operasi
  update dengan field `status`; API memakai satu `PATCH /tasks/{id}`.
- `createEvent`/`updateEvent` dan upload cover: update metadata dan upload media
  adalah operasi berbeda; media tidak diekspos.
- `saveClassVisibility` dan `saveMyVisibility`: dua cakupan berbeda (kelas vs
  anggota), bukan duplikat. API hanya yang kelas.
- `search_knowledge` (RPC) dan daftar `/knowledge`: satu operasi baca dengan
  filter; API memakai satu `GET /api/v1/knowledge?q=`.
- `addInventoryItem`/`deleteInventoryItem` dan `openInventory`: yang terakhir
  adalah akses publik memakai `inv_key`, bukan CRUD; tidak diekspos.

## 5. Ringkasan endpoint kanonis

```
GET    /api/v1/whoami
GET    /api/v1/class
PATCH  /api/v1/class
GET    /api/v1/class/links
POST   /api/v1/class/links
PATCH  /api/v1/class/links/{id}
DELETE /api/v1/class/links/{id}
GET    /api/v1/members
GET    /api/v1/members/{user_id}
GET    /api/v1/portfolio
POST   /api/v1/portfolio
GET    /api/v1/portfolio/{id}
PATCH  /api/v1/portfolio/{id}
DELETE /api/v1/portfolio/{id}
GET    /api/v1/social-links
POST   /api/v1/social-links
PATCH  /api/v1/social-links/{id}
DELETE /api/v1/social-links/{id}
GET    /api/v1/schedules
POST   /api/v1/schedules
GET    /api/v1/schedules/{id}
PATCH  /api/v1/schedules/{id}
DELETE /api/v1/schedules/{id}
GET    /api/v1/events
POST   /api/v1/events
GET    /api/v1/events/{id}
PATCH  /api/v1/events/{id}
DELETE /api/v1/events/{id}
GET    /api/v1/tasks
POST   /api/v1/tasks
GET    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}
DELETE /api/v1/tasks/{id}
GET    /api/v1/knowledge
GET    /api/v1/knowledge/{slug}
GET    /api/v1/visibility
PATCH  /api/v1/visibility
GET    /api/v1/activity
GET    /api/v1/inventory
POST   /api/v1/inventory
DELETE /api/v1/inventory/{id}
```

Tidak ada endpoint `/cloud`, `/gdrive`, `/media`, `/auth`, atau `/roles`.
