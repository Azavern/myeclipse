# additional-instruction.md — Instruksi Tambahan untuk Agent (Eclipse)

Berisi tiga prompt yang **harus dijalankan berurutan**. Tiap prompt disalin utuh (dari judulnya sampai garis `---` berikutnya) ke agent.

| Urutan | Prompt | Isi | Syarat mulai |
|---|---|---|---|
| 1 | Tema gelap | Satu preset tema kelas gelap "Eclipse Gelap" | — |
| 2 | Home desktop | Perbaikan layout Home ≥1024 px berdasarkan analisis screenshot | Prompt 1 selesai |
| 3 | Dua template | Template **Neo-Brutalism** dan **Arsip 1960-an** beserta perilaku mobile-nya | Prompt 1 dan 2 selesai dan tercatat di `docs/STATUS.md` |

Prompt 2 dan 3 dibagi per fase. Agent berhenti dan melapor setelah tiap fase; lanjutkan dengan mengetik "lanjut".

---

## Aturan bersama (sudah dimuat di tiap prompt, jangan dihapus)

1. Baca dulu: `AGENTS.md`, `DESIGN.md` (v2), `blueprint.md`, `MOBILE.md`, `docs/STATUS.md`. Urutan prioritas mengikuti `AGENTS.md` §2.
2. **Kode terkini adalah sumber kebenaran.** Blueprint dan screenshot bisa tertinggal dari kode (misalnya modul Pengetahuan, QR Studio, Inventory, Cloud, Library tidak ada di blueprint; jadwal sudah mingguan per semester sejak migration 0010). Selidiki kode sebelum mengubah apa pun; bila kode berbeda dari instruksi ini, ikuti kode dan catat selisihnya.
3. Tanpa dependensi baru. Font memakai `next/font/google` yang sudah ada.
4. Migration hanya berupa **file baru** (buat dengan `supabase migration new`). Jangan mengubah migration yang sudah diterapkan, dan jangan menjalankan `supabase db push` ke proyek produksi. Uji di DB lokal, lalu beri tahu saya perintah yang harus saya jalankan.
5. Lingkungan saya Windows (cmd). Gunakan package manager sesuai lockfile repo (kemungkinan npm), dan jangan menulis skrip yang hanya jalan di bash.
6. Jangan commit atau push kecuali saya minta.
7. Semua nilai visual dari token. `check-tokens` harus tetap hijau.
8. Sebelum melapor, periksa ulang kelengkapan dan konsistensi sistem **dan** UI. Laporan akhir mengikuti `AGENTS.md` §17: hasil, file terdampak, verifikasi yang dijalankan **dan yang tidak**, batasan, dan status lokal/remote. Temuan sementara dan gap dicatat di `docs/STATUS.md`, bukan di `AGENTS.md`.

---

## PROMPT 1 — Tambah satu tema kelas gelap ("Eclipse Gelap")

Kamu mengerjakan aplikasi Eclipse. Ikuti "Aturan bersama" di bagian atas file ini.

### Tujuan

Tambahkan **satu** tema kelas gelap yang bisa dipilih Ketua di `/settings/theme`. Tema ini mengikuti nama kelas: latar biru-tinta gelap seperti sampul "Eclipse", dengan satu aksen amber sebagai "korona".

### Batasan keputusan (jangan dilanggar)

- Ini **preset**, bukan fitur mode gelap. Tidak ada toggle per pengguna, tidak membaca `prefers-color-scheme`, tidak ada kolom/tabel baru, **tidak ada migration**. `blueprint.md` §26.4 sudah memutuskan tema gelap dibuat lewat palet.
- Jangan menimpa tema yang sekarang tersimpan di database. Preset hanya dimuat ke editor sebagai pratinjau lokal (A-12), dan baru tersimpan saat Ketua menekan Publikasikan.
- `DEFAULT_THEME` dan seed migration 0008 tidak berubah.

### Langkah 0 — Selidiki (laporkan singkat sebelum mengubah)

1. Bagaimana tema disimpan, divalidasi, dan dirender sekarang (`classes.theme`, `ThemeSchema`, `buildThemeCss`, `contrast.ts`, `ThemeEditor`).
2. Apakah sudah ada mekanisme preset atau daftar tema di editor. Bila **ada**, tambahkan tema gelap ke mekanisme itu. Bila **belum ada**, buat yang minimal: konstanta `THEME_PRESETS` di `src/lib/theme/presets.ts` berisi `default` (= `DEFAULT_THEME`) dan `eclipse_gelap`, dan satu kontrol "Mulai dari preset" di editor.
3. Daftar tempat yang berasumsi latar terang (lihat "Audit kesiapan gelap" di bawah).

### Spesifikasi preset

`layout: "standard"`, `font_preset: "editorial"`.

| Kunci palet | Nilai | Kontras vs `background` / `surface` |
|---|---|---|
| `background` | `#0F141A` | — |
| `surface` | `#17202A` | — |
| `border` | `#2B3846` | dekoratif (tidak dipakai sebagai batas input) |
| `text_primary` | `#EEF2F6` | 16,44 / 14,62 |
| `text_secondary` | `#AAB7C4` | 9,05 / 8,05 |
| `primary` | `#F0A04B` | 8,66 / 7,70 |
| `secondary` | `#7FB2D9` | 8,17 / 7,26 |
| `success` | `#5FBF84` | 8,17 / 7,26 |
| `warning` | `#E5B84A` | 9,94 / 8,84 |
| `error` | `#F28B82` | 7,74 / 6,89 |

Angka kontras sudah saya hitung dengan rumus WCAG. Tes unit tetap harus memverifikasinya lewat `ThemeSchema` (≥4,5:1 untuk teks), bukan menyalin angka di atas.

### Perbaikan wajib pada token turunan (blueprint §17.4)

`--theme-on-primary` dan `--theme-on-secondary` sekarang memilih antara putih dan `text_primary`. Pada tema gelap **keduanya gagal** (putih di atas `primary` = 2,14:1; `text_primary` = 1,90:1), padahal `background` memberi 8,66:1.

- Ubah aturan turunan: tetap coba putih lalu `text_primary` seperti sekarang; **hanya bila keduanya <4,5:1**, pakai `background`.
- Efeknya tema terang yang sudah ada tidak berubah. Buktikan dengan tes: hasil turunan `DEFAULT_THEME` dan tema yang kini tersimpan identik sebelum dan sesudah perubahan.
- Tambahkan implementasi pengecekan yang kini hanya berupa komentar di `superRefine` ("salah satu harus ≥4,5"): sekarang harus benar-benar ditegakkan untuk `on_primary` dan `on_secondary`.
- Pastikan `color-scheme: dark` keluar otomatis (luminansi `background` < 0,35), sehingga kontrol native, scrollbar, dan pemilih tanggal ikut gelap.

### Audit kesiapan gelap

Cari dan perbaiki hal-hal berikut dengan **token atau nilai turunan**, bukan hex baru di komponen:

- `white`/`bg-white`/hex terang, atau latar yang hanya "kebetulan" terang.
- Bayangan berwarna gelap (mis. `rgba(15,23,42,…)`): di latar gelap tidak terlihat. Pemisahan lapisan memakai selisih kecerahan `surface` dan `border` (`DESIGN.md` Appendix C, Dark mode).
- Latar badge/status bertinta: turunkan dari warna semantik yang dicampur ke `surface` (mis. `color-mix`), jangan hex terpisah.
- Warna batang grafik aktivitas dan teks SVG.
- `::backdrop` dialog/sheet, overlay, dan skeleton.
- Gambar logo/cover: jangan diberi filter. Bila logo berlatar putih terlihat janggal di tema gelap, laporkan saja, jangan diubah.
- `themeColor` viewport mengikuti `background` tema.
- Hero: scrim bila teks berada di atas gambar.

### Editor `/settings/theme`

- Pemilih preset memuat palet ke state editor (pratinjau saja). Teks bantuan: "Pratinjau belum tersimpan. Tekan Publikasikan untuk menerapkan ke seluruh kelas."
- `ContrastReport` tetap menampilkan daftar pasangan lulus/gagal dengan teks.
- Tombol "Kembalikan ke bawaan" tetap memuat `DEFAULT_THEME`.

### Tes dan verifikasi

- Unit: preset lolos `ThemeSchema`; turunan `on_primary`/`on_secondary` untuk preset = `background`; tema terang lama tidak berubah; `color-scheme` benar.
- pgTAP: `theme_is_valid` menerima preset (jalankan bila ada tes tema di DB).
- Visual: Home, Tugas, Anggota, Settings/theme, dan satu dialog pada 390 dan 1280 px dengan tema gelap. Tidak ada teks yang tak terbaca, tidak ada permukaan yang menyatu dengan latar.
- Aksesibilitas: fokus terlihat di latar gelap, status tidak hanya warna.

### Selesai bila

Ketua dapat memuat "Eclipse Gelap", melihat pratinjau, mempublikasikannya, dan seluruh halaman tampil gelap tanpa elemen berlatar terang yang tertinggal. Tidak ada migration, tidak ada nilai arbitrer baru, `check-tokens`/lint/typecheck/test/build hijau.

---

## PROMPT 2 — Perbaikan layout Home desktop

Kamu mengerjakan aplikasi Eclipse. Ikuti "Aturan bersama" di bagian atas file ini. Prompt 1 harus sudah selesai.

### Cara membaca analisis

Analisis di bawah berasal dari screenshot Home desktop (lebar ±1783 px) dan mobile (±390 px) yang diambil Sabtu, 7 November 2026 sekitar pukul 21.30 WITA. Kamu tidak perlu melihat gambarnya: tabel ini harus cukup. Ukuran piksel adalah **perkiraan**. Hipotesis penyebab ditandai "(verifikasi)" dan harus dicek di kode sebelum diperbaiki.

### Ringkasan masalah

Home sekarang berupa tumpukan kartu yang sama bentuknya. Tiga masalah terbesar:

1. **Ruang kosong besar.** Kolom kanan kosong ±680 px tinggi di bawah "Event mendatang"; kartu "Aktivitas" berakhir ±210 px lebih pendek dari "Anggota terbaru"; tiap baris anggota hanya berisi dua kata di kartu selebar ±810 px.
2. **Hierarki terbalik.** Ringkasan angka (tersier menurut blueprint §17.1) berada tepat di bawah hero, sedangkan kuliah dan tugas (primer) tertunda. Lima tugas lewat tenggat tampil sebagai lima blok merah yang sama kuatnya.
3. **Hero menggandakan dirinya sendiri.** Gambar sampul sudah memuat tulisan "Eclipse SI E 24 Universitas Negeri Gorontalo", lalu judul "Eclipse" ditumpuk lagi di atasnya, dan pil "Ini sorotan" menimpa huruf "E" pada gambar.

### Pemetaan: temuan dan bentuk akhir

**Global**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| G1 | Header kartu tidak seragam: "Event mendatang", "Tugas", "Anggota terbaru" punya garis pemisah, "Kuliah hari ini" dan "Aktivitas" tidak; judul dua kartu bersebelahan berbeda tinggi (±551 vs ±560 px) | Satu primitive `SectionCard`: header tinggi minimal 3.5rem, ikon 20 px + judul + (opsional) meta + tautan aksi di kanan, **selalu** dengan garis pemisah. Tautan aksi tidak pernah turun ke baris baru (judul yang dipotong, bukan tautannya) |
| G2 | Baris kartu dipaksa sejajar sehingga tinggi kartu tak seimbang | Dua **tumpukan kolom** independen (main dan rail), bukan baris grid. Tinggi kartu mengikuti isi |
| G3 | Radius dan bayangan tidak satu resep: hero ±28 px, kartu ±20 px, blok dalam ±16 px, bayangan lembut besar | Satu resep: panel = `--radius-lg` + border 1 px + bayangan `sm`; elemen dalam = `--radius-md` (radius dalam = radius luar − padding) |
| G4 | Judul section memakai serif besar dengan sisipan "· Sabtu (WITA)" berwarna hijau, ukuran berbeda antar kartu | Satu token judul section. Meta (hari, zona waktu) memakai `body-small` + `text_secondary`, bukan serif |
| G5 | Angka waktu dan tanggal diformat di tempat berbeda ("12:45", "09:00 WITA", "Sen, 19 Okt, 09:00 WITA") | Satu formatter dari `lib/time` (blueprint §19). Jangan ada format tulis-tangan di komponen |

**Layout Home (≥1280 px)**

```
┌───────────────────────── Hero: sampul penuh, identitas di bawahnya ─────────────────────────┐
├────────────── main (8/12) ──────────────────┬──────────────── rail (4/12) ───────────────────┤
│ Kuliah hari ini                             │ Event mendatang                                 │
│ Tugas                                       │ Aktivitas 4 pekan                               │
│ Ringkasan (4 tile kecil, satu baris)        │ Anggota terbaru (grid avatar)                   │
└─────────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

- 1024–1279 px: main satu kolom penuh; rail menjadi grid dua kolom di bawahnya (Event | Aktivitas, lalu Anggota selebar penuh).
- Tinggi kedua kolom pada 1440 px harus berselisih ≤ satu baris daftar (±96 px). Bila tidak, geser satu kartu antar kolom.
- Alternatif bila pemilik produk ingin angka tetap di atas: jadikan Ringkasan strip tipis satu baris (tinggi ±3.5rem, tanpa kartu) tepat di bawah hero. Bentuk default di atas mengikuti prioritas blueprint.
- Ini sengaja menggantikan baris tiga kolom di `blueprint.md` §16 (Jadwal | Event | Tugas), yang menghasilkan tinggi tak seimbang (1 item | 1 item | 5 item). Catat sebagai keputusan di `docs/STATUS.md`.

**Hero**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| H1 | Tulisan pada gambar sampul dan `<h1>` "Eclipse" saling menggandakan; pil "Ini sorotan" menimpa huruf "E" pada gambar | Pisahkan: **sampul = gambar saja**, identitas = baris di bawah sampul dalam panel yang sama (nama kelas sebagai `<h1>` display, tagline "Kelas E SI 2024", kode kelas "Ecl-SI2024UNG" sebagai caption, tanggal). Teks hanya ditumpuk di atas gambar bila **tidak ada** sampul (latar polos/gradien merek + scrim). `alt` sampul: "Sampul kelas {nama}" |
| H2 | Huruf besar pada gambar nyaris menyentuh tepi atas dan teks kecil di bawah terpotong (verifikasi) | Penyebab yang mungkin: sampul kelas di-crop 1600×900 (16:9) saat unggah (blueprint §13.4), tetapi hero menampilkannya ±4,4:1, sehingga lebih dari separuh tinggi gambar terbuang. Ubah crop **sampul kelas** menjadi 16:5 (1600×500) dengan pratinjau crop yang persis sama dengan tampilan hero, dan petunjuk "Disarankan 1600×500". Sampul event tetap 16:9. Sampul yang sudah ada tidak diproses ulang: tampil `object-fit: cover` di tengah |
| H3 | Dua pil sama bentuknya: tanggal dan "Ini sorotan" (dengan ikon kilau dekoratif dan ikon tautan luar) | Tanggal = teks caption biasa, bukan pil. Sorotan = satu baris tersendiri berisi ikon fungsional (mis. pin/megafon, bukan kilau), teks sorotan, dan ikon tautan luar **hanya bila** `highlight_url` ada. Seluruh baris adalah satu tautan ≥44 px (`rel="noopener noreferrer"`, tab baru diumumkan untuk pembaca layar). Tanpa `highlight_text`, baris tidak dirender |
| H4 | Radius hero ±28 px berbeda dari kartu | Ikuti G3 |

**Kuliah hari ini**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| K1 | Kartu di dalam kartu: baris kuliah berupa blok bertinta dengan garis hijau kiri di dalam kartu putih | Satu baris datar: kolom jam (mulai tebal, selesai redup) + nama mata kuliah + lokasi. Garis kiri 3 px hanya untuk "Berlangsung" atau "Berikutnya" |
| K2 | Kuliah pukul 12.45–14.15 tetap tampil seperti "aktif" padahal sekarang sudah malam | Status berdasarkan jam sekarang menurut timezone kelas: **Selesai** (redup), **Berlangsung**, **Berikutnya**, masing-masing ikon + teks |
| K3 | Bila semua kuliah hari ini selesai atau tidak ada | Satu baris "Kuliah berikutnya: Senin, 9 Nov · 08.00 — {mata kuliah}" (hari berikutnya yang punya jadwal, semester berjalan). Bila memang tidak ada sama sekali: empty state sesuai blueprint §15.2 |
| K4 | Padding bawah kartu berlebih untuk satu item | Tinggi mengikuti isi |

**Tugas**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| T1 | Kelima baris merah sekaligus: garis kiri merah, ubin ikon segitiga merah, badge merah, ikon segitiga ganda | Hapus ubin ikon kiri dan garis merah per baris. Kelompokkan: **"Segera berakhir"** (nada warning) lalu **"Lewat tenggat · 5"** (nada danger, satu header kelompok berikon + teks). Baris di dalamnya netral dengan satu badge kecil |
| T2 | Satu hal ditulis tiga kali: badge "Lewat tenggat", tanggal tenggat, dan "20 hari lalu" (yang bahkan lebih besar dari badge) | Satu ekspresi waktu relatif di dalam badge ("Lewat 20 hari", atau "2 hari lagi"). Tanggal tenggat tetap di baris meta dengan formatter G5 |
| T3 | Urutan "paling lama lewat" di atas, sehingga tugas basi 20 hari menjadi yang pertama dilihat | Khusus Home: **segera berakhir** menaik menurut tenggat, lalu **lewat tenggat** dengan yang paling baru lewat di atas, maksimal 5 baris, sisanya "+N lainnya" ke `/tasks`. Halaman `/tasks` tetap memakai urutan blueprint |
| T4 | Tinggi baris ±106 px | Tinggi ±72 px (minimal 4.5rem, target ≥44 px), seluruh baris adalah tautan. Baris 1: judul. Baris 2: ikon buku + mata kuliah · tenggat |
| T5 | Warna merah dipakai sebagai satu-satunya pembeda | Tetap ikon + teks (sudah benar pada badge). Jangan tambah warna sebagai satu-satunya penanda |

**Event mendatang**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| E1 | Hanya satu item, tinggi kartu tidak sama dengan tetangganya | Ikuti G1 dan G2. Tampilkan hingga 3 event mendatang di rail |
| E2 | Ubin tanggal "29 NOV" dan meta sudah baik | Pertahankan. Tambahkan teks relatif "22 hari lagi" (zona waktu kelas) di caption |

**Ringkasan (4 angka)**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| S1 | Posisi terlalu atas dan setiap tile setinggi ±96 px | Pindah ke bawah main. Tile kecil: ikon 40 px + angka + label, tinggi ±72 px |
| S2 | **Label salah arti.** "Tenggat dalam 3 hari = 5" padahal kelima tugas itu *sudah lewat tenggat* (RPC menghitung lewat tenggat + segera berakhir, A-09) | Ganti label menjadi "Perlu tindakan" dengan keterangan "lewat tenggat atau ≤3 hari". Angka "3" dibaca dari `DUE_SOON_HOURS`, bukan ditulis tangan. Nilai >0 memakai nada warning/danger dengan ikon + teks |
| S3 | Warna ubin ikon bergantian hijau/krem tanpa arti | Netral untuk hitungan biasa; nada semantik hanya untuk "Perlu tindakan" |
| S4 | Tile tidak bisa diklik | Tiap tile menjadi tautan ke halaman asalnya (`/members`, `/events`, `/tasks`) |
| S5 | Nol dan `NULL` | Nol ditulis kalimat ("Tidak ada tugas aktif"), `NULL` tidak dirender (blueprint §15.2) |

**Aktivitas 4 pekan**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| A1 | Teks bawah "17 **perubahan** tercatat dalam 4 pekan" | `class_activity` hanya mencatat dibuat/selesai/bergabung (A-17), bukan perubahan. Ganti: "17 aktivitas tercatat dalam 4 pekan" |
| A2 | Label sumbu "2 Nov" adalah awal minggu berjalan, tidak jelas | Tandai batang terakhir "Pekan ini"; keterangan kecil "Pekan dimulai Senin" |
| A3 | Grafik tanpa alternatif teks | `role="img"` + ringkasan teks, atau tabel tersembunyi untuk pembaca layar |
| A4 | Kartu berakhir lebih pendek daripada tetangganya | Selesai oleh G2 (kolom rail) |

**Anggota terbaru**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| M1 | Lima baris setinggi ±92 px di kartu ±810 px: ruang kosong horizontal besar; "Member" berulang empat kali dengan ukuran dan bobot hampir sama dengan nama | Grid avatar + nama (rail: 4 kolom, hingga 12 anggota sesuai blueprint §19), nama maksimal 2 baris. Peran ditampilkan **hanya bila bukan peran bawaan** (mis. badge "Wakil Ketua") |
| M2 | Inisial avatar tampil dalam campuran gaya (ada yang pucat, ada yang solid gelap/cokelat) | Satu aturan: warna ditentukan deterministik dari username dari 5–6 pasangan tinta/latar bertoken, semuanya ≥4,5:1, satu perlakuan (tinted) |
| M3 | Baris tidak jelas bisa diklik | Setiap avatar+nama adalah tautan ke `/members/[username]` (≥44 px) |

**Sidebar**

| # | Temuan | Bentuk yang benar |
|---|---|---|
| N1 | Sidebar terpotong di bawah (item "Profil saya" lalu satu baris separuh terlihat) | `position: sticky; top: 0; height: 100dvh`, kolom flex. Logo di atas, daftar nav `min-h-0 overflow-y-auto`, blok akun disematkan di bawah. Tidak ada item yang terpotong tanpa bisa digulir |
| N2 | 12 item datar dengan jarak ±54 px; hanya satu label grup | Tiga grup berlabel: **Utama** (Beranda, Jadwal, Tugas, Event, Anggota, Kelas), **Sumber daya** (Pengetahuan, Library, Cloud, Inventory, QR Studio), **Akun dan pengelolaan** (Profil saya, pengaturan, "Kelola pengetahuan" dan item lain yang butuh permission, Keluar). Tinggi item 44 px (`min-h-11`) |
| N3 | Ikon ganda atau salah arti: Kelas dan Pengetahuan sama-sama buku; Jadwal dan Event sama-sama kalender; Inventory memakai ikon tautan; Cloud memakai ikon unggah | Ikon unik per item, mis. Jadwal `CalendarClock`, Event `CalendarDays`, Kelas `School` atau `GraduationCap`, Pengetahuan `BookOpen`, Kelola pengetahuan `SquarePen`, QR Studio `QrCode`, Inventory `Package`, Cloud `Cloud`, Library `Images`. **Konfirmasi nama ikon ada** di versi `lucide-react` terpasang |
| N4 | Penanda aktif ganda: pil hijau muda **dan** batang hijau terpisah di tepi layar | Pilih satu: pil bertinta + batang 3 px di dalam tepi kiri pil. `aria-current="page"` dan fokus terlihat |
| N5 | Ada bayangan abu kabur di kiri atas, di atas logo | Cari elemen penyebab (bayangan yang terpotong) dan hapus (verifikasi) |
| N6 | Lebar sidebar tampak ±318 px | Bandingkan dengan `--sidebar-w` (16rem di blueprint). Bila tidak sengaja, kembalikan ke token agar kolom utama lebih lega |
| N7 | Item seperti "Kelola pengetahuan" dan "QR Studio" mungkin hanya untuk pengelola | Periksa permission-nya; item yang butuh izin hanya dirender bagi yang berhak (bukan disabled) dan berada di grup pengelolaan |

**Catatan mobile (screenshot kedua)**

Bukan lingkup redesain di prompt ini; perbaikan di atas ada di komponen bersama, jadi pastikan tidak ada regresi dan temuan berikut ikut tertutup. Selebihnya mengikuti `MOBILE.md`.

- Hero mobile punya masalah tumpuk yang sama (H1). Perbaikan H1 berlaku di semua ukuran.
- Header "Event mendatang" memindahkan tautan "Semua event" ke bawah judul, berbeda dari kartu Tugas. G1 menyelesaikannya.
- Baris tugas ±120 px karena badge dan "20 hari lalu" bertumpuk. T2 dan T4 menyelesaikannya.
- Ringkasan berada di atas jadwal. `MOBILE.md` §5 menaruhnya di bawah; sesuaikan.
- Bottom nav di screenshot berisi Beranda, Jadwal, Tugas, **Event**, Lainnya, sedangkan `MOBILE.md` §4.1 (`splitNav`) menetapkan Anggota sebagai destinasi keempat. Konfirmasi apakah sengaja; bila tidak, ikuti `splitNav`.
- Bottom nav tampak di tengah halaman di screenshot. Itu kemungkinan artefak tangkapan layar penuh terhadap elemen `fixed`. **Verifikasi di viewport nyata** sebelum menganggapnya bug.

### Fase

Berhenti dan lapor setelah tiap fase.

1. **Fondasi.** `SectionCard`, token yang dibutuhkan, kerangka grid Home (main + rail, titik patah 1024 dan 1280), perbaikan sidebar (N1–N7). Home sudah rapi secara struktur walau isi kartu belum diubah.
2. **Hero.** H1–H4, termasuk perubahan crop sampul kelas 16:5 dan petunjuk unggah.
3. **Kuliah, Tugas, Event.** K1–K4, T1–T5, E1–E2.
4. **Ringkasan, Aktivitas, Anggota.** S1–S5, A1–A4, M1–M3.
5. **Verifikasi.** Lihat di bawah.

### Yang tidak boleh berubah

Model data dan RPC (tanpa migration), logika visibility (`canShow`), route, urutan halaman `/tasks`, dan semua perilaku mobile di luar komponen bersama. Hanya perubahan yang disebut di tabel.

### Verifikasi (fase 5)

- Tangkap tangkapan layar sebelum dan sesudah pada 1024, 1280, 1440, 1536, 1920 px dengan data yang sama; lampirkan perbandingan.
- Ukur: selisih tinggi kolom main dan rail pada 1440 px ≤ ±96 px; tidak ada area kosong bertinggi >240 px dan selebar >40% kolomnya.
- Semua kartu memakai `SectionCard`, tinggi header seragam; tidak ada ikon ganda atau dua ekspresi waktu pada satu baris tugas.
- Tes unit: status kuliah (Selesai/Berlangsung/Berikutnya) dengan `now` disuntikkan pada tiga timezone; pengurutan tugas Home; label "Perlu tindakan" memakai `DUE_SOON_HOURS`; peran bawaan tidak dirender.
- Aksesibilitas: keyboard melalui sidebar dan tiap kartu, fokus terlihat, pembaca layar membaca grafik dan status.
- Cek 390 dan 768 px: tidak ada regresi, tidak ada overflow horizontal.
- Laporkan apa yang tidak diverifikasi (mis. tanpa perangkat nyata).

### Selesai bila

Seluruh baris tabel di atas teratasi atau ditolak dengan alasan tertulis di `docs/STATUS.md`, kriteria ukur terpenuhi, dan lint/typecheck/test/build hijau.

---

## PROMPT 3 — Dua template tampilan (Neo-Brutalism dan Arsip 1960-an) beserta perilaku mobile

**Syarat mulai.** Periksa dulu: Prompt 1 selesai (preset gelap ada, turunan `on_primary` punya fallback ke `background`), Prompt 2 selesai (`SectionCard` ada, Home sudah dirapikan), keduanya tercatat di `docs/STATUS.md`, dan lint/typecheck/test/build hijau. **Bila tidak, berhenti dan laporkan apa yang kurang. Jangan mengerjakan prompt ini lebih dulu.**

Kamu mengerjakan aplikasi Eclipse. Ikuti "Aturan bersama" di bagian atas file ini. Baca juga `neobrutalism-SKILLS.md` dan `archive-SKILLS.md`.

### Tujuan dan tafsir

Buat dua **template tampilan** yang bisa dipilih Ketua di `/settings/theme`, masing-masing mewujudkan satu skill gaya, lengkap dengan perilaku mobile (`MOBILE.md` §8):

1. **Neo-Brutalism** (`neobrutalism-SKILLS.md`)
2. **Arsip 1960-an / art deco** (`archive-SKILLS.md`, mode gelap "The Velvet Study" saja)

Template adalah paket: palet, pasangan font, token statis gaya (radius, tebal border, bayangan, gerak), dan lapisan dekorasi CSS. Template **tidak** mengubah susunan halaman, data, atau route. File skill adalah rujukan estetika. Bila bertentangan dengan `AGENTS.md`, `DESIGN.md`, `blueprint.md`, atau `MOBILE.md`, aturan proyek menang (lihat tabel konflik).

### Arsitektur (putusan, jangan diubah tanpa alasan tertulis)

- Tambah satu kunci opsional `template` pada `classes.theme`: enum `default | neobrutalism | archive`. Tema yang sudah tersimpan tanpa kunci ini dianggap `default` dan **tampil identik** dengan sekarang.
- Nilai diterapkan sebagai atribut `data-template="…"` pada elemen akar. Nilainya hanya dari enum tervalidasi, bukan string bebas.
- Selektor template memakai `[data-template="x"]` (bukan `html[data-template]`), agar pratinjau di editor dapat meletakkan atribut yang sama pada pembungkusnya.
- Nilai mentah (hex, ukuran bayangan, durasi) hanya boleh berada di `src/styles/templates/neobrutalism.css` dan `src/styles/templates/archive.css`. Tambahkan direktori itu, dan hanya itu, ke daftar izin `check-tokens`. Komponen tetap hanya memakai token.
- Jangan membuat cabang JSX per template. Template menyentuh komponen hanya lewat token dan **atribut kait publik** `data-ui="…"` pada primitive (`panel`, `button`, `nav-item`, `badge`, `avatar`, `dialog`, `fab`, `bottom-nav`, `action-bar`). Jangan mengaitkan CSS ke class internal atau urutan DOM (`AGENTS.md` §7).
- **Migration baru** (satu file) yang menjalankan `create or replace function app.theme_is_valid` dengan tambahan: bila `t ? 'template'` maka nilainya harus salah satu dari tiga di atas. Kunci lain tidak berubah. `CREATE OR REPLACE` mempertahankan hak eksekusi; verifikasi. Jangan mengedit migration lama.
- Font: `lib/theme/fonts.ts` menambah pasangan per template, dan hanya template aktif yang diberi class dan dipreload. Bila template ≠ `default`, `font_preset` **diabaikan saat render** dan kontrol font di editor dinonaktifkan dengan teks "Font mengikuti template".

### Palet template (kontras sudah saya hitung)

Seluruhnya harus lolos `ThemeSchema`. Perhatikan bahwa warna `primary`, `secondary`, `success`, `warning`, dan `error` bisa dipakai sebagai teks, sehingga warna "pekat mencolok" dari file skill **tidak boleh** dipakai di slot itu bila gagal kontras.

**Neo-Brutalism**: `layout: standard`

| Kunci | Nilai | vs `background` / `surface` |
|---|---|---|
| `background` | `#F4F0EA` | krem hangat (bukan putih murni) |
| `surface` | `#FFFDF8` | |
| `border` | `#000000` | |
| `text_primary` | `#000000` | 18,50 / 20,66 |
| `text_secondary` | `#3D3A35` | 9,97 / 11,14 |
| `primary` | `#2457D6` | 5,43 / 6,06 (kobalt dari skill `#3A86FF` hanya 3,3:1 sebagai teks) |
| `secondary` | `#6B2FD0` | 6,29 / 7,02 |
| `success` | `#1E7A3E` | 4,73 / 5,29 |
| `warning` | `#8A5A00` | 5,22 / 5,83 |
| `error` | `#C0262B` | 5,21 / 5,81 |

Turunan: `on_primary` = putih (6,16), `on_secondary` = putih (7,14).

Token isian blok (hanya di `neobrutalism.css`, untuk kartu/badge/stiker/tile; **bukan** slot palet):

| Isian | Warna | Teks di atasnya | Kontras |
|---|---|---|---|
| coral | `#FF5E5B` | hitam | 7,00 |
| marigold | `#FFBE0B` | hitam | 12,62 |
| mint | `#00F5D4` | hitam | 15,01 |
| sky | `#3A86FF` | hitam | 6,03 |
| violet | `#8338EC` | **putih** (hitam hanya 3,74 dan gagal) | 5,61 |

**Arsip 1960-an**: `layout: standard`

| Kunci | Nilai | vs `background` / `surface` |
|---|---|---|
| `background` | `#141311` | |
| `surface` | `#1C1A17` | |
| `border` | `#3A3226` | dekoratif |
| `text_primary` | `#E6DEC8` | 13,83 / 12,94 |
| `text_secondary` | `#B9AE93` | 8,43 / 7,89 |
| `primary` | `#C5A059` | kuningan: 7,56 / 7,07 |
| `secondary` | `#8FAE98` | 7,67 / 7,17 |
| `success` | `#8FB58F` | 8,11 / 7,59 |
| `warning` | `#D9A441` | 8,26 / 7,72 |
| `error` | `#E07A5F` | 6,29 / 5,89 |

Turunan: `on_primary` dan `on_secondary` = `background` (7,56 dan 7,67). Ini bergantung pada perbaikan di Prompt 1.

Token isian blok (hanya di `archive.css`):

| Isian | Warna | Teks di atasnya | Kontras |
|---|---|---|---|
| karat | `#A03E27` | gading `#E6DEC8` | 4,87 (karat dari skill `#A8422B` hanya 4,497 dan **gagal tipis**; `#C85A32` hanya 3,15) |
| zaitun | `#4A5D4E` | gading | 5,27 |

Garis hias kuningan (`#C5A059` dengan alfa) bersifat dekoratif dan tidak boleh menjadi batas input; batas input tetap `text_secondary`.

### Tabel konflik: skill versus aturan proyek

| Anjuran skill | Putusan |
|---|---|
| Bayangan keras `shadow-[4px_4px_0_0_#000]` (kelas arbitrer) | Jadi token `--shadow-panel`, `--shadow-press` di `neobrutalism.css`; komponen memakai token |
| Judul HURUF BESAR | Lewat `text-transform` pada token judul section, bukan mengubah teks di DOM. Isi, label tombol, dan body tidak dikapitalisasi |
| Efek angkat saat hover, tekan saat klik | Angkat hanya di `@media (hover: hover)`. Efek tekan lewat `:active` (jalan di layar sentuh). Durasi ≤150 ms; `prefers-reduced-motion` → 0 ms |
| Stiker/badge miring di sudut kartu | Hanya berisi **data nyata** (status, jumlah), miring ≤3°, tidak menutupi teks, tidak menambah overflow horizontal |
| Overlay grain `<svg>` fixed dengan `feTurbulence` hidup, `z-50` | Pakai **ubin statis** (data-URI kecil) pada pseudo-elemen `fixed`, `pointer-events: none`, `aria-hidden`, alfa ±4%, `z-index` token `--z-grain: 60`. Dialog modal berada di top layer sehingga tetap di atasnya. Matikan di bawah `prefers-contrast: more`. Filter SVG hidup di seluruh viewport berisiko patah-patah di Android kelas menengah |
| Titik berlian dan kaca ✦ ◆ sebagai elemen DOM | Pseudo-elemen CSS (`::before`/`::after`, `content`), tidak masuk pohon aksesibilitas |
| Bingkai ganda lewat pembungkus `p-1` | `box-shadow: inset` dan/atau `outline` pada `data-ui="panel"`, tanpa DOM tambahan |
| Transisi 400–600 ms "jam kuningan" | Hanya untuk **ornamen** (putar berlian, garis kuningan) di desktop. Transisi fungsional (sheet, dropdown, umpan balik tombol) tetap sesuai `MOBILE.md` §4.9 (≤200 ms). Ornamen yang dipicu hover juga dipicu oleh `[aria-current]`, `:focus-visible`, dan `:active` agar ada padanannya di layar sentuh |
| Italic acak pada kata dalam judul | Tidak dibuat (konten pengguna tidak bisa ditandai otomatis) |
| Huruf awal besar (drop cap) dan kolom koran | Opsional: drop cap hanya untuk deskripsi kelas di `/class`. Kolom koran tidak dibuat |
| Stempel "VERIFIED // 1999", nomor kasus, tanggal 1966 | **Tidak boleh**: data karangan. Gaya mono hanya diterapkan pada data nyata (tanggal, jam, kode kelas, jumlah). Stempel hanya untuk status nyata (mis. "Lewat tenggat") |
| Avatar bulat dan pil `rounded-full` dilarang gaya arsip | Pada template arsip radius avatar dan badge lewat token `--radius-avatar`/`--radius-chip` yang kecil. Pada neo-brutalism hanya titik status kecil yang boleh bulat |
| Ikon kilau/sparkles dilarang | Sudah tidak dipakai (Prompt 2, H3) |
| Teks pada isian warna terang atau mencolok | Wajib ≥4,5:1 (tabel isian di atas). Teks hitam di atas violet dilarang |
| Font tipis (Cormorant) | Cormorant Garamond hanya untuk display dan heading ≥1.125rem berbobot ≥500. Teks lebih kecil memakai font body |

### Pasangan font

| Template | Display/heading | Body | Mono (data, label, tombol) |
|---|---|---|---|
| Neo-Brutalism | Space Grotesk 700–800 | Public Sans | Space Mono |
| Arsip 1960-an | Cormorant Garamond | Source Sans 3 | Courier Prime |

Bila sebuah font tidak tersedia di `next/font/google` versi terpasang, ganti dengan padanan terdekat dan catat di `docs/STATUS.md`.

### Perilaku mobile per template (menjabarkan `MOBILE.md` §8)

Aturan `MOBILE.md` (target 44 px termasuk border, satu lapis overlay, tanpa hover-only, anggaran chrome 25%, reduced motion) **tetap berlaku penuh**. Template hanya mengganti penampilan.

**Neo-Brutalism**

- `BottomNav`: border atas 3 px; item aktif = blok isian `primary` dengan teks `on_primary` + label tetap terlihat (bukan hanya warna).
- `Fab` extended: border tebal + bayangan keras kecil; label tetap ada.
- `sheet`: border atas tebal, tanpa bayangan (tepinya menempel layar). `confirm`: border tebal + bayangan keras.
- Offset bayangan satu tingkat lebih kecil di ≤767 px agar tidak menabrak gutter 16 px.
- Tidak ada `backdrop-blur` atau gradien.

**Arsip 1960-an**

- `BottomNav`: permukaan `surface`, garis kuningan 1 px + garis dalam; item aktif berteks kuningan dengan berlian kecil di atas label (pseudo-elemen) dan garis 1 px; tanpa kaca.
- `Fab`: persegi dengan bingkai ganda kuningan; label tetap terbaca.
- `sheet`: bingkai ganda di sisi atas. Ornamen sudut dikurangi (dua simpul, bukan empat) di ≤767 px.
- Grain: ukur di perangkat kelas menengah; bila menyebabkan patah-patah saat menggulir, nonaktifkan di ≤767 px dan catat.

### Fase

Berhenti dan lapor setelah tiap fase.

**Fase A — Fondasi tanpa perubahan visual.**
1. Telusuri kode: bagaimana radius, border, bayangan, dan durasi dipakai komponen sekarang.
2. Tambah alias semantik di `@theme`: `--radius-panel/-control/-chip/-avatar`, `--border-w-panel/-control`, `--shadow-panel/-overlay/-press`, `--motion-fast/-base/-ornament`, `--ease-*`. Nilai bawaan = nilai yang dipakai sekarang.
3. Pindahkan komponen ke alias itu dan pasang kait `data-ui` pada primitive.
4. **Bukti tak ada perubahan:** tangkapan layar sebelum dan sesudah untuk Home, Tugas, Anggota, Settings/theme, dan satu dialog pada 390 dan 1280 px; selisih harus nol atau dijelaskan.

**Fase B — Model tema dan editor.**
1. `template` pada `ThemeSchema` (opsional, default `default`), migration `theme_is_valid`, tes pgTAP (template tak dikenal ditolak; tema lama tanpa kunci valid).
2. Render `data-template` dari enum tervalidasi; fallback ke `default` bila rusak (dicatat di log); `font_preset` diabaikan untuk template non-default.
3. Editor `/settings/theme`: pilihan "Template" (tiga opsi dengan satu kalimat penjelasan) yang memuat palet template ke pratinjau (belum tersimpan, A-12). Pembungkus pratinjau menerima `data-template`.
4. Fungsi `fonts.ts` menambah dua pasangan font.
5. Tes unit: kedua palet lolos `ThemeSchema`, tabel isian memenuhi ≥4,5:1, `DEFAULT_THEME` tetap identik dengan seed.

**Fase C — Template Neo-Brutalism.** `neobrutalism.css` (token + dekorasi lewat `data-ui`), perilaku mobile di atas, tes visual.

**Fase D — Template Arsip 1960-an.** `archive.css`, ubin grain, ornamen, perilaku mobile di atas, tes visual.

**Fase E — Verifikasi.**
- Matriks: 2 template × {Home, Tugas, Settings/theme, Login, satu dialog/sheet} × {390, 768, 1280 px}. Lampirkan tangkapan layar.
- Kontras palet dan isian sebagai tes; kontras visual lewat sampel.
- Keyboard dan fokus terlihat pada tiap template; `prefers-reduced-motion` menghilangkan gerak ornamen dan sheet; `prefers-contrast: more` mematikan grain.
- Tidak ada overflow horizontal di 360–1536 px.
- Mengganti template berulang kali tidak menyisakan token template sebelumnya (tidak ada "bocor").
- Laporkan terbuka bila grain belum diuji di perangkat nyata.

### Acceptance criteria

1. Ketua dapat memilih template, melihat pratinjau, mempublikasikan, dan seluruh aplikasi (termasuk halaman login untuk anonim) memakai template itu pada request berikutnya.
2. Tema lama tanpa kunci `template` tampil identik dengan sebelum perubahan (bukti Fase A).
3. Tidak ada hex, ukuran bayangan, atau durasi mentah di luar `styles/templates/*.css` dan `globals.css`; `check-tokens` hijau.
4. Setiap kombinasi teks/latar pada kedua template ≥4,5:1; batas input ≥3:1.
5. Semua target sentuh ≥44×44 px pada kedua template di mobile (border dihitung di dalam kotak).
6. Perilaku `MOBILE.md` tidak berubah oleh template: struktur navigasi, overlay, FAB, mode fokus sama.
7. Tidak ada teks atau label karangan; efek hanya pada data nyata.
8. `theme_is_valid` menolak `template` di luar enum; tema lama tetap valid.

### Tidak dibuat

Mode terang arsip ("The Aged Broadsheet"), pemilihan template per pengguna, toggle mode gelap per pengguna, perubahan susunan halaman, tata letak koran, aset gambar atau font di luar `next/font/google`, stempel atau nomor kasus karangan, ikon kilau, kaca (`backdrop-blur`).

### Selesai bila

Semua acceptance criteria terpenuhi, hasil dan batasan (terutama yang belum diverifikasi di perangkat nyata) tercatat di `docs/STATUS.md`, dan lint/typecheck/test/test:db/build hijau. Beri saya perintah `supabase db push` untuk migration yang baru; jangan menjalankannya sendiri.
