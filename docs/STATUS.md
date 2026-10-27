# STATUS

Dokumen ini mencatat keadaan yang BENAR-BENAR terverifikasi, bukan rencana. Aturan pengembangan ada di `AGENTS.md`, aturan tampilan di `DESIGN.md` (v2), spesifikasi produk di `blueprint.md`.

## Ringkasan

Semua halaman, alur akun, CRUD, pengaturan, tema, Storage, dan **Eclipse Knowledge** yang dirancang sudah ada. Pada sesi ini dependensi sudah terpasang, sehingga `typecheck`, tes unit, pemeriksaan token, dan `next build` benar-benar dijalankan dan hijau. Migrasi 0014 sudah diterapkan ke proyek Supabase terhubung (`udlxcngowgbydlxhofdl`) lewat `npx supabase db push`, dan keempat berkas pgTAP dijalankan pada PostgreSQL 17.11 proyek itu dengan pgTAP 1.3.3 asli: **199/199 lulus** (001 18, 002 36, 003 40, 004 105) setelah data instance dinetralkan di dalam transaksi yang di-`rollback`. **Yang belum terjadi:** RLS/RPC Knowledge diuji lewat PostgREST dengan JWT pengguna sungguhan, `npx supabase test db` sendiri (butuh Docker), dan alur Knowledge yang butuh login (tulis/edit/kelola) diuji di browser. Jangan menganggap alur Knowledge sudah terbukti penuh sampai langkah "Sebelum deploy" hijau.

## Rilis 0.2.0

- **PWA.** `app/manifest.ts` memakai nama dan tema kelas dari DB, ikon 192/512 + maskable, service worker di `public/sw.js`, dan halaman offline statis. Service worker hanya menyimpan aset statis; dokumen berisi data anggota tidak pernah masuk cache. Pendaftaran hanya di produksi; di dev registrasi lama dicabut.
- **Daftar bernomor.** Toolbar melanjutkan nomor item sebelumnya (termasuk indentasi), dan Enter pada item bernomor menambahkan nomor berikutnya; Enter pada item kosong mengakhiri daftar.
- **Animasi gulir.** `components/scroll-reveal.tsx` memberi kelas `reveal`/`reveal--in` pada kartu dan baris saat masuk viewport. Konten yang dialirkan setelah layout ikut dipindai lewat `MutationObserver`. Preferensi `prefers-reduced-motion` dimatikan lewat CSS.
- **Sheet "Lainnya".** Bagian atas dapat digeser ke bawah untuk menutup (ambang 96px atau gestur cepat), selain tombol tutup dan backdrop. Gerakan memakai kelas `[data-drag]`, bukan atribut style, karena CSP menolak style inline.
- **Portofolio terpisah.** Pengelolaan portofolio pindah ke `/settings/portfolio`; halaman profil hanya menampilkan tombol ke halaman itu. Pintasan **Portofolio saya** ada di sidebar/menu "Lainnya" dan sub-navigasi Pengaturan.
- **Hero profil anggota.** Role dan nama panggilan dipindah ke area berwarna di kanan foto, sehingga nama lengkap mendapat baris sendiri di bawahnya.

## Isi aplikasi

Manajer paket: **npm** (`package-lock.json`). Node 22 (`.nvmrc`); runtime sesi ini: Next 16.4.2, TypeScript 5.9.3, Vitest 3.2.7.

Rute (40 halaman + 1 route handler + manifest):

| Kelompok | Rute |
|---|---|
| Publik/auth `(auth)` | `/login`, `/forgot-password`, `/set-password`, `/auth/confirm` |
| Aplikasi `(app)` | `/` (Beranda), `/class`, `/schedule` (+ `new`, `[id]/edit`), `/events` (+ `new`, `[id]`, `[id]/edit`), `/tasks` (+ `new`, `[id]`, `[id]/edit`), `/members`, `/members/[username]` |
| Knowledge `(app)/knowledge` | `/knowledge` (penjelajah publik), `/knowledge/[slug]`, `/knowledge/new`, `/knowledge/[slug]/edit`, `/knowledge/[slug]/request-edit`, `/knowledge/manage`, `/knowledge/manage/requests` |
| Pengaturan `(app)/settings` | `profile`, `portfolio`, `portfolio/new`, `portfolio/[id]/edit`, `account`, `class`, `visibility`, `theme`, `members`, `members/[id]`, `social/new`, `social/[id]/edit`; `/settings` hanya mengalihkan ke `/settings/profile` |
| Lain-lain | `/api/health` (cron harian, Bearer `CRON_SECRET`), `/dev/ui` (galeri state; `notFound()` saat `NODE_ENV=production`) |

Database: migrasi **0001–0014** (`supabase/migrations`), seluruhnya sudah diterapkan di proyek Supabase `udlxcngowgbydlxhofdl`. Tes DB yang ada: `supabase/tests/001_visibility`, `002_actions`, `003_storage`, dan `004_knowledge` — total 199 pemeriksaan (18 + 36 + 40 + 105).

## Eclipse Knowledge

- **Akses publik.** `/knowledge` (penjelajah) dan `/knowledge/[slug]` dapat dibuka tanpa login selama `page.knowledge` publik. Halaman tulis/edit/kelola berada di path terpisah (`/knowledge/new`, `/knowledge/[slug]/edit`, `/knowledge/manage`) dan selalu memeriksa sesi serta keanggotaan aktif di server.
- **Model data (0014).** `knowledge_entries` (isi Markdown saat ini, slug stabil, status, visibilitas, `version` untuk concurrency, anotasi `highlights`), `knowledge_entry_tags`, `knowledge_edit_requests`, `knowledge_editors`, dan `knowledge_audit`. Tidak ada arsip revisi penuh; highlights hanya untuk suntingan terakhir.
- **Visibilitas entri** terpisah dari Dynamic Visibility umum: `public`, `unlisted`, `class_only`, `private`. `page.knowledge` ditambahkan ke katalog visibility sebagai langit-langit publik; default `public`.
- **Otorisasi.** RLS + helper `app.knowledge_can_read`/`app.knowledge_can_edit` + trigger guard. Penulis dan editor bisa menulis isi; Ketua hanya bisa mengubah visibilitas (tidak otomatis mendapat hak menulis). Persetujuan Ketua atas eskalasi memberi akses sementara 7 hari; persetujuan penulis berkelanjutan sampai dicabut.
- **Alur.** Permintaan edit (alasan 5–500 karakter) → penulis menyetujui/menolak → pemohon dapat meneruskan ke Ketua. Semua keputusan dan perubahan visibilitas dicatat di `knowledge_audit` tanpa snapshot isi. Status tampilan `kedaluwarsa` diturunkan dari `expires_at` izin editor; tidak ada job yang menulis ulang status permintaan di DB.
- **Navigasi.** Anggota aktif melihat tautan **Kelola pengetahuan** di sidebar/menu, terpisah dari tautan penjelajah publik. Halaman tulis/edit/kelola tidak pernah memakai URL `/knowledge` itu sendiri.
- **Notifikasi.** Jumlah permintaan yang menunggu tindakan pengguna (permintaan penulis + eskalasi bila Ketua) tampil sebagai penanda pada tautan **Kelola pengetahuan**. Angkanya dihitung dari `knowledge_edit_requests` di layout aplikasi; bila hitungan gagal, navigasi tetap tampil tanpa penanda.
- **Markdown.** Parser/renderer internal di `src/lib/knowledge/markdown.ts` + `src/components/markdown.tsx`. Tidak ada HTML mentah, tidak ada `dangerouslySetInnerHTML`; tautan dan gambar hanya `https`. Mendukung judul h2–h6, tebal/miring/gabungan, coret, kode inline, blok kode + tombol salin, tautan (dengan judul opsional), gambar, daftar berpoin/bernomor/bertingkat/checklist, kutipan bertingkat, tabel dengan perataan kolom, garis pemisah, karakter escape, baris baru, dan URL telanjang. Toolbar menyediakan tombol untuk semua fitur tersebut plus panduan sintaks; pintasan teks: Ctrl/⌘+B, I, E, K, Shift+X, Shift+7/8/9, Shift+., Alt+1/2/3, dan Alt+C. Teks terpilih dibungkus otomatis dan perintah yang sama melepasnya.
- **Penanda diedit.** Diff tingkat blok (LCS) di `src/lib/knowledge/diff.ts`; blok yang berubah pada simpan terakhir disorot, dapat disembunyikan pembaca, dan tidak mengubah konten tersimpan.
- **Draf lokal.** Editor menyimpan draf ke `localStorage` setelah jeda 1,5 detik, memulihkannya di perangkat yang sama, menyediakan tombol buang draf, dan memperingatkan sebelum meninggalkan halaman. Draf lokal bukan cadangan awan; UI menyatakannya.
- **Tanpa index mesin pencari.** Metadata global aplikasi `robots: noindex` (D-12) tidak diubah. Akibatnya entri `public` bisa dibaca tanpa masuk, tetapi tidak diindeks mesin pencari; ini deviasi dari blueprint Knowledge §4 yang menyebut "eligible for indexing".
- **Kategori** berupa teks bebas (satu per entri) dan daftar filternya diturunkan dari entri yang terlihat, bukan tabel kategori terkelola. Belum ada halaman moderasi terpisah; kontrol visibilitas Ketua ada di `/knowledge/manage/requests`.

## Portofolio: pratinjau tautan

- **Urutan gambar kartu:** gambar unggahan anggota → `og:image` tautan → kotak pengganti berisi origin tautan (mis. `https://www.myeclipse.my.id`). Metadata dibaca `src/lib/preview/meta.ts` (murni, diuji unit) dan diambil `src/lib/preview/server.ts` di server dengan cache data Next 24 jam (tanpa perubahan skema). Pratinjau hanya diambil untuk item yang gambarnya memang tidak tersedia — belum diunggah, atau objek Storage-nya gagal ditandatangani — jadi gambar unggahan tidak pernah tertimpa oleh pratinjau.
- **Batas pengambilan.** Hanya https tanpa kredensial di port 443, host berdomain, dan alamat hasil resolusi DNS harus publik; pengalihan diikuti manual maksimal tiga kali dengan pemeriksaan ulang setiap tujuan, badan dibaca maksimal 200 KB, timeout 4 detik, dan hanya `content-type` HTML yang diterima. Maksimal 12 tautan per render dengan 6 permintaan paralel dan anggaran waktu 5 detik per render (batch berikutnya hanya dimulai bila masih muat); kegagalan di-cache 10 menit di memori proses supaya render berikutnya tidak menunggu timeout lagi.
- **Perlakuan alamat IPv6 ULA.** Alamat `fc00::/7` diabaikan bila host juga punya IPv4 publik, karena resolver NAT64/DNS64 (umum di jaringan seluler dan sandbox pengembangan ini) memetakan host publik ke `fd00::/8`; menolaknya membuat fitur ini mati total. Literal IP internal, loopback, dan link-local tetap selalu ditolak, dan host yang hanya punya IPv6 diperiksa apa adanya. **Sisa risiko:** DNS yang dengan sengaja mengembalikan IPv4 publik bersama IPv6 internal belum tertutup.
- **Gambar di-hotlink** dari host situs sumber dengan `referrerPolicy="no-referrer"`. Konsekuensinya CSP rute terkait membuka `img-src https:` dan IP pembaca terlihat oleh host itu. Gambar bersifat dekoratif (`alt=""`); lapisan pengganti di bawahnya tetap terlihat bila host menolak hotlink.
- **Label situs** (`og:site_name`/`application-name`, jatuh ke host tautan) hanya tampil sebagai lencana di atas gambar. Tanpa gambar, kotak pengganti menampilkan origin tautan sehingga kartu tetap tidak kosong walau pengambilan gagal.
- **Daftar `/settings/portfolio`** menampilkan thumbnail (gambar unggahan sendiri, selain itu gambar pratinjau) dan label situs di baris meta. Item yang sudah punya gambar unggahan tidak menembak situs luar sama sekali.
- **Kartu di profil publik adalah tautannya sendiri.** Judul dibungkus `<a class="stretch" target="_blank" rel="noopener noreferrer">` dan lapisan `::after`-nya menutup seluruh kartu, jadi klik di area gambar maupun teks membuka tautan di tab baru tanpa tautan bersarang. Teks "Lihat karya" hanya penunjuk visual; pembaca layar mendengar "(dibuka di tab baru)". Item tanpa `url` tidak punya lapisan itu.
- **Tinggi kartu konstan.** Media tetap 16:9, judul dipangkas dua baris, deskripsi tiga baris (`.clamp-2`/`.clamp-3`), dan kartu mengisi tinggi baris grid. Teks yang terpotong memunculkan tombol **Baca selengkapnya** (`src/components/portfolio-text.tsx`) yang membuka `<dialog>` berisi teks utuh. Pengukuran di klien: kelas pangkas dilepas sesaat lalu `scrollHeight` dibaca dan kelasnya dipasang lagi, diulang saat jendela berubah ukuran. Tombol itu memakai `.above` agar tetap bisa diklik di atas lapisan tautan kartu.

## Keputusan tampilan (DESIGN.md v2) yang perlu Anda ketahui

- Sidebar ikon ≥1024px, **rel ikon 768–1023px** (bukan BottomNav), bilah atas + tab bawah <768px. Rel ikon untuk tablet menyimpang dari blueprint §16 karena DESIGN.md v2 yang menentukan; ubah di `src/components/nav.tsx` + `src/styles/shell.css` bila blueprint yang ingin diikuti.
- Beranda: tamu mendapat hero dengan deskripsi kelas, tombol **Masuk ke kelas**, panel ringkasan di dalam hero, dan pintasan ke halaman publik yang memang terlihat; anggota melihat kartu KPI setelah hero. Urutan preset `profile_focused` diterapkan di semua lebar layar. Blueprint menyebut ponsel mengabaikan preset; di sini tidak.
- Grafik tren aktivitas memakai batang HTML (kelas `.pct-N`), bukan SVG, supaya tidak butuh atribut `style` (lihat CSP).
- Tidak ada atribut `style` inline di mana pun. Sheet "Lainnya" memakai kelas `[data-drag]` agar tetap patuh CSP. **Temuan:** Chrome juga memblokir perubahan CSSOM (`element.style.setProperty`) di bawah `style-src` saat ini, sehingga pratinjau tema yang memakai cara itu belum berfungsi; perlu diperbaiki terpisah.
- Visibilitas pribadi diatur di `/settings/account` (Keamanan) bersama kata sandi dan email, bukan lagi di `/settings/profile`. Formulirnya tetap memakai RPC `save_my_visibility`; setelah simpan, pengguna kembali ke `/settings/account`.
- Form: `useActionState`, toast lewat cookie flash (`lib/flash.ts`), unggah gambar lewat `ImageForm`; hapus lewat `<dialog>` konfirmasi.
- Knowledge: layout baca dua kolom di ≥1024px (isi + TOC/aksi), editor/pratinjau berdampingan di desktop dan tab Editor/Pratinjau di layar sempit. Warna sorotan memakai token `--warning-bg`/`--warning`, jadi ikut tema terang/gelap.

## Keamanan

- `src/proxy.ts` (Next 16): CSP per-permintaan dengan nonce (`lib/security/csp.ts`), diteruskan ke layout lewat header `x-nonce`, dibangun ulang setelah refresh cookie. Baseline mengikuti blueprint §23; `unsafe-eval` dan `ws:` hanya di mode dev; `img-src` mengizinkan origin Supabase. `img-src` juga membuka `https:` hanya pada rute yang memang menampilkan gambar luar: `/knowledge*` (gambar entri Markdown), `/members/[username]`, dan `/settings/portfolio` (gambar pratinjau tautan). Halaman lain tetap ketat, dan daftar rutenya ada di `allowsHttpsImages` (`lib/security/csp.ts`, diuji unit). Konsekuensinya browser pembaca memuat gambar itu langsung dari host ketiga (IP pembaca terlihat oleh host tersebut).
- `next.config.ts`: X-Content-Type-Options, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, COOP same-origin. HSTS diserahkan ke Vercel.
- Cookie sesi Supabase diberi `httpOnly`, `sameSite=lax`, `secure` (produksi), `path=/` di `proxy.ts` dan `lib/supabase/server.ts`.
- Admin client hanya untuk Auth Admin API; semua baca/tulis konten memakai JWT pengguna di bawah RLS.
- Knowledge menegakkan akses di database: RLS pada semua tabel, RPC `security definer` dengan pemeriksaan eksplisit, trigger guard untuk kolom konten/visibilitas/status, dan grant kolom minimum. Tidak ada tabel Knowledge yang bisa ditulis langsung lewat PostgREST kecuali entri (dengan guard) — tabel permintaan/editor/audit hanya lewat RPC.
- `supabase/config.toml`: `enable_signup=false` (lokal), sandi minimal 10, OTP 24 jam, hanya schema `public` yang diekspos, batas bucket 2 MiB. **Pengaturan ini hanya berlaku lokal.** Di proyek cloud, matikan "Allow new users to sign up" dan samakan Site URL/Redirect URL di dashboard.

## Temuan penting saat verifikasi

**Migrasi 0013.** Tes `003_storage` menemukan cacat di 0007: policy SELECT juga berlaku pada DELETE ber-WHERE, sehingga objek lama logo/sampul/cover tidak pernah terhapus. 0013 menambahkan klausa baca untuk pemegang `class.manage`/`events.manage` hanya di folder yang boleh mereka tulis. `removeObject` mencatat log bila tidak ada objek terhapus.

**Migrasi 0014 sudah diuji di Supabase asli.** Migrasi diterapkan dengan `npx supabase db push` ke proyek `udlxcngowgbydlxhofdl`, lalu 001–004 dijalankan dengan pgTAP 1.3.3 pada PostgreSQL 17.11. Hasilnya 199/199 lulus (18 + 36 + 40 + 105) dengan data instance dinetralkan di dalam transaksi ber-`rollback`. `auth.uid()` yang dipakai adalah fungsi Supabase asli yang membaca `request.jwt.claims`, dan role diganti dengan `set_config('role', …)` seperti yang dilakukan pgTAP. Lingkungan ini masih **bukan** PostgREST: tidak ada permintaan HTTP ber-JWT, jadi perilaku policy terhadap klaim token sungguhan belum terbukti.

**Trigger Storage memblokir tes 003.** Di Supabase asli, `storage.objects` memiliki trigger `storage.protect_objects_delete` yang menolak setiap `DELETE` dari SQL ("Direct deletion from storage tables is not allowed"). Tabelnya milik `supabase_storage_admin` dan koneksi `postgres` bukan anggotanya, jadi trigger tidak bisa dimatikan. Fungsinya hanya membuka gerbang bila GUC `storage.allow_delete_query = 'true'`; `003_storage` sekarang menyetelnya di awal transaksi. Tanpa baris itu, berkas berhenti sebelum satu pun assertion policy DELETE berjalan.

**Halaman Knowledge di browser.** Diperiksa dengan Chrome headless terhadap dev server dan `next start`: `/knowledge` anonim merender penjelajah, pencarian, dan state kosong tanpa tautan **Kelola pengetahuan**; `/knowledge/new`, `/knowledge/manage`, dan `/knowledge/manage/requests` berakhir di `/login?next=…`; slug yang tidak ada menampilkan **Halaman tidak ditemukan** pada build produksi. Dua perilaku yang perlu diketahui saat menguji: (a) karena `(app)/loading.tsx` membuat shell dikirim lebih dulu, halaman yang memanggil `redirect()`/`notFound()` setelah itu menjawab **HTTP 200** lalu menyelesaikannya di klien — di produksi isinya benar, tetapi status HTTP bukan 307/404; (b) di dev server Next 16.4.2 (Turbopack), rute dinamis yang `notFound()` berhenti di "Memuat halaman…", sedangkan `next start` merender halaman 404 dengan benar. Rute 404 statis benar di keduanya.

**Batasan yang tersisa (D-13).** Objek Storage yang yatim tidak disapu otomatis; tidak ada job pembersih. Knowledge tidak memakai Storage.

## Hasil verifikasi (dijalankan pada sesi ini)

| Cek | Hasil | Catatan |
|---|---|---|
| `npm test` | **69/69 lulus** | Vitest 3.2.7 asli, termasuk tes parser Markdown (tabel, daftar bertingkat, checklist, kutipan bertingkat, gambar, escape, baris baru), penomoran daftar dan lanjutan Enter, penyisipan sintaks editor, tautan aman, diff blok, normalisasi tag, paritas katalog 28 kunci, dan pratinjau tautan (validasi https/host internal, parsing Open Graph, predicate rute CSP). |
| `npm run typecheck` | **0 error** | `tsc --noEmit`, strict + `noUncheckedIndexedAccess`; TypeScript 5.9.3, dependensi asli terpasang. |
| `npm run check:tokens` | bersih | Tidak ada warna hex/rgb/hsl atau nilai arbitrer di `src/components`, `src/features`, `src/app`. |
| `npm run build` | **sukses** | Next 16.4.2; 40 route halaman + `/api/health` + `/manifest.webmanifest`; semua route Knowledge terdaftar. Build tidak memanggil Supabase saat prerender karena halaman dinamis. |
| Migrasi 0014 ke Supabase | **diterapkan** | `npx supabase db push --db-url` ke `udlxcngowgbydlxhofdl` (MyEclipse): `20261023120000` masuk, `migration list` remote kini 14/14. `pgtap` 1.3.3 dipasang di schema `extensions`. |
| Tes DB 001–004 dengan pgTAP asli | **199/199 lulus** | PostgreSQL 17.11 proyek Supabase, pgTAP 1.3.3. Dijalankan dengan `npm run test:db -- --isolate` (`scripts/test-db.mjs`, driver `pg`) karena `supabase test db` menuntut Docker. Data instance dinetralkan di dalam transaksi yang selalu `rollback`; sesudahnya jumlah baris tidak berubah (1 kelas, 1 anggota, 1 profil, 1 event, 5 tugas, 1 objek Storage, 16 aturan visibility). |
| Tes DB terhadap data asli | **tidak bersih, bukan bug** | Tanpa isolasi: 001 13/18, 002 30/36, 004 104/105. Semuanya karena data/setelan asli: `page.members` dan `page.events` publik, 1 event + 1 logo + 5 tugas, dan 1 Ketua lama sehingga penjaga "pengelola terakhir" tidak menyala. 003 berhenti karena trigger Storage (lihat temuan di atas), bukan karena data. |
| `npx supabase test db` | **tetap tidak bisa di sandbox** | CLI 2.121.0: dengan `--db-url` pun perintah ini menjalankan `pg_prove` di container dan gagal `docker: command not found`. Login akun dan proyek linked sudah benar; `db push`, `db query`, dan `migration list` berjalan normal. |
| Renderer Markdown | **aman pada uji render** | `react-dom/server` dipakai untuk merender `<script>`, tabel, gambar `https`, checklist, daftar bertingkat, kutipan bertingkat, dan blok kode; keluaran meng-escape teks, tidak ada tag skrip/atribut HTML yang dieksekusi. |
| PWA | **lulus di Chrome headless** | `/manifest.webmanifest` 200 dengan ikon 192/512/maskable; `Page.getInstallabilityErrors` kosong; service worker aktif dan mengendalikan halaman; navigasi saat offline menampilkan `/offline.html`. |
| Animasi gulir | **lulus di Chrome headless** | Dengan `prefers-reduced-motion: no-preference`, elemen mendapat `.reveal`; setelah digulir ke viewport menjadi `.reveal--in` dengan opacity 1 dan transform none. |
| Sheet "Lainnya" | **lulus di Chrome headless** | Pointer sintetis: geser 44px kembali ke posisi semula; geser 130px menutup dialog. Gerakan terlihat lewat `transform` dari kelas `[data-drag]`. |
| Hero profil anggota | **lulus geometri** | Di 1280px dan 390px, kotak role/nama panggilan berada di kanan avatar tanpa tumpang tindih dan di dalam area berwarna. |
| Halaman portofolio terpisah | **hanya build + typecheck** | Rute `/settings/portfolio` terdaftar dan redirect ke login berjalan; alur login, tambah, ubah, dan hapus item belum diuji di browser. |
| Pratinjau tautan portofolio | **sebagian besar lulus** | `next start` di build produksi: `/members/ihsan` anonim memuat `media--link` dengan lencana situs `Eclipse` (dari `application-name` halaman tujuan, setelah pengalihan 308 ke `www`), `img-src` rute itu berisi `https:`, dan tidak ada baris galat di log. Skrip sementara memanggil `linkPreview` asli: GitHub dan Figma memberi judul/situs/`og:image`; `https://127.0.0.1/`, `169.254.169.254`, `http://`, URL berkredensial, port 8443, dan `localhost` semuanya `null`. Komponen diuji render lewat `react-dom/server` (gambar + lencana, placeholder tanpa lencana, thumbnail baris). HTML hasil render juga diperiksa: judul ber-`.stretch` tanpa tautan bersarang, dan kotak pengganti memuat origin tautan. Uji Chrome headless lewat CDP (lebar 220px agar teks terpotong): hidrasi tanpa galat, tombol **Baca selengkapnya** muncul, hit-test menunjuk tombol itu (bukan lapisan tautan), klik mouse nyata membuka `<dialog>` modal berisi teks utuh, **Tutup** menutupnya, dan klik di area gambar tetap mengenai tautan kartu. |
| Penanda notifikasi Knowledge | **hanya typecheck + build** | Query hitungan memakai embed `knowledge_entries!inner(author_id)` dan `head: true`; belum diuji terhadap PostgREST/RLS sungguhan. |
| PostgREST / JWT | **belum** | pgTAP berjalan sebagai `postgres` lalu berganti role dengan `set_config`; tidak ada permintaan HTTP ber-JWT. |
| Halaman Knowledge di browser | **sebagian** | Chrome headless: penjelajah anonim + state kosong, redirect ke login untuk halaman tulis/kelola, dan halaman 404 slug tidak dikenal (build produksi) berjalan. Entri berisi, editor, draf lokal, sorotan, TOC, dan salin tautan belum diuji karena DB belum punya entri. |

## BELUM terverifikasi

- Perilaku Knowledge lewat PostgREST dengan JWT pengguna sungguhan (header `Authorization`, role `authenticated` dari PostgREST, dan embed relasi `!inner`).
- `npx supabase test db` end-to-end (butuh Docker/Podman) dan tes terhadap DB yang baru di-`db reset` tanpa isolasi manual.
- Hitungan notifikasi Knowledge di bawah RLS/PostgREST (termasuk filter relasi `!inner`) dan pembaruannya setelah permintaan diputuskan.
- Alur Knowledge end-to-end di UI: buat draf → terbitkan → baca sebagai anonim → minta edit → setujui/tolak → eskalasi → persetujuan Ketua → cabut akses; termasuk upaya menembus RLS lewat PostgREST langsung.
- Konflik versi dua editor bersamaan (pesan konflik di UI), dan penanda blok setelah beberapa suntingan.
- Draf lokal pada refresh/restart browser, penyimpanan penuh/diblokir, dan peringatan sebelum meninggalkan halaman.
- Halaman entri Knowledge yang berisi: TOC, sorotan blok, aksi penulis/Ketua, dan pratinjau Markdown — DB belum punya entri, jadi rute ini baru diuji sebagai 404.
- Tampilan Markdown, sorotan, TOC, editor/pratinjau di ponsel, tablet, dan desktop; pemeriksaan aksesibilitas manual (fokus, pembaca layar).
- `npm audit` dan interaktivitas klien lain yang sudah ada sebelumnya (dialog, toast, unggah/crop gambar, pratinjau tema).
- Geser sheet dengan sentuhan jari sungguhan, animasi gulir pada perangkat nyata, dan pemasangan PWA dari prompt browser Android/iOS.
- Alur portofolio setelah login: tambah, ubah, hapus, unggah gambar, dan kembali ke `/settings/portfolio` (bukan `/settings/profile`).
- Pratinjau tautan di daftar `/settings/portfolio` (butuh login; baru typecheck + build).
- Kartu dengan `og:image` nyata di browser: item yang ada (`https://myeclipse.my.id/` dan satu item uji) tidak memuat `og:image`, jadi jalur gambar hanya terbukti lewat pengambilan langsung dan uji render komponen, bukan di halaman yang sedang berjalan.
- Tautan portofolio yang menunjuk ke host mati atau sangat lambat: perilakunya di browser belum diuji (hanya jalur `null` pada skrip pengambilan).
- Simpan visibilitas pribadi di `/settings/account` setelah login (nilai tersimpan tampil lagi di formulir, redirect, dan toast).

## Sebelum deploy (urutan)

1. `npm ci` lalu `npm audit`.
2. `npm run check:tokens && npm run typecheck && npm test`.
3. `supabase start`, `supabase db reset` (**0001–0014**), lalu `npm run test:db` (termasuk **004_knowledge**). Skrip ini memakai `POSTGRES_URL` dan tidak butuh Docker; `npx supabase test db` tetap bisa dipakai di mesin ber-Docker. Tes mengasumsikan DB kosong: pada proyek berisi data jalankan `npm run test:db -- --isolate`, yang mengosongkan data instance di dalam transaksi dan selalu `ROLLBACK`.
4. Isi `.env.local` dari `.env.example`, lalu `npm run build` dan `npm run dev`.
5. Uji alur Knowledge: entri publik tanpa login, draf/privat tidak bocor lewat URL langsung atau pencarian, hanya penulis/editor yang bisa menyimpan isi, Ketua hanya visibilitas, eskalasi disetujui 7 hari, cabut akses berlaku, dan dua tab menyimpan bersamaan memunculkan konflik.
6. Proyek cloud: `supabase db push` (**0014 harus ikut**), matikan signup, atur Site URL/Redirect URL, isi env di Vercel (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_URL`, `CRON_SECRET`).
7. `npm run bootstrap:admin` sekali (menolak jalan bila Ketua aktif sudah ada), buka tautan yang tercetak, buat kata sandi.
8. Buka tiap rute pada ponsel dan desktop; uji unggah logo, sampul, avatar, cover event; hapus salah satunya dan pastikan objek lama hilang dari bucket.

## Blueprint vs migrasi (migrasi = sumber kebenaran; blueprint belum diperbarui)

1. `schedules` (0010): `day_of_week`, `start_time`, `end_time`, `semester` (mingguan per semester) menggantikan `start_at/end_at`. Blueprint §5.3, §8.3, §10, §14.2, §19, AC-SCHEDULE masih memakai model bertanggal.
2. Halaman Schedule adalah jadwal KULIAH, terpisah dari event. V-08 (gabungan event + tenggat tugas) perlu diputuskan ulang.
3. `tasks.course` (0009): nullable di DB, wajib di Zod; baris lama tampil "Tanpa mata kuliah".
4. `password_reset_requests` (0011): antrean "lupa sandi" untuk Ketua. Insert memakai service role dari Server Action anonim (menyimpang dari blueprint §3.2); jawaban selalu generik, hanya email anggota yang dicatat, satu permintaan menunggu per email. **Belum ada limiter laju** (D-09 hanya mencakup login).
5. Typo pada komentar 0011 ("Chairs"): migrasi sudah applied, jangan diubah.
6. Pencarian email di aksi anggota memakai `listUsers` (200 pertama): cukup untuk ±20 anggota, tidak untuk kelas besar.
7. Knowledge (0014): rute memakai konvensi aplikasi (`/knowledge/new`, bukan `/knowledge/create`); kategori berupa teks bebas; persetujuan Ketua atas eskalasi berlaku 7 hari; highlights tingkat blok, bukan karakter; kategori/entri `unlisted` tidak masuk sitemap karena aplikasi memang `noindex` global.

## Catatan runbook

- Migrasi yang sudah diterapkan ke database mana pun jangan diubah; tambah migrasi baru.
- `npm run test:db` membaca `POSTGRES_URL` dari `.env.local` dan menjalankan berkas `supabase/tests/*.test.sql`. Tanpa `--isolate` tes berjalan pada data apa adanya; dengan `--isolate` data instance dikosongkan di dalam transaksi yang selalu `ROLLBACK`.
- `supabase/.temp/` tidak disertakan dan jangan di-commit (berisi referensi proyek).
- Draf Knowledge tersimpan hanya di `localStorage` perangkat/browser; keluar akun atau membersihkan data situs menghapusnya. Tidak ada sinkronisasi lintas perangkat.
