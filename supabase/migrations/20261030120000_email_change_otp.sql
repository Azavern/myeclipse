-- Migration 0020 — OTP verifikasi email baru (Pengaturan → Keamanan akun).
--
-- Satu baris per akun: permintaan terbaru menggantikan yang lama, sehingga
-- kode yang beredar sebelumnya otomatis tidak berlaku. Kode disimpan sebagai
-- HMAC-SHA256 (bukan plaintext), terikat ke user + email tujuan lewat pesan
-- hash di aplikasi.
--
-- Hanya service role yang menyentuh tabel ini: tidak ada grant untuk anon atau
-- authenticated dan tidak ada policy RLS. Pengiriman serta verifikasi berjalan
-- di Server Action yang sudah memvalidasi sesi anggota aktif.

create table public.email_change_requests (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  new_email  text not null,
  otp_hash   text not null,
  expires_at timestamptz not null,
  attempts   smallint not null default 0,
  sent_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- Email dinormalkan ke huruf kecil sebelum ditulis, jadi bisa dibandingkan
  -- langsung dengan email di Supabase Auth.
  constraint email_change_requests_email_check
    check (new_email = lower(new_email) and length(new_email) between 3 and 254),
  -- 64 karakter hex = keluaran SHA-256.
  constraint email_change_requests_hash_check
    check (otp_hash ~ '^[0-9a-f]{64}$'),
  constraint email_change_requests_attempts_check
    check (attempts between 0 and 10),
  -- Kode selalu punya masa berlaku; baris tanpa masa depan tidak masuk akal.
  constraint email_change_requests_expiry_check
    check (expires_at > sent_at)
);

alter table public.email_change_requests enable row level security;

-- Tanpa grant dan tanpa policy, PostgREST menolak anon/authenticated. Server
-- Action memakai service role, jadi satu-satunya jalur tulis ada di server.
revoke all on public.email_change_requests from anon, authenticated;
