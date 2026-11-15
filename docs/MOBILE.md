# MOBILE.md — Aturan Layout Mobile (Eclipse)

| | |
|---|---|
| Status | Tambahan atas `DESIGN.md` §8 dan `blueprint.md` §11.5, §16, §17.3. Dibaca bersama `AGENTS.md`. |
| Berlaku untuk | Semua layar aplikasi (`/`, `/class`, `/schedule`, `/events`, `/tasks`, `/members`, `/settings/*`, auth) dan fitur baru (mis. Eclipse Knowledge). |
| Prinsip inti | Di mobile layout **disusun ulang**, bukan sekadar diperkecil. Kualitas desktop tidak boleh turun karena pekerjaan mobile. |
| Bahasa | Dokumen Indonesia. Kode/identifier Inggris. Copy UI Indonesia. |

Jenis aturan mengikuti `DESIGN.md`: `[HARD]` wajib, `[DEFAULT]` standar (boleh menyimpang dengan alasan satu baris), `[CHECK]` diverifikasi sebelum layar dianggap selesai.

---

## 0. Prioritas dan hubungan dengan dokumen lain

1. Dokumen ini adalah permintaan eksplisit pemilik produk. Pada baris yang tercantum di §1 (deviasi `M-xx`) ia **menggantikan** `blueprint.md` §16 / §11.5. Di luar itu ia tidak mengubah apa pun di blueprint.
2. `AGENTS.md` tetap mengikat: tidak ada dependensi baru, tidak ada mekanisme kedua untuk hal yang sudah ada, tidak ada nilai arbitrer di komponen, aksesibilitas adalah lantai.
3. Token dan gaya visual berasal dari `DESIGN.md` / theme kelas. Dokumen ini hanya mengatur **komposisi dan perilaku**, bukan warna atau font, sehingga tetap berlaku bila gaya diganti (§8).
4. Contoh kode adalah **intent**. Konfirmasi sintaks Tailwind, Next.js, dan dukungan browser dari versi terpasang sebelum memakainya (`AGENTS.md` §3).
5. Konfliknya dicatat di `docs/STATUS.md`. Pola halaman di §5 ditulis dari blueprint dan migration yang ada; bila sumber kode terkini berbeda (mis. model jadwal setelah migration 0010), **kode terkini yang benar** dan resep disesuaikan.

---

## 1. Deviasi dari blueprint

| ID | Blueprint | Aturan baru | Alasan |
|---|---|---|---|
| M-01 | §16: Dialog = "layar penuh" di mobile | Tiga varian: `sheet`, `confirm`, `fullscreen` (jarang). Aturan di §4.2 | Layar penuh untuk konfirmasi dua tombol memboroskan ruang dan memutus konteks; form panjang sudah berupa route |
| M-02 | §11.5/§16: anonim = `TopBar` berisi tautan halaman + "Masuk" | Di <1024 px tautan pindah ke tombol "Menu" (hamburger) bila ada ≥2 halaman terlihat | Tautan tidak muat di 360 px |
| M-03 | §11.5: `BottomNav` berisi item halaman | 4 destinasi + 1 tombol "Lainnya" (sheet). Algoritma di §4.1 | Enam destinasi plus pengaturan tidak muat; batas `DESIGN.md` B2 maksimal 5 |
| M-04 | — | Route buat/ubah/onboarding memakai **mode fokus**: `BottomNav` disembunyikan, `StickyActionBar` menggantikannya | Keyboard layar dan bar bawah saling berebut ruang |
| M-05 | §11.2 tidak punya FAB | Komponen `Fab` untuk aksi "buat baru" bagi pemegang permission di <1024 px | Aksi utama masuk zona jempol; tombol di `PageHeader` tersembunyi di sana agar tidak ganda |
| M-06 | §10: `/settings` redirect ke `/settings/profile` | Route tetap. Di <1024 px ditambah `SettingsSwitcher` (tombol + sheet) untuk berpindah antar halaman pengaturan | Enam sub-halaman tidak muat sebagai tab |
| M-07 | §17.3 z-index `base 0, bar 10, dialog 50` | Tambah `fab 20`. Tambah token tinggi bar dan batas sheet (§6) | Layer baru |
| M-08 | §11.5: semua layar aplikasi memakai `AppFrame` | `/intro` memakai layout sendiri di luar grup `(app)` tanpa `TopBar`/`Sidebar`/`BottomNav`; cek MFA disalin, skip link dan navigasi keluar tetap ada | Panggung sinematik membutuhkan viewport penuh; halaman ini bukan beranda klasik |

---

## 2. Prinsip `[HARD]`

1. **Susun ulang, bukan perkecil.** Setiap layar punya komposisi mobile yang dirancang: apa yang naik, turun, disembunyikan di balik kontrol, atau berpindah ke overlay. Menumpuk kolom desktop jadi satu kolom saja belum selesai.
2. **Satu sumber data, satu set komponen, beberapa komposisi** (`AGENTS.md` §5). Pemuatan data dan logika tidak boleh bercabang per ukuran layar. Cabang hanya di lapisan presentasi.
3. **CSS yang memutuskan layout.** Pakai varian breakpoint Tailwind, bukan `useMediaQuery`/`window.innerWidth` untuk layout (menghindari hydration mismatch dan kedipan). JavaScript hanya untuk interaksi (buka/tutup, fokus).
4. **Tidak menduplikasi DOM interaktif.** Boleh merender dua komposisi **hanya** bila isinya murni tampilan tanpa input/form/id unik, dan satu disembunyikan dengan `display: none` (keluar dari pohon aksesibilitas). Form, dialog, dan kontrol tidak boleh dobel.
5. **Mobile-first.** Gaya dasar = mobile; `md:` dan `lg:` menambah. Pengecualian: menyembunyikan komposisi lain (`max-lg:hidden`).
6. **Desktop tidak boleh bergeser.** Perubahan mobile diverifikasi tidak mengubah layout ≥1024 px (§8 CHECK).
7. **Tidak ada fungsi yang hanya bisa dicapai lewat hover, tooltip, long-press, atau gestur.** Semua aksi punya kontrol tampak. Hover hanya penguat tambahan.
8. **Satu tugas per layar, aksi utama di zona jempol.** Aksi primer berada di separuh bawah layar (FAB, `StickyActionBar`, sheet). Aksi destruktif tidak bersebelahan dengan aksi primer.
9. **Anggaran chrome.** Elemen tetap (fixed/sticky) pada viewport 360×640 maksimal 25% tinggi layar dan maksimal dua bar sekaligus (atas + bawah). FAB dihitung terpisah dan tidak boleh menutup konten terakhir.
10. **Tanpa dependensi baru.** Cukup `<dialog>`, atribut `popover`, CSS, dan komponen yang sudah ada. Tanpa library gestur/sheet/drawer.
11. **Tautan dibagikan lewat WhatsApp.** Pengguna sering mendarat langsung di halaman dalam tanpa riwayat. Navigasi "kembali" memakai `href` ke induk, bukan `history.back()`.

---

## 3. Kelas layar dan perilakunya

Nav berganti di 1024 px; overlay berganti di 768 px. Keduanya sengaja berbeda: tablet punya ruang untuk dialog di tengah tetapi belum cukup lebar untuk sidebar (sesuai blueprint §16).

| Kelas | Lebar | Navigasi | Overlay | Aksi "buat baru" | Konten |
|---|---|---|---|---|---|
| Phone | 360–767 | `BottomNav` + `TopBar` ringkas | `sheet` dari bawah, `confirm` ringkas di tengah | `Fab` | 1 kolom |
| Tablet | 768–1023 | `BottomNav` + `TopBar` | dialog tengah, `ActionMenu` sebagai dropdown berlabuh | `Fab` | hingga 2 kolom |
| Desktop | ≥1024 | `SidebarNav` + `TopBar` penuh (`UserMenu`) | dialog tengah, dropdown | tombol di `PageHeader` | hingga 3 kolom |

Ponsel lanskap (tinggi < 30rem): `TopBar` tidak lagi sticky, `BottomNav` tetap, sheet maksimal `--sheet-max-h`. Jangan mengandalkan orientasi portrait.

---

## 4. Katalog pola

### 4.1 Navigasi

**`BottomNav` `[DEFAULT]`**

- Isi: 4 destinasi + "Lainnya". Label teks selalu tampil di samping ikon. Aktif ditandai `aria-current="page"` + indikator bentuk (garis atas dan berat font), bukan warna saja.
- Prioritas destinasi mengikuti urutan prioritas PRD, **hanya yang `canShow`**. Empat pertama masuk bar, sisanya ke "Lainnya":

```ts
// features/nav/split.ts — fungsi murni, dites dengan Vitest
const PRIORITY = ['page.home','page.schedule','page.tasks','page.members','page.events','page.class_about'] as const;
export function splitNav(visible: ReadonlySet<VisibilityKey>) {
  const ordered = PRIORITY.filter((k) => visible.has(k));
  return { bar: ordered.slice(0, 4), more: ordered.slice(4) };
}
```

- "Lainnya" adalah tombol (bukan route) yang membuka `sheet` berisi: grup **Halaman** (sisa destinasi), grup **Pengaturan** (hanya yang diizinkan permission; Profil dan Akun untuk semua anggota, item pengelola untuk pemegang permission), grup **Akun** (Keluar). Tombol "Lainnya" berstatus aktif bila rute sekarang berada di dalam sheet itu.
- Lencana angka hanya untuk data nyata (mis. jumlah permintaan ganti kata sandi tertunda bagi Ketua) dan selalu berupa angka + teks aksesibel.
- Tinggi memakai `min-h` (token `--bottom-nav-h`) plus safe-area, bukan tinggi tetap, agar label tidak terpotong pada font sistem besar. Label ≤ 8 karakter.
- **Tidak tampil**: anonim, halaman auth, dan mode fokus (M-04).

**`TopBar` mobile `[DEFAULT]`** (tinggi `--bar-top-h`, sticky biasa, tanpa hide-on-scroll)

- Mode *root* (halaman level atas): logo + nama kelas (1 baris, truncate) di kiri; slot kanan maksimal satu aksi berlabel.
- Mode *pushed* (detail, sub-halaman pengaturan, mode fokus): `BackLink` (ikon + teks "Kembali", `href` ke induk) di kiri, judul pendek di tengah (bukan heading; `<h1>` tetap di konten), slot aksi kanan maksimal satu ("Edit"), aksi lain masuk `ActionMenu`.
- `UserMenu` hanya di ≥1024 px; di bawah itu fungsinya ada di sheet "Lainnya".

**Hamburger untuk anonim `[DEFAULT]` (M-02)**

- Anonim tidak punya `BottomNav`. `TopBar`: `[logo + nama (truncate)] [Menu] [Masuk]`. "Menu" membuka `sheet` berisi tautan halaman yang terlihat.
- Bila hanya satu halaman terlihat (default: Beranda dan Kelas saja bisa tetap muat), jangan render "Menu" kosong: bila ≤1 tautan selain halaman sekarang, tampilkan "Masuk" saja.
- Hamburger **tidak** dipakai untuk pengguna login (sudah ada `BottomNav`); dua pola navigasi paralel membingungkan.

**`SettingsSwitcher` (M-06) `[DEFAULT]`**

- Di <1024 px, header halaman pengaturan menampilkan tombol lebar penuh berisi nama sub-halaman aktif + chevron ("Pengaturan · Visibilitas ⌄"). Menekannya membuka `sheet` berisi daftar sub-halaman yang diizinkan permission (Profil, Akun, Kelas, Tema, Visibilitas, Anggota). Item aktif bertanda `aria-current`.
- Di ≥1024 px: kolom sub-navigasi kiri (`--settings-nav-w`) di dalam layout pengaturan.
- Satu komponen daftar, dua penempatan (sheet vs kolom), dipilih CSS. Route dan redirect tidak berubah.

**`AnchorNav` untuk halaman panjang `[DEFAULT]`**

- Halaman satu-form panjang (`/settings/profile`, `/settings/visibility`) memakai deretan chip tautan `#anchor` yang menempel di bawah `TopBar` (gulir horizontal dengan item berikutnya terlihat sebagian sebagai penanda masih ada). `scroll-margin-top` pada setiap section. Di desktop deretan ini menjadi daftar vertikal di kolom kiri/sticky.
- Tanpa JavaScript (tautan anchor native). Bukan `Disclosure` bertumpuk: menyembunyikan isi form di balik akordeon menyulitkan menyimpan dan menimbulkan perbedaan perilaku desktop.

### 4.2 Overlay

Semua overlay modal memakai `<dialog>` native (`showModal()`), satu komponen `Dialog` dengan prop `variant` (`DESIGN.md` §9: varian, bukan komponen baru).

| Varian | Dipakai untuk | Phone (<768) | ≥768 |
|---|---|---|---|
| `sheet` | `ActionMenu`, filter, picker, form pendek (≤3 field, mis. tambah anggota), sheet "Lainnya"/"Menu"/`SettingsSwitcher`, pratinjau tema | Menempel di bawah, lebar penuh, sudut atas `--radius-lg`, tinggi maks `--sheet-max-h`, isi menggulir di dalam | Dialog di tengah, lebar maks 32rem |
| `confirm` | `ConfirmDialog` | Kartu ringkas di tengah, tombol bertumpuk lebar penuh | Dialog tengah, tombol sebaris |
| `fullscreen` | Hampir tidak pernah. Pekerjaan >3 field seharusnya route mode fokus | Memenuhi layar dengan `TopBar` sendiri | Dialog tengah |

Aturan `[HARD]`:

- **Satu lapis overlay.** Dari sheet, aksi yang butuh konfirmasi menutup sheet dahulu lalu membuka `confirm`; fokus kembali ke pemicu semula bila dibatalkan.
- Penutupan selalu punya tombol "Tutup" bernama aksesibel, Esc, dan fokus kembali ke pemicu. **Tidak ada swipe-to-dismiss** (tidak boleh menjadi satu-satunya jalan; tanpa library gestur) dan karena itu tidak ada "handle" bergaya geser yang menjanjikan interaksi yang tidak ada.
- Klik backdrop menutup overlay informasional. Overlay yang menampilkan data sekali tampil (`AccessLinkDialog`, tautan akses) atau form yang sudah diisi **tidak** menutup lewat backdrop.
- `confirm` destruktif: fokus awal di "Batal", tombol aksi menyebut konsekuensi ("Hapus anggota"), aksi konsekuensial di atas dan "Batal" di bawah saat bertumpuk.
- Kunci gulir halaman belakang: `body:has(dialog[open]) { overflow: hidden }`.
- Uji tombol kembali Android pada `<dialog>` modal di perangkat nyata; jangan menambahkan manipulasi `history` bila tidak perlu.
- Tidak ada tooltip. Informasi pendukung ditulis sebagai teks bantuan atau di dalam `Disclosure`; alasan sebuah tombol nonaktif ditulis di bawahnya.

**`ActionMenu` (dropdown ↔ sheet) `[DEFAULT]`**

- Satu markup: tombol pemicu (`aria-expanded`, nama aksesibel, 44×44 px) + daftar tombol/tautan di dalam elemen `popover`. Phone: tampil sebagai sheet (`dialog.sheet` atau popover dengan gaya sheet + backdrop). ≥768: dropdown berlabuh di bawah pemicu. CSS yang memilih, bukan JS.
- Konfirmasi dukungan Popover API dan (bila dipakai) CSS anchor positioning pada daftar browser proyek; bila belum aman, pakai `position: absolute` di bawah pembungkus `relative` sebagai fallback sederhana.
- Pola disclosure (bukan `role="menu"`): Esc menutup, Tab bergerak normal. Item ≥48 px tinggi. Item destruktif dipisah garis, di paling bawah, dengan ikon + teks.

### 4.3 Aksi utama: tempatnya

| Situasi | Pola |
|---|---|
| Daftar yang fungsi utamanya "tambah" bagi pemegang permission (Event, Tugas, Jadwal, anggota di `/settings/members`) | `Fab` berlabel di <1024 px; tombol di `PageHeader` di ≥1024 px |
| Halaman form (buat/ubah) | `StickyActionBar` `[Batal] [Simpan]` |
| Detail dengan aksi status (mis. "Tandai selesai") | `StickyActionBar` bagi yang berhak |
| Tambah item di section profil (portofolio, social) | Tombol teks di header section (44 px) |
| Edit / hapus di halaman detail | "Edit" di slot kanan `TopBar`, sisanya `ActionMenu` |

**`Fab` `[HARD]` untuk aturan, `[DEFAULT]` untuk bentuk**

- Maksimal satu per layar. Hanya untuk aksi "buat baru". Berbentuk **extended** (ikon + teks, mis. "Buat event"): FAB ikon-saja ambigu.
- Hanya dirender untuk yang berhak (bukan disabled). Tidak muncul di mode fokus. Tidak pernah bersamaan dengan `StickyActionBar`.
- Berada di kanan bawah, di atas `BottomNav` + safe-area. Halaman yang punya FAB memberi `padding-bottom` tambahan agar item terakhir tetap terjangkau.
- Tanpa animasi muncul/hilang. Tombol yang sama di `PageHeader` disembunyikan di <1024 px (dan FAB di ≥1024 px) agar tidak ada dua tombol bernama sama.

**`StickyActionBar`** `[DEFAULT]`

- Ditempel di dasar **konten form** (`position: sticky; bottom: 0` di dalam kontainer form), bukan `fixed` ke viewport: perilakunya lebih stabil saat keyboard layar muncul (khususnya iOS).
- Latar `surface` + garis atas (token), `padding-bottom` safe-area. Tombol primer lebar penuh bila hanya satu, sepasang sama lebar bila dua.

### 4.4 Daftar dan tabel

- **Daftar entitas** (anggota, tugas, event, antrean permintaan): satu DOM `<ul>` berisi baris. Di ≥1024 px baris menjadi grid berkolom lewat CSS; baris judul kolom bersifat visual (`aria-hidden`) dan tiap sel membawa label teks tersembunyi (`VisuallyHidden`: "Status: …") agar tetap terbaca. Tidak ada tabel + daftar ganda.
- **Tabel pembanding** (≥4 kolom yang memang dibandingkan antar baris): tetap `<table>` sungguhan di dalam kontainer `overflow-x-auto`, kolom pertama sticky, tepi kanan diberi penanda ada konten lagi. Tidak ada tabel yang membuat `<body>` menggulir horizontal.
- **Anatomi baris phone**: baris 1 = judul (maks 2 baris) + status (ikon + teks); baris 2 = metadata utama (waktu, mata kuliah, tenggat); baris 3 opsional. Seluruh baris adalah target sentuh (tautan). Aksi sekunder lewat `ActionMenu` "⋯" (44×44). Tinggi minimal 3.5rem. Pemisah garis, bukan kartu (blueprint §17.3).
- Kartu hanya untuk event bercover dan grid anggota.
- Teks pengguna panjang: `min-w-0` pada anak flex/grid, `overflow-wrap: anywhere` untuk URL dan kata panjang. Pemotongan (`line-clamp`) **hanya** untuk judul; waktu, tenggat, dan status tidak pernah dipotong.

### 4.5 Form dan mode fokus

- **Mode fokus (M-04)** untuk `/…/new`, `/…/[id]/edit`, `/set-password`, onboarding: grup route (mis. `(app)/(focus)`) dengan layout yang memasang `TopBar` mode *pushed*, tanpa `BottomNav`, dan form dengan `StickyActionBar`. URL tidak berubah (grup route tidak masuk path). Di desktop layout yang sama tetap memakai sidebar; hanya penempatan footer yang menyesuaikan.
- Satu kolom, label di atas, `fieldset/legend` untuk grup. Ukuran font input ≥ 1rem (di bawah itu iOS memperbesar layar saat fokus).
- Atribut keyboard yang benar: `type="email"`, `inputmode`, `autocomplete` (`username`, `current-password`, `new-password`), `enterkeyhint`. `datetime-local`, `date`, `time`, `select`, dan `input type=color` memakai pemilih native OS; jangan membuat pemilih kustom.
- Saat validasi gagal: ringkasan `role="alert"` di atas form, gulir ke sana, fokus ke field invalid pertama. Isi input dipertahankan (blueprint §15).
- Tombol "Simpan" nonaktif selama kirim atau upload berjalan (`aria-busy`), tanpa mengubah lebarnya.
- Form >8 field atau lintas topik dipecah dengan `AnchorNav` (§4.1), bukan akordeon.

### 4.6 Filter, tab, dan pemilih

| Kebutuhan | Pola |
|---|---|
| 2–4 pilihan yang saling eksklusif dan sering dipakai (`?when=`, `?status=`) | `SegmentedControl` lebar penuh sebagai link (state di URL), tiap segmen ≥44 px |
| 7 pilihan setara (hari Sen–Min) | `TabStrip` 7 kolom sama lebar tanpa jarak antar-tab. Dengan padding halaman 16 px, 328 px / 7 ≈ 46,8 px per tab ≥ 44 px |
| Daftar pilihan panjang atau banyak filter | Tombol "Filter" membuka `sheet`; jumlah filter aktif ditulis di tombol ("Filter · 2") |
| Pilihan tunggal dalam form | `<select>` native |
| Lebih dari yang muat di satu baris | Gulir horizontal **dengan item berikutnya terlihat sebagian**; jangan menyembunyikan scrollbar tanpa penanda lain |

### 4.7 Hierarki dan pengungkapan bertahap

- Pertanyaan pertama pengguna ponsel: "apa yang perlu aku tahu sekarang?" Letakkan jawabannya di layar pertama; sisanya di bawah atau di balik kontrol.
- Konten sekunder diringkas dengan `Disclosure` ("Selengkapnya", "Aktivitas 4 minggu") atau tombol "Lihat semua". Prosa dalam chrome UI maksimal tiga baris (`DESIGN.md` §5).
- Hero identitas di mobile lebih ringkas: cover dipotong ke rasio lebih tinggi (mis. 3:2 menggantikan 16:9), deskripsi dibatasi 3 baris + "Selengkapnya". Hero tetap elemen dominan layar (blueprint §11.6).
- Urutan section di mobile mengikuti prioritas PRD dan mengabaikan layout preset (blueprint §18).
- Setiap layar tetap punya satu jangkar visual non-teks (avatar, ikon status, cover, grafik).

### 4.8 Sentuh, viewport, dan keyboard

- Target sentuh ≥44×44 px (`min-h-11 min-w-11`) dengan jarak ≥8 px antar target yang bersebelahan. Area ketuk baris = seluruh baris.
- Gaya hover hanya di dalam `@media (hover: hover)` (varian `hover:` Tailwind v4 sudah begitu; konfirmasi versi terpasang). Umpan balik tekan lewat `:active`.
- `touch-action: manipulation` pada kontrol interaktif; warna sorotan ketuk dari token.
- Tinggi viewport pakai `dvh`/`svh`, **bukan** `vh`. `viewport-fit=cover` + padding `env(safe-area-inset-*)` untuk bar bawah dan `StickyActionBar`.
- `themeColor` pada viewport Next boleh diturunkan dari `theme.palette.background` yang sudah tervalidasi hex, sehingga bilah browser mengikuti tema kelas.
- Satu kontainer gulir utama (halaman). Gulir bersarang hanya untuk strip horizontal dan tabel pembanding.
- Teks dan layout tetap utuh pada font sistem besar dan zoom 200% (tanpa tinggi tetap pada teks; label bar boleh membungkus).
- Tidak ada pull-to-refresh buatan, infinite scroll, atau bar yang bersembunyi saat menggulir.

### 4.9 Gerak

Hanya gerak fungsional (blueprint §11.4), ditambah:

| Dari → Ke | Trigger | Properti | Durasi | Easing |
|---|---|---|---|---|
| Sheet: tertutup → terbuka (phone) | `showModal()` | translateY(100% → 0), backdrop opacity | 200 ms | ease-out |
| Sheet: terbuka → tertutup | close | opacity | 120 ms | ease-in |
| `ActionMenu` dropdown (≥768) | klik | opacity | 120 ms | ease-out |
| `Fab`, `BottomNav`, `StickyActionBar` | — | tidak ada animasi | 0 ms | — |

`prefers-reduced-motion: reduce` → semua 0 ms.

---

## 5. Resep per halaman

Kolom Desktop merangkum yang **dipertahankan** dari blueprint; perubahan hanya di kolom Phone dan Tablet.

| Halaman | Phone (<768) | Tablet (768–1023) | Desktop (≥1024) |
|---|---|---|---|
| **Beranda** | Hero ringkas → strip "Berikutnya" (jadwal dan tugas terdekat) → daftar jadwal/tugas/event (maks 5 tiap daftar, "Lihat semua") → anggota (baris avatar gulir horizontal, maks 12, ujungnya terlihat sebagian) → ringkasan 2×2 → aktivitas di balik `Disclosure` | Grid 2 kolom untuk daftar | Sesuai blueprint §16 (tiga daftar bersekat berdampingan) |
| **Jadwal** | `TabStrip` hari (Sen–Min, default hari ini menurut timezone kelas) + `select` semester; baris jadwal per hari diurut jam; `Fab` "Tambah jadwal" bagi pengelola | Daftar dua kolom per hari | Tampilan per hari berdampingan sesuai model data terkini |
| **Event** | `SegmentedControl` Mendatang/Lalu; kartu bertumpuk dengan cover di atas; `Fab` | Grid 2 kolom | Grid 2–3 kolom, tombol di `PageHeader` |
| **Detail event** | Cover, daftar meta berikon (waktu, lokasi, penyelenggara), deskripsi, tautan sebagai tombol lebar penuh; "Edit" di `TopBar`, hapus di `ActionMenu` | Dua kolom: cover+meta / deskripsi | Sesuai blueprint |
| **Tugas** | `SegmentedControl` Aktif/Selesai/Arsip; baris: mata kuliah + judul + tenggat + badge; detail memakai `StickyActionBar` "Tandai selesai" (pengelola) | Daftar penuh | Kolom: mata kuliah · judul · tenggat · status |
| **Anggota** | Grid 2 kolom, avatar besar, nama maks 2 baris | 3 kolom | 4 kolom |
| **Profil anggota** | Header bertumpuk, `AnchorNav` (Portofolio · Social), social link sebagai chip ≥44 px, portofolio sebagai baris dengan deskripsi di `Disclosure` | Header samping + isi | Header samping + dua kolom isi |
| **/settings/profile** | `SettingsSwitcher` + `AnchorNav` section; `AudienceSelect` (native `select`) di bawah label tiap field; badge audience efektif memakai ikon + teks | Satu kolom ≤40rem | Kolom sub-nav + isi |
| **/settings/members** | Daftar baris: avatar, nama (+username), status, role. Ketuk baris membuka `sheet` "Kelola anggota" (email di kepala sheet, aksi: edit, ubah role, tautan akses, nonaktifkan; **hapus** terpisah di bawah dengan `confirm`). `Fab` "Tambah anggota". Antrean permintaan ganti kata sandi sebagai bagian di atas dengan lencana jumlah | Tabel ringkas | Tabel penuh dengan kolom email |
| **/settings/visibility** | `AnchorNav` per grup; tiap key = label, ringkasan nilai efektif + catatan pembatas, lalu `select` di bawahnya; satu `StickyActionBar` "Simpan grup" per form grup | Satu kolom | Daftar datar dua kolom (label / select), tombol Simpan per grup |
| **/settings/theme** | Bagian-bagian terkelompok (Layout & font · Warna utama · Teks & latar · Status), tiap warna = `input type=color` + hex bertumpuk; `StickyActionBar` `[Pratinjau] [Publikasikan]` (Pratinjau membuka `sheet` berisi `PalettePreview` + `ContrastReport`; Publikasikan nonaktif selama ada pasangan gagal, dengan alasan tertulis) | Pratinjau di atas | Dua kolom, pratinjau sticky di kanan |
| **/settings/class** | Form satu kolom; upload gambar dengan pratinjau; link kelas sebagai baris dengan `ActionMenu` | Satu kolom | Dua kolom |
| **Auth** (`/login`, `/auth/confirm`, `/set-password`) | Tanpa `TopBar` navigasi dan `BottomNav`; header ringkas (logo + nama kelas), satu kartu penuh lebar, tombol primer lebar penuh, atribut `autocomplete` benar untuk pengelola kata sandi | Kartu ≤28rem di tengah | Layout terpisah sesuai `DESIGN.md` (Appendix D) |
| **Konten panjang** (mis. Eclipse Knowledge: pembaca dan editor Markdown) | Pembaca: satu kolom 60–75 karakter, daftar isi di `Disclosure` atas, filter di `sheet`. Editor: tab **Tulis \| Pratinjau**, toolbar gulir horizontal dengan target 44 px, `StickyActionBar` | Tab atau dua panel jika muat | Tulis dan pratinjau berdampingan, daftar isi sticky di samping |

---

## 6. Token, CSS, dan komponen tambahan

**Token statis tambahan** (`styles/globals.css`, dipetakan lewat `@theme`; tidak ada nilai arbitrer di komponen):

```css
:root {
  --bar-top-h: 3.5rem;
  --bottom-nav-h: 4rem;       /* dipakai sebagai min-height, ditambah safe-area */
  --fab-h: 3.5rem;
  --sheet-max-h: 85dvh;
  --settings-nav-w: 14rem;
  --z-fab: 20;
}
```

**Utilitas bernama** (agar `check-tokens.mjs` tidak perlu mengizinkan `[...]` arbitrer; tambahkan nama ini ke daftar yang diizinkan):

```css
@utility pb-safe { padding-bottom: env(safe-area-inset-bottom); }
@utility pb-bottom-nav { padding-bottom: calc(var(--bottom-nav-h) + env(safe-area-inset-bottom)); }
@utility pb-bottom-nav-fab { padding-bottom: calc(var(--bottom-nav-h) + var(--fab-h) + var(--space-5) + env(safe-area-inset-bottom)); }
```

**Gaya dasar mobile** (lapisan base):

```css
body:has(dialog[open]) { overflow: hidden; }
a, button, summary, input, select, textarea { touch-action: manipulation; }
input, select, textarea { font-size: 1rem; }

dialog.sheet {
  margin: auto 0 0; width: 100%; max-width: none; max-height: var(--sheet-max-h);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: env(safe-area-inset-bottom); overflow-y: auto;
}
@media (min-width: 48rem) {
  dialog.sheet { margin: auto; width: min(32rem, 100%); border-radius: var(--radius-lg); }
}
```

Sintaks `@utility`/`@theme` mengikuti Tailwind terpasang; konfirmasi sebelum memakai.

**Komponen baru atau diperluas** (semuanya menyusun primitive yang ada; tidak ada dependensi):

| Komponen | Lapisan | Catatan |
|---|---|---|
| `Dialog` (varian `sheet`/`confirm`/`fullscreen`) | `components/ui` | Perluas yang ada; bukan komponen baru |
| `ActionMenu` | `components/ui` | Atribut `popover`, lihat §4.2 |
| `Fab`, `FabLink` | `components/ui` | `label` wajib; `lg:hidden` |
| `StickyActionBar` | `components/ui` | Di dalam kontainer form |
| `SegmentedControl`, `TabStrip` | `components/ui` | Berbasis tautan/URL bila mengubah data; `aria-current` |
| `AnchorNav`, `BackLink` | `components/ui` | `BackLink` memakai `href` |
| `MoreSheet`, `MenuSheet` (anonim), `SettingsSwitcher` | `components/layout` | Memakai `Dialog variant="sheet"` |
| `splitNav` | `features/nav` | Fungsi murni + tes unit |

Galeri `/dev/ui` diperluas: tiap varian `Dialog`, `ActionMenu` (tertutup/terbuka), `Fab` (dengan dan tanpa `BottomNav`), `StickyActionBar`, `SegmentedControl`, `TabStrip`, dan `BottomNav` dengan 3, 4, dan 5 destinasi.

---

## 7. Yang sengaja tidak dibuat

Swipe-to-dismiss dan gestur geser lainnya, pull-to-refresh, bar yang bersembunyi saat menggulir, bottom sheet yang bisa ditarik ke ukuran bertahap, FAB ikon-saja atau FAB dengan sub-aksi, drawer samping untuk pengguna login, pemilih tanggal/warna kustom, PWA/mode offline, guard navigasi untuk perubahan belum tersimpan (isi form tetap dipertahankan saat error), tooltip, infinite scroll, library komponen pihak ketiga.

---

## 8. Kompatibilitas gaya

Dokumen ini tidak mengunci warna, font, atau dekorasi. Bar, sheet, FAB, dan baris hanya memakai token. Mengganti gaya cukup mengganti nilai token dan lapisan dekorasi:

| Gaya | Penyesuaian pada komponen mobile |
|---|---|
| Default Eclipse (`DESIGN.md` / theme kelas) | Seperti di atas; bar `elevation low`, sheet `elevation medium` |
| Neo-brutalism | Bar dan sheet memakai border hitam tebal dan bayangan offset keras (bukan blur); tombol aktif "menekan" ke bayangan (`translate` 0 ms–150 ms). `Fab` ber-border tebal. Tanpa `backdrop-blur`. Gerak tetap ≤150 ms |
| Arsip / art deco | Bar dan sheet bergaris ganda tipis (brass), tanpa blur kaca; indikator aktif berupa garis tipis + penanda berlian; gerak lebih lambat boleh, tetapi tetap hormati `prefers-reduced-motion` dan target 44 px |

Dekorasi (grain overlay, ornamen sudut) tidak boleh mengurangi area sentuh, menutup konten, atau menurunkan kontras di bar bawah.

---

## 9. Acceptance criteria `AC-MOBILE`

1. Pada 360, 390, 412, 768 px tidak ada overflow horizontal di `<body>` pada setiap halaman utama (tabel pembanding menggulir di dalam kontainernya).
2. Phone dan tablet login: `BottomNav` tampil dengan 4 destinasi + "Lainnya" (atau lebih sedikit bila destinasi terlihat <4); item sesuai `canShow`; tidak ada item yang tidak boleh dilihat viewer.
3. Anonim: tidak ada `BottomNav`; "Menu" hanya muncul bila ≥2 tautan layak; "Masuk" selalu tampil.
4. Desktop ≥1024: `SidebarNav` tampil; `BottomNav`, `Fab`, dan "Menu" tidak ada di pohon aksesibilitas (`display: none`).
5. Semua target interaktif ≥44×44 px di phone/tablet (diperiksa otomatis lewat bounding box).
6. Elemen terakhir setiap halaman dapat digulir ke area terlihat dan tidak tertutup `BottomNav`/`Fab`/`StickyActionBar`.
7. Mode fokus: tanpa `BottomNav`; `StickyActionBar` terlihat; setelah error validasi isi input terjaga dan fokus ke field invalid pertama.
8. Sheet: Esc menutup, fokus kembali ke pemicu, Tab terperangkap di dalam, gulir halaman belakang terkunci; `AccessLinkDialog` tidak menutup lewat klik backdrop.
9. Tidak pernah ada lebih dari satu overlay modal terbuka; aksi dari sheet yang butuh konfirmasi menutup sheet dahulu.
10. `Fab` hanya ada untuk pemegang permission, satu per layar, tidak ada tombol aksi yang sama di `PageHeader` pada lebar yang sama.
11. `BackLink` mengarah ke induk yang benar saat halaman dibuka langsung (tanpa riwayat).
12. Tidak ada informasi atau aksi yang hanya tersedia lewat hover, tooltip, atau gestur.
13. Zoom 200% / font sistem besar: label `BottomNav` tidak terpotong, tidak ada tumpang tindih.
14. `prefers-reduced-motion` menghilangkan animasi sheet dan dropdown.
15. Fungsi `splitNav` lulus tes unit untuk 0–6 destinasi terlihat dan urutan prioritas.
16. Regresi desktop: pada 1280 px struktur layout (sidebar, kolom, aksi `PageHeader`) sama seperti sebelum perubahan mobile.

### Pengujian

- **Playwright**: tambahkan project perangkat (mis. 360×640, 390×844, 412×915, 768×1024, lanskap 844×390) dengan `isMobile` dan `hasTouch`. Cek overflow, ukuran target, keterjangkauan elemen terakhir (`elementFromPoint`), alur sheet (buka, Esc, fokus kembali), dan mode fokus. `@axe-core/playwright` bila sudah terpasang.
- **Tes unit**: `splitNav`, dan aturan pemilihan `SegmentedControl`/`TabStrip` dari URL.
- **Manual di perangkat nyata** (dicatat di `docs/STATUS.md`): iOS Safari dan Android Chrome untuk keyboard layar, safe-area, bilah browser dinamis, tombol kembali Android pada dialog, dan pemilih native. Emulasi Playwright **tidak membuktikan** perilaku ini; laporan harus menyebutnya sebagai belum diverifikasi bila tidak dijalankan.

---

## 10. Checklist selesai (tambahan `DESIGN.md` §13 dan blueprint §27)

- [ ] Setiap layar punya komposisi mobile yang dirancang (bukan hanya satu kolom) dan komposisi desktop tidak berubah.
- [ ] Navigasi sesuai §4.1; tidak ada dua pola navigasi paralel untuk pengguna yang sama.
- [ ] Aksi utama berada di zona jempol; aksi destruktif terpisah dan terkonfirmasi.
- [ ] Overlay memakai varian `Dialog` yang benar, satu lapis, dengan jalan keluar tampak.
- [ ] Tidak ada nilai arbitrer baru di komponen; `check-tokens` hijau; tidak ada dependensi baru.
- [ ] `AC-MOBILE-01…16` lulus; yang tidak bisa diverifikasi otomatis tercatat di `docs/STATUS.md`.
- [ ] Kontras, fokus, dan target sentuh tetap memenuhi lantai aksesibilitas pada semua gaya yang dipakai.
