# Eclipse Developer API v1

Referensi endpoint resmi. Inventaris operasi dan alasan pemetaan ada di
`docs/api-inventory.md`; keputusan keamanan ada di `docs/api-security.md`.

## Dasar

- Base URL: `https://<domain-eclipse>/api/v1`
- Format: JSON, UTF-8.
- Autentikasi: `Authorization: Bearer ecl_<prefix>_<secret>`.
- Semua endpoint memakai `runtime = nodejs` dan `Cache-Control: no-store`.
- Tidak ada CORS: API ini untuk integrasi server-ke-server. Jangan menaruh API
  key di kode peramban.
- Body maksimum 64 KB; `Content-Type: application/json` wajib untuk POST/PATCH.
- Tidak ada cookie/session fallback. Hanya API key.

### Error

```json
{ "error": { "code": "forbidden", "message": "API key ini tidak memiliki izin untuk operasi tersebut." } }
```

| Status | `code` | Arti |
|---|---|---|
| 400 | `validation`, `invalid_json` | Body/parameter tidak valid. |
| 401 | `unauthorized` | Key tidak ada, salah, dinonaktifkan, atau dicabut. |
| 403 | `forbidden`, `scope` | Izin operasi atau cakupan data tidak mengizinkan. |
| 404 | `not_found` | Resource tidak ada di kelas key. |
| 409 | `conflict` | Pelanggaran keunikan. |
| 413 | `payload_too_large` | Body > 64 KB. |
| 415 | `unsupported_media_type` | Bukan `application/json`. |
| 429 | `rate_limited` | >120 permintaan/menit per key. `Retry-After: 60`. |
| 500/503 | `internal`, `unavailable` | Kesalahan server; detail hanya di log. |

### Pagination

`?limit=` 1–100 (default 25), `?offset=` ≥0. Respons daftar:

```json
{ "data": [], "pagination": { "limit": 25, "offset": 0, "total": 0, "has_more": false } }
```

### Cakupan

Cakupan hanya menyaring baris; izin operasi tetap diperiksa terpisah.

| Nilai | Arti |
|---|---|
| `none` | Tidak ada akses; 403. |
| `all` | Semua baris kelas. |
| `selected` | Hanya anggota yang dicentang di key. |
| `self` | Hanya baris milik pembuat key. |
| `public` | Hanya baris dengan `visibility = 'public'`; profil hanya identitas anggota aktif tanpa field non-publik. |

Penulisan resource milik anggota (`portfolio`, `social_links`, `inventory`) hanya
diizinkan bila cakupannya `self`.

## Endpoint

### Identitas

`GET /whoami` — informasi key, izin, cakupan, dan batas laju. Tidak butuh izin
resource.

### Kelas

| Metode | Path | Izin | Keterangan |
|---|---|---|---|
| GET | `/class` | `class_profile.read` | Profil kelas + tema. |
| PATCH | `/class` | `class_profile.update` | Ubah field teks/timezone. Body minimal satu field. |
| GET | `/class/links` | `class_links.read` | Maksimum 100 tautan. |
| POST | `/class/links` | `class_links.create` | `platform`, `url`, `label?`. |
| PATCH | `/class/links/{id}` | `class_links.update` | Partial; validasi digabung dengan baris lama. |
| DELETE | `/class/links/{id}` | `class_links.delete` | 204. |

Contoh PATCH kelas:

```bash
curl -X PATCH https://eclipse.example/api/v1/class \
  -H "Authorization: Bearer $ECLIPSE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tagline":"Belajar bersama, tumbuh bersama"}'
```

Field: `name`, `code`, `tagline`, `description`, `highlight_text`,
`highlight_url`, `timezone` (`Asia/Jakarta|Asia/Makassar|Asia/Jayapura`).

### Anggota

| Metode | Path | Izin | Keterangan |
|---|---|---|---|
| GET | `/members?q=&limit=&offset=` | `members.read` | Daftar anggota + role/status. |
| GET | `/members/{user_id}` | `members.read` | Detail satu anggota. |

Read-only. `user_id` adalah `auth.users.id`. Field: `user_id`, `username`,
`full_name`, `nickname`, `bio`, `role`, `role_id`, `status`, `joined_at`.
Cakupan `public` mengembalikan anggota aktif dengan identitas dasar (`user_id`,
`username`, `full_name`, `role`, `role_id`, `status`, `joined_at`); `nickname` dan
`bio` kosong karena audiens terluasnya `class_member`, bukan publik. Audiens
dihitung dari katalog visibilitas yang sama dengan UI (bukan `member_profile_v`,
yang bergantung pada `auth.uid()` dan karena itu tidak berlaku untuk key). Bila
Ketua mempersempit `page.members` ke pengelola, cakupan publik tidak
mengembalikan baris. Untuk `all`/`selected`/`self`, `nickname` dan `bio`
dikosongkan hanya bila aturan visibilitasnya `self` dan baris bukan milik pemilik key.

### Portofolio

| Metode | Path | Izin |
|---|---|---|
| GET | `/portfolio?user_id=&q=&limit=&offset=` | `portfolio.read` |
| POST | `/portfolio` | `portfolio.create` |
| GET | `/portfolio/{id}` | `portfolio.read` |
| PATCH | `/portfolio/{id}` | `portfolio.update` |
| DELETE | `/portfolio/{id}` | `portfolio.delete` |

Body create: `title` (wajib), `occurred_on` `YYYY-MM-DD` (wajib), `kind`
(`project|achievement|organization|competition|creative_work|certificate|experience`,
default `project`), `description`, `url`, `visibility`
(`public|authenticated|class_member|class_admin|self|null`). `media_path` tidak
pernah diterima/dikembalikan. Write hanya `self`.

### Tautan sosial

| Metode | Path | Izin |
|---|---|---|
| GET | `/social-links?user_id=&limit=&offset=` | `social_links.read` |
| POST | `/social-links` | `social_links.create` |
| PATCH | `/social-links/{id}` | `social_links.update` |
| DELETE | `/social-links/{id}` | `social_links.delete` |

Body: `platform` (`instagram|linkedin|github|tiktok|x|website|custom`), `url`
https, `label` (wajib untuk `custom`), `visibility`. Host harus cocok untuk
platform berdomain tetap.

### Jadwal

| Metode | Path | Izin |
|---|---|---|
| GET | `/schedules?semester=&q=&limit=&offset=` | `schedules.read` |
| POST | `/schedules` | `schedules.create` |
| GET | `/schedules/{id}` | `schedules.read` |
| PATCH | `/schedules/{id}` | `schedules.update` |
| DELETE | `/schedules/{id}` | `schedules.delete` |

Body: `title`, `day_of_week` 1–7, `start_time`/`end_time` `HH:mm`
(`end_time > start_time`), `semester` `2026/2027 Ganjil`, `type`
(`class|activity`), `description?`, `location?`, `url?`.

### Event

| Metode | Path | Izin |
|---|---|---|
| GET | `/events?upcoming=1&q=&limit=&offset=` | `events.read` |
| POST | `/events` | `events.create` |
| GET | `/events/{id}` | `events.read` |
| PATCH | `/events/{id}` | `events.update` |
| DELETE | `/events/{id}` | `events.delete` |

Body: `title`, `start_at`, `end_at` (ISO 8601 dengan zona waktu, mis.
`2026-11-03T09:00:00+07:00`), `description?`, `location?`, `organizer?`, `url?`.
`cover_path` tidak diekspos.

### Tugas

| Metode | Path | Izin |
|---|---|---|
| GET | `/tasks?status=&q=&limit=&offset=` | `tasks.read` |
| POST | `/tasks` | `tasks.create` |
| GET | `/tasks/{id}` | `tasks.read` |
| PATCH | `/tasks/{id}` | `tasks.update` |
| DELETE | `/tasks/{id}` | `tasks.delete` |

Body: `title`, `course`, `deadline` ISO 8601, `target?` (default
`Seluruh kelas`), `status?` (`active|completed|archived`), `description?`, `url?`.
Menyelesaikan tugas memakai `PATCH` yang sama dengan `{"status":"completed"}` —
bukan endpoint terpisah.

### Pengetahuan

| Metode | Path | Izin |
|---|---|---|
| GET | `/knowledge?q=&limit=&offset=` | `knowledge.read` |
| GET | `/knowledge/{slug}` | `knowledge.read` |

Read-only. Menampilkan entri `published` dengan visibilitas `public` atau
`class_only`, ditambah entri milik pembuat key. Field detail termasuk
`content_md` dan `tags`.

### Visibilitas

| Metode | Path | Izin |
|---|---|---|
| GET | `/visibility` | `visibility.read` |
| PATCH | `/visibility` | `visibility.update` |

`PATCH` body:

```json
{ "rules": [ { "key": "page.events", "audience": "class_member" }, { "key": "page.home", "audience": null } ] }
```

`null` menghapus aturan (kembali ke default). Hanya kunci scope `class`; pilihan
tidak boleh lebih luas dari `widest_audience` dan `self` tidak berlaku.

### Catatan privasi portfolio dan tautan sosial

Untuk cakupan `all`/`selected`, baris yang audiens efektifnya `self` milik anggota
lain tidak dikembalikan, meskipun key memegang izin baca. Aturan warisan section
(`section.member.portfolio`, `section.member.social`) dan override item dihitung
dengan algoritma yang sama seperti `app.effective_audience`.

### Aktivitas

`GET /activity?limit=&offset=` — `activity.read`. Read-only, urut terbaru.

### Inventory

| Metode | Path | Izin |
|---|---|---|
| GET | `/inventory?limit=&offset=` | `inventory.read` |
| POST | `/inventory` | `inventory.create` |
| DELETE | `/inventory/{id}` | `inventory.delete` |

Body create: `{ "url": "https://..." }`. `inv_key` tidak pernah dibuat atau
dibaca lewat API. Inventory hanya boleh dibaca/ditulis dengan cakupan `self`;
`all`/`selected` ditolak karena bertentangan dengan aturan inv_key.

## Yang tidak tersedia

Tidak ada endpoint untuk Cloud/Google Drive, upload media, avatar/logo/cover,
OTP/email, reset password, role change, status anggota, penghapusan akun, tema,
QR, atau `inv_key`. Lihat `docs/api-inventory.md` §3.
