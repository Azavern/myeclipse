# Developer API — Security

## 1. Model ancaman

API key adalah kredensial bearer. Siapa pun yang memegangnya dapat memakai izin
yang diberikan sampai key dicabut. Karena itu:

- Secret tidak pernah disimpan plaintext dan hanya tampil sekali saat dibuat.
- Key terikat pada satu kelas (`api_keys.class_id`); tidak ada akses lintas kelas.
- Key **tidak** mewarisi permission Ketua, role, atau service role Supabase.
- Tidak ada CORS dan tidak ada fallback cookie/session; API untuk server-ke-server.
- Semua keputusan otorisasi dilakukan di server, bukan di UI.

## 2. Format dan penyimpanan key

```
ecl_<12 hex prefix>_<43 base64url secret>
```

- `prefix` = 6 byte acak (48 bit), disimpan untuk lookup.
- `secret` = 32 byte acak (256 bit) dari `crypto.randomBytes`.
- `secret_hash` = SHA-256 hex dari secret. SHA-256 cukup karena input berentropi
  tinggi; tidak ada password manusia yang perlu hashing lambat.
- Verifikasi memakai `timingSafeEqual` pada buffer hex; panjang hash diperiksa.
- `secret_hash` tidak pernah diberi grant SELECT ke `authenticated`; halaman
  pengelolaan hanya membaca kolom aman.
- Secret tidak masuk log, audit, URL, atau response selain sekali dari Server
  Action pembuatan.

Tabel `api_keys` menyimpan izin dan cakupan sebagai JSONB yang divalidasi ulang
di RPC (`app.api_permissions_valid`, `app.api_scope_valid`) dan di server
(`normalizePermissions`, `normalizeScope`). Resource/aksi di luar katalog dibuang.

## 3. Autentikasi request

`Authorization: Bearer <key>`:

1. Format di-parse; key cacat langsung 401.
2. Lookup baris berdasarkan prefix (service role, server saja).
3. Status harus `active`; hash dibandingkan constant-time.
4. Kuota per menit dikonsumsi lewat RPC atomik `consume_api_quota`.
5. `class_id`, `created_by`, izin, cakupan, dan daftar anggota dimuat.

Key `disabled`/`revoked` menghasilkan 401 yang sama dengan key tidak dikenal agar
status key tidak bocor. Kegagalan database autentikasi/kuota -> 503, bukan
"allow".

## 4. Otorisasi berlapis

Karena API memakai service role untuk query domain (bypass RLS), kompensasinya:

- Setiap query menyertakan `class_id` dari baris key, bukan dari input.
- `withApi` memeriksa izin resource+aksi sebelum handler berjalan.
- Cakupan baris diperiksa di query: `all`, `selected`, `self`, atau `public`.
- `selected` memakai `api_key_members` yang hanya berisi anggota aktif kelas itu.
- `public` hanya mengembalikan baris `visibility = 'public'`; profil memakai
  `member_profile_v` yang menyamarkan field non-publik untuk identitas anonim.
- `all`/`selected` pada portfolio dan tautan sosial menyaring baris yang audiens
  efektifnya `self` milik anggota lain (`src/lib/api/visibility.ts`), sehingga
  bypass RLS tidak membuka konten `self`.
- `nickname`/`bio` anggota juga dikosongkan bila aturan field-nya `self` dan baris
  bukan milik pemilik key.
- Penulisan resource milik anggota mensyaratkan cakupan `self` dan filter
  `user_id/owner_id = created_by` pada UPDATE/DELETE. Nol baris = 404.
- `class_id` tidak pernah diterima dari body/query; tidak ada mass assignment
  karena setiap route memakai Zod `.strict()` dan field yang diizinkan saja.
- `created_by` pada insert diisi dari key, bukan dari body.

RLS tetap menjadi lapisan kedua untuk semua akses berbasis sesi (UI). API tidak
membuka grant tabel baru untuk `anon`/`authenticated` selain SELECT aman pada
`api_keys`, `api_key_members`, dan `api_audit_log` (disaring policy class.manage).

## 5. Operasi sensitif yang sengaja tidak diekspos

| Operasi | Alasan |
|---|---|
| Create/delete member, ubah status, ban Auth | Dampak pada akun dan identitas. |
| Ubah role, setujui role request | Privilege escalation. |
| Hapus akun | Tidak dapat dibatalkan. |
| Terbitkan tautan akses/reset | Kredensial sekali pakai. |
| Ubah email/OTP/session | Autentikasi. |
| Tulis Knowledge atas nama orang lain | Hak personal penulis/editor. |
| Cloud/Google Drive dan media | Dilarang ADDENDUM §1; media menunggu persetujuan. |
| Buat/baca `inv_key` | Kredensial berbagi. |
| Inventory anggota lain | Aturan produk: hanya `inv_key` milik pemilik yang boleh membukanya; API membatasi inventory ke cakupan `self`. |

Tidak ada izin CRUD umum yang otomatis membuka operasi di atas.

## 6. Rate limiting

- 120 permintaan/menit per key, dihitung di database (`api_keys.quota_window`,
  `quota_count`) lewat `consume_api_quota`.
- UPDATE ... RETURNING mengunci baris, sehingga request paralel tidak bisa
  melewati batas karena balapan baca-tulis.
- Respons 429 menyertakan `Retry-After: 60`. Kegagalan RPC kuota -> 503.
- Ini bukan pengganti WAF; tetap batasi key per aplikasi dan pantau audit log.

## 7. Audit

`api_audit_log` mencatat: kelas, key, metode, path (tanpa query string), resource,
status, durasi, waktu. Tidak ada header, body, token, atau data pribadi. Insert
hanya lewat service role; `authenticated` hanya bisa SELECT lewat policy
`class.manage`. Key yang dihapus membuat `api_key_id` menjadi null, riwayat tetap
ada.

## 8. Pencabutan dan rotasi

- `disabled` berlaku segera (status diperiksa setiap request).
- `revoke` permanen: status `revoked`, tidak bisa diaktifkan kembali, dan RPC
  `update_api_key` menolak (`EC080`).
- Rotasi = buat key baru, pindahkan aplikasi, lalu revoke key lama.
- Key yang dicabut dapat dihapus dari daftar; audit tetap disimpan.

## 9. Batasan yang diketahui

- Tidak ada UI untuk melihat secret setelah pembuatan; kehilangan secret berarti
  membuat key baru.
- `public` untuk portfolio/social memakai `visibility = 'public'` eksplisit, bukan
  evaluasi warisan section. Ini lebih ketat (fail-closed), bukan lebih longgar.
- `all`/`selected` untuk portfolio/social memindai maksimum 1000 kandidat sebelum
  menyaring `self` dan memotong halaman; total mengacu pada hasil setelah saring.
- Inventory selalu `self`; `all`/`selected` ditolak.
- API tidak menjalankan `app.can_view` dengan identitas pengguna karena tidak ada
  sesi; cakupan eksplisit key menggantikannya.
- Audit insert berjalan setelah handler; kegagalan audit dicatat ke log server dan
  tidak mengubah response.
- Pengujian unit mencakup format/hash/izin/cakupan. Jalur database memerlukan
  `POSTGRES_URL` dan migrasi diterapkan; lihat `npm run test:db`.
