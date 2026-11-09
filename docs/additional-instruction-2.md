# additional-instruction-2.md — Perbaikan proporsi Home mobile dan susunan ulang area bawah banner (desktop)

Satu prompt, disalin utuh ke agent. Dijalankan setelah Prompt 1–3 di `additional-instruction.md` selesai (screenshot yang dianalisis sudah memakai template Neo-Brutalism).

---

## PROMPT 4 — Home: proporsi mobile + area identitas banner

Kamu mengerjakan aplikasi Eclipse. Baca dulu `AGENTS.md`, `DESIGN.md` (v2), `MOBILE.md`, dan `docs/STATUS.md`. Kode terkini adalah sumber kebenaran; bila temuan di bawah berbeda dari kode, ikuti kode dan catat selisihnya. Aturan umum seperti di prompt sebelumnya: tanpa dependensi baru, tanpa migration, tanpa nilai arbitrer (`check-tokens` hijau), semua warna/radius/bayangan lewat token sehingga **benar di ketiga template** (`default`, `neobrutalism`, `archive`), jangan commit, dan periksa ulang kelengkapan serta konsistensi sebelum melapor.

### Lingkup (dua hal saja)

1. **Home mobile (<1024 px):** perbaiki proporsi elemen, terutama teks. Bagian **Anggota terbaru sudah baik, jangan diubah** (grid avatar 4 kolom, nama, badge peran).
2. **Home desktop (≥1024 px): pertahankan seutuhnya.** Satu-satunya yang disusun ulang adalah **area identitas di bawah gambar banner** (blok yang berisi kode kelas, tanggal, judul "Eclipse", tagline, dan tombol "Ini sorotan"), karena kini terlihat kosong. Susunan ulang itu juga menentukan bentuk di mobile.

### Yang tidak boleh berubah

Sidebar, bottom nav, perilaku navigasi, urutan section, isi dan urutan kartu Kuliah/Tugas/Event/Aktivitas/Anggota di desktop, grid main+rail desktop, data, RPC, route, tema/template. Jangan menyentuh Home desktop di luar blok identitas banner.

---

### A. Area identitas banner (desktop dan mobile)

**Masalah di desktop.** Di bawah gambar banner, empat baris teks (caption kode+tanggal, judul, tagline, tombol sorotan) menumpuk di ±25% kiri, sedangkan ±75% kanan kosong dengan tinggi blok ±270 px. Tombol "Ini sorotan" tampak seperti tombol biasa yang tersesat.

**Bentuk akhir desktop (≥1024 px)**: satu blok dua zona, tinggi target ≤ ±150 px (bukan ±270 px).

```
┌── gambar banner (tidak berubah) ─────────────────────────────────────────┐
├──────────────────────────────────────────────┬───────────────────────────┤
│ ECL-SI2024UNG                  (caption mono) │ HARI INI          (label) │
│ Eclipse                         (h1 display)  │ Senin, 9 November 2026    │
│ Kelas E SI 2024                 (tagline)     │ ┌ SOROTAN ────────────┐   │
│                                               │ │ Ini sorotan       ↗ │   │
│                                               │ └─────────────────────┘   │
└──────────────────────────────────────────────┴───────────────────────────┘
```

- Zona kiri (identitas) `flex-1`; zona kanan (konteks) lebar tetap dari token (±22–26rem), dipisah garis tipis vertikal (token border), rata atas dengan judul. Tiga baris kiri sejajar secara baseline dengan dua blok kanan.
- Caption kode kelas dan tanggal **dipecah**: kode kelas tetap di atas judul; tanggal pindah ke zona kanan dengan label "Hari ini". Format tanggal dari formatter `lib/time` yang sama dengan sekarang, zona waktu kelas.
- **Sorotan** menjadi callout: label kecil "Sorotan" + teks `highlight_text`, seluruhnya satu tautan ≥44 px bila `highlight_url` ada (ikon tautan luar hanya di kasus itu, `rel="noopener noreferrer"`). Bila `highlight_url` kosong, callout tetap tampil sebagai teks (bukan tombol). Bila `highlight_text` kosong, callout tidak dirender dan zona kanan hanya berisi tanggal.
- Teks sorotan boleh sampai dua baris, lalu dipotong dengan elipsis (`line-clamp` token). Teks penuh tetap ada di `title`/aksesibel.
- Judul tidak berubah isi dan hirarkinya (`<h1>`), ukuran tetap mengikuti token display yang sudah ada.
- 1024–1279 px: zona kanan menyempit ke lebar minimum token; bila identitas tidak muat, nama kelas boleh turun baris, tetapi blok tidak boleh menjadi tiga baris tinggi lagi.
- Padding vertikal blok: `py` satu langkah di bawah sekarang (token), supaya blok lebih rapat dan banner lebih dominan.

**Bentuk akhir mobile (<1024 px)**: satu kolom, urutan:

1. Caption: kode kelas (kiri). Boleh membungkus ke baris kedua; tanggal di baris sendiri bila tidak muat.
2. Judul `<h1>`.
3. Tagline.
4. Tanggal sebagai satu baris caption dengan ikon kalender (bukan pil).
5. Sorotan sebagai callout lebar penuh, tinggi ≥44 px (label "Sorotan" di atas teks, atau ikon + teks satu baris).

Jarak antar-elemen satu langkah skala spasi (`gap-2`/`gap-3`), padding blok `p-4`.

**Hal yang dijaga.** Tidak ada teks karangan; semua dari data kelas. Tidak ada tumpukan di atas gambar (gambar tetap hanya gambar). Tidak ada ikon kilau/dekoratif.

---

### B. Proporsi elemen di mobile

Semua nilai di bawah memakai token. Bila token ukuran/spasi yang dibutuhkan belum ada, **tambah token di `@theme`**, bukan nilai arbitrer. Ukuran adalah perkiraan dari screenshot mobile 390 px; ukuran target adalah acuan, bukan nilai literal.

#### B0. Temuan menyeluruh (mobile)

| # | Temuan di screenshot | Dampak |
|---|---|---|
| P1 | Header section menaruh ikon + judul + meta (mis. "· Senin (WITA)") + tombol aksi dalam **satu baris**; judul terpotong: "KULIAH HARI I…", "AKTIVITAS 4 PEKAN TERAK…"; tombol "Semua …" berbingkai besar memakan ±40% lebar | Judul hilang sebagian, header padat |
| P2 | Baris "Kuliah berikutnya: Selasa, 10 Nov · 10:30 — Data" terpotong tanpa tanda, nama mata kuliah hilang | Informasi utama hilang |
| P3 | Baris tugas: badge "LEWAT 9 HARI" di kanan menyisakan kolom meta ±50% lebar; nama mata kuliah pecah per kata ("Arsitektur / Sistem / Informasi") dan tanggal pecah tiga baris ("Min, 1 Nov, / 00:59 / WITA"); tinggi baris ±120 px | Baris terlalu tinggi, sulit dipindai |
| P4 | Lima baris tugas semuanya tampil | Home menjadi panjang, bagian setelahnya terdorong jauh |
| P5 | Ringkasan 2×2: ubin ikon kiri memakan lebar, label membungkus ("Event mendatang" terpotong di tepi kanan; "Perlu tindakan / lewat tenggat atau ≤3 hari" membungkus enam baris) | Label terpotong, tile tidak seimbang |
| P6 | Ukuran teks tidak konsisten antar bagian: judul section, judul baris, meta, dan label tile hampir sama besar/berat; mono bertracking lebar di tombol dan badge membuat teks lebih lebar | Hirarki lemah, teks lebih cepat membungkus |
| P7 | Grafik Aktivitas: tinggi ±200 px, satu batang mendominasi, angka di atas tiap batang; keterangan di bawah memakai dua ukuran berbeda | Terlalu tinggi untuk 3 data |
| P8 | Bottom nav tampak berada di tengah halaman pada tangkapan layar penuh dan menimpa "Kuliah berikutnya" | Kemungkinan artefak tangkapan penuh terhadap elemen `fixed`; **verifikasi di viewport nyata**. Bila benar nyata, perbaiki |

#### B1. Skala tipografi mobile (acuan; samakan dengan token DESIGN.md)

| Peran | Target | Catatan |
|---|---|---|
| Judul `<h1>` banner | ±1.75rem, leading rapat | Tidak lebih kecil dari ±1.5rem |
| Judul section (`SectionCard`) | ±0.9375–1rem, bobot 700 | Boleh membungkus ke 2 baris, **tidak pernah dipotong elipsis** |
| Judul baris (tugas, event, kuliah) | 1rem, bobot 600 | Maksimal 2 baris lalu elipsis |
| Meta baris (mata kuliah, jam, tenggat) | 0.8125rem (13 px) | Tidak di bawah 12 px; teks penting tidak dipasang di 12 px |
| Badge | 0.75rem, mono, `tracking` normal (bukan lebar) | Satu baris, `whitespace-nowrap` |
| Tombol/tautan aksi | 0.8125–0.875rem | Target ≥44 px |
| Angka tile ringkasan | ±1.5–1.75rem | Label di bawahnya 0.8125rem |
| Caption (mis. "Pekan dimulai Senin") | 0.75rem | Hanya info sekunder |

Bila template memakai `text-transform: uppercase` untuk judul section, tracking dan ukuran yang dipakai harus tetap muat; judul uppercase di mobile dibatasi tracking normal.

#### B2. Header section (P1)

- Mobile: **dua baris yang jelas**. Baris 1: ikon 20 px + judul (boleh membungkus). Baris 2 (opsional): meta sekunder (mis. "Senin · WITA") sebagai caption `text_secondary`. Meta tidak lagi menumpang di baris judul.
- Tautan aksi ("Semua jadwal/tugas/event/anggota"): tetap di kanan baris 1, tetapi **tanpa bingkai tebal di mobile**: tautan teks + panah, tinggi sentuh 44 px (area ketuk diperluas lewat padding, bukan lewat bingkai). Pada <640 px label boleh diringkas menjadi "Semua" dengan sisanya `sr-only` ("Semua jadwal"), supaya judul tidak terdorong.
- Tinggi header minimal 3rem (token), padding horizontal sama dengan isi kartu (`px-4`).
- Pada desktop (≥1024) header **tidak berubah**.

#### B3. Kuliah hari ini (P2)

- Ubah "Kuliah berikutnya" menjadi tiga baris bertumpuk yang tidak pernah terpotong: label caption "Kuliah berikutnya" → jam dan hari ("Selasa, 10 Nov · 10.30") → nama mata kuliah sebagai judul baris (boleh 2 baris).
- Bila ada kuliah hari ini: baris datar sesuai Prompt 2 (K1–K3), jam di kolom kiri ±3.5rem, nama + lokasi di kanan, **nama mata kuliah membungkus, tidak dipotong tanpa elipsis**.

#### B4. Tugas (P3, P4)

Bentuk baris mobile (tinggi target ±72–88 px, bukan ±120 px):

```
Freebuff                                   ← judul baris (1rem/600), boleh 2 baris
[⚠ LEWAT 9 HARI]  Min, 1 Nov · 00.59 WITA  ← badge + tenggat, satu baris, flex-wrap bila sempit
▯ Arsitektur Sistem Informasi              ← ikon buku + mata kuliah, lebar penuh, boleh membungkus per kata
```

- Badge **pindah dari kolom kanan ke baris meta**, sehingga mata kuliah dan tanggal memakai lebar penuh (tidak lagi dua kolom sempit).
- Tanggal tenggat `whitespace-nowrap` (tidak boleh pecah di tengah); bila baris tidak muat, badge dan tanggal turun ke baris terpisah, bukan pecah di dalam elemen.
- Mobile hanya menampilkan **3 tugas** pertama, lalu satu tautan baris penuh "Lihat semua {n} tugas" ke `/tasks` (target ≥44 px). Ini penyesuaian dari batas 5 di `MOBILE.md` §5; catat sebagai keputusan di `docs/STATUS.md`. Desktop tetap 5.
- Header kelompok "Lewat tenggat · 5" tetap, dengan ikon + teks.

#### B5. Ringkasan 2×2 (P5)

- Bentuk tile mobile: **vertikal**. Baris atas: angka besar (kiri) dan ikon 20–24 px tanpa ubin latar (kanan). Baris bawah: label lebar penuh yang boleh membungkus maksimal 2 baris. Tinggi minimal 5rem, dua tile sebaris sama tinggi.
- Tile "Perlu tindakan": bila nilai >0 menjangkau **dua kolom** (`col-span-2`), tata letak horizontal: angka + label "Perlu tindakan" + keterangan caption "Lewat tenggat atau ≤3 hari" dalam satu baris yang membungkus rapi. Bila nilai 0, kembali ke tile satu kolom.
- Label "Event mendatang" dan lain-lain tidak boleh keluar dari tepi; tes dengan teks terpanjang.
- Tile tetap tautan ke halaman asal, target ≥44 px.
- Posisi: ikuti `MOBILE.md` §5 (ringkasan di bawah daftar jadwal/tugas), kecuali sudah sesuai.

#### B6. Aktivitas (P7)

- Tinggi area batang ±112–128 px (token), bukan ±200 px; nilai di atas batang 0.8125rem; label sumbu 0.75rem.
- Bungkus dalam `Disclosure` sesuai `MOBILE.md` §5: judul + ringkasan satu baris ("3 aktivitas dalam 4 pekan") terlihat saat tertutup, grafik muncul saat dibuka. Tertutup secara bawaan.
- Satu ukuran untuk keterangan ("3 aktivitas tercatat dalam 4 pekan." 0.875rem) dan satu ukuran caption ("Pekan dimulai Senin." 0.75rem).
- Judul boleh "Aktivitas 4 pekan" di mobile bila "terakhir" tidak muat dalam satu baris; tidak boleh terpotong elipsis.

#### B7. Event mendatang dan Anggota terbaru

- Event: hanya terapkan perbaikan header (B2). Isi sudah baik.
- Anggota: **tidak diubah** selain header yang mengikuti B2 bila tampilannya memakai `SectionCard` yang sama.

#### B8. Jarak vertikal dan padding

- Jarak antar-kartu satu nilai token (±16 px). Padding isi kartu `p-4`; baris daftar `py-3`. Tidak ada jarak ganda (padding + margin yang menumpuk).
- Konten terakhir tidak tertutup bottom nav: `padding-bottom` ≥ `--bottom-nav-h` + `env(safe-area-inset-bottom)` (periksa; ini juga cara memverifikasi P8).

---

### Fase

Berhenti dan lapor setelah tiap fase.

1. **Banner (A)** di desktop dan mobile. Tangkapan layar 1024, 1280, 1440, 1920 dan 390, dengan dan tanpa `highlight_text`, dan dengan `highlight_url` kosong.
2. **Mobile B1–B3, B8:** skala tipografi, header section, kuliah.
3. **Mobile B4–B7:** tugas, ringkasan, aktivitas.
4. **Verifikasi.**

### Verifikasi

- Tangkapan layar sebelum/sesudah Home pada **390, 360, 430, 768** (mobile/tablet) dan **1024, 1280, 1440, 1920** (desktop), pada ketiga template. **Desktop selain blok identitas banner harus identik piksel-per-piksel** (atau selisih dijelaskan).
- Ukur: tidak ada judul section terpotong elipsis pada 360–430 px; tinggi baris tugas mobile ≤ ±88 px; tidak ada label tile terpotong; tidak ada overflow horizontal (≥320 px); blok identitas banner desktop pada 1440 px ≤ ±150 px.
- Uji dengan teks terpanjang: nama kelas 60 karakter, mata kuliah 80 karakter, judul tugas 100 karakter, `highlight_text` 200 karakter, zona waktu berbeda.
- Target sentuh ≥44×44 px (bingkai dihitung di dalam kotak) pada tautan aksi, tile, baris tugas, callout sorotan.
- Kontras: semua teks ≥4,5:1 pada ketiga template, termasuk callout sorotan dan caption.
- Keyboard dan fokus terlihat; `Disclosure` aktivitas dapat dibuka dengan keyboard; grafik tetap punya alternatif teks.
- Tes unit: `highlight_text` kosong → callout tidak dirender; `highlight_url` kosong → bukan tautan; batas 3 tugas mobile dan 5 desktop; label ringkas "Semua" tetap aksesibel ("Semua tugas").
- Bottom nav diverifikasi di viewport nyata (bukan tangkapan layar penuh).
- Laporkan apa yang tidak diverifikasi (mis. tanpa perangkat nyata).

### Selesai bila

Blok identitas banner tidak lagi tampak kosong di desktop dan rapi di mobile; semua temuan P1–P8 teratasi atau ditolak dengan alasan tertulis di `docs/STATUS.md`; Home desktop di luar blok identitas tidak berubah; Anggota terbaru mobile tidak berubah; lint/typecheck/test/build hijau.
