Aku mau menambah fitur: Kas Kelas (Tahap 1)

Kenapa
Aku mau kas dan iuran kelas tercatat transparan di aplikasi, sehingga Bendahara tidak perlu mencatat di tempat lain dan setiap anggota bisa melihat saldo serta status iuran miliknya. Aplikasi hanya mencatat: tidak ada pembayaran online dan tidak ada perpindahan uang. Mata uang Rupiah, bilangan bulat.

Siapa & izin (per peran)
- Pemegang izin kelola kas (bawaan: Bendahara; Ketua dapat memberikannya ke jabatan lain lewat daftar centang izin yang sudah ada): melihat dan mengelola semuanya, termasuk foto bukti dan nota.
- Ketua: melihat semuanya, tetapi tidak otomatis boleh mengubah catatan (kecuali memegang izin kelola kas).
- Anggota aktif: melihat saldo, ringkasan, dan daftar transaksi (tanpa foto bukti/nota), serta hanya status iuran miliknya sendiri. Status orang lain tidak terlihat.
- Tamu: tidak melihat apa pun tentang kas secara bawaan. Ketua dapat mengubahnya lewat pengaturan visibilitas halaman yang sudah ada.
- Foto bukti dan nota hanya terlihat oleh pengunggahnya dan pemegang izin kelola kas.

Alur utama (per peran)
Pemegang izin:
1. Membuat tagihan: nama, nominal per anggota, tenggat, dan yang dikenai (semua anggota aktif saat dibuat, atau dipilih).
2. Melihat pengajuan yang menunggu verifikasi, lalu menerima atau menolak (alasan wajib saat menolak).
3. Menandai anggota Lunas langsung tanpa pengajuan (mis. bayar tunai).
4. Mencatat pemasukan lain atau pengeluaran: tanggal, jumlah, kategori, keterangan, nota foto opsional.
5. Membatalkan catatan yang keliru dengan alasan wajib.
Anggota:
1. Membuka halaman Kas: melihat saldo, ringkasan bulanan, daftar transaksi, dan iuran miliknya.
2. Pada iuran berstatus Belum bayar, mengajukan "Sudah bayar": metode (tunai/transfer), catatan (opsional), bukti foto (opsional).
3. Bila ditolak, membaca alasan penolakan lalu boleh mengajukan lagi.
Ketua: melihat semua yang dilihat pemegang izin; mengatur jabatan pemegang izin dan visibilitas halaman Kas lewat pengaturan yang sudah ada.

Aturan & batasan
- Nominal iuran: bilangan bulat 1–100.000.000 rupiah. Nol, negatif, desimal, atau di atas batas ditolak dengan pesan jelas.
- Maksimal 24 tagihan terbuka bersamaan; tagihan ke-25 ditolak dengan pesan yang menyebut batasnya.
- Status iuran per anggota per tagihan: Belum bayar → Menunggu verifikasi → Lunas; atau Ditolak (kembali ke Belum bayar dengan alasan tetap terlihat). Tidak ada cicilan.
- Pengajuan setelah tenggat tetap boleh dan ditandai "terlambat".
- Anggota yang bergabung setelah tagihan dibuat tidak otomatis dikenai, tetapi bisa ditambahkan oleh pemegang izin.
- Iuran Lunas otomatis menjadi pemasukan kas satu kali (tidak ganda).
- Transaksi manual: tanggal, jumlah (bilangan bulat positif, batas atas sama dengan iuran), kategori, keterangan wajib maks 200 karakter.
- Catatan pengajuan anggota maks 200 karakter.
- Foto bukti/nota: hanya tipe gambar yang didukung dan ukuran maksimal yang eksplisit (usulan di Keputusan terbuka); salah tipe atau terlalu besar ditolak dengan pesan jelas.
- Pengeluaran yang membuat saldo negatif tetap diizinkan, tetapi memunculkan peringatan jelas sebelum dan sesudah disimpan.
- Catatan keuangan tidak pernah dihapus. Kesalahan dikoreksi dengan pembatalan (alasan wajib); catatan batal tetap terlihat bertanda "dibatalkan" dan tidak dihitung ke saldo.
- Pembuatan, pengajuan, verifikasi, penolakan, dan pembatalan dicatat jejaknya (siapa, kapan, apa) tanpa menyimpan isi sensitif.
- Konfirmasi sebelum tindakan yang tidak bisa dibalik, pesan sukses/gagal singkat, pesan galat berbahasa Indonesia tanpa detail internal. Data kas tertutup bagi yang tidak berhak.

Kasus tepi
- Anggota dinonaktifkan atau keluar saat punya tagihan: riwayat tetap ada, tidak ikut dihitung sebagai tunggakan aktif (lihat Keputusan terbuka).
- Dua pemegang izin memverifikasi pengajuan yang sama bersamaan: hanya satu yang berhasil, yang lain mendapat pesan bahwa status sudah berubah; pemasukan tidak tercatat dua kali.
- Anggota mengajukan dua kali pada tagihan yang sama: pengajuan kedua ditolak selama yang pertama menunggu atau sudah Lunas.
- Tagihan dibatalkan saat ada pengajuan menunggu: pengajuan ikut berhenti, anggota melihat statusnya, dan tidak ada pemasukan tercatat.
- Nominal nol, negatif, atau melebihi batas; foto salah tipe atau terlalu besar.
- Pembatalan transaksi yang berasal dari iuran Lunas: status iuran terkait dan saldo tetap konsisten.
- Anggota membuka tagihan orang lain atau bukti/nota yang bukan miliknya: ditolak tanpa membocorkan keberadaannya.

Terkait fitur yang sudah ada
- Beranda: anggota mendapat kartu ringkas berisi saldo kas dan jumlah iuran miliknya yang belum dibayar.
- Navigasi: halaman baru "Kas" bagi anggota aktif, dengan penanda jumlah pengajuan menunggu verifikasi bagi pemegang izin (pola yang sudah ada).
- Jabatan & izin: izin kelola kas masuk daftar centang jabatan yang sudah ada; bawaan untuk Bendahara.
- Visibilitas halaman: Kas ikut pengaturan siapa-boleh-melihat yang sudah ada, bawaan tertutup bagi tamu.
- Jejak tindakan, pola "menunggu persetujuan", dan penanganan unggah foto mengikuti yang sudah dipakai fitur lain.
- Periksa tumpang tindih dengan Tugas, Event, Cloud, dan Library media sebelum membuat komponen baru.
- Harus nyaman di ponsel dan mendukung tema terang/gelap.

Di luar cakupan
Pembayaran online/integrasi bank, pengingat otomatis, cicilan, banyak kas atau dompet terpisah, ekspor/unduh laporan, akses lewat Developer API, anggaran, dan persetujuan Ketua untuk pengeluaran besar.

Keputusan terbuka (beserta usulan bawaan)
- Ukuran dan tipe foto bukti/nota: usulan JPEG/PNG/WebP, maksimal 2 MB, satu foto per pengajuan atau transaksi.
- Pembatalan transaksi dari iuran Lunas: usulan iuran kembali ke Belum bayar dan pemasukannya batal sekaligus.
- Tagihan yang dibatalkan: usulan boleh dibatalkan oleh pemegang izin dengan alasan wajib; iuran yang sudah Lunas ikut dibatalkan pemasukannya.
- Anggota nonaktif: usulan tidak dihitung ke "iuran belum dibayar" di kartu Beranda, riwayat tetap tampil bagi pemegang izin.
- Daftar kategori transaksi: usulan daftar tetap sederhana (mis. Iuran, Donasi, Konsumsi, Perlengkapan, Lainnya).
- Berapa anggota yang boleh dipilih untuk tagihan: usulan sama dengan seluruh anggota aktif.
- Zona waktu tenggat dan batas bulan: usulan memakai zona waktu kelas yang sudah ada.
- Menandai "Lunas" langsung pada iuran yang sedang menunggu verifikasi: usulan diizinkan dan dianggap verifikasi diterima.

Selesai bila
1. Bendahara membuat tagihan dan setiap anggota yang dikenai melihat iuran itu berstatus Belum bayar.
2. Anggota mengajukan "Sudah bayar" dan statusnya menjadi Menunggu verifikasi; pengajuan kedua pada tagihan yang sama ditolak.
3. Pemegang izin menerima pengajuan: iuran Lunas dan tepat satu pemasukan muncul di kas dan menambah saldo.
4. Pemegang izin menolak dengan alasan: iuran kembali ke Belum bayar dan alasan terlihat oleh anggota itu.
5. Dua pemegang izin memverifikasi pengajuan yang sama bersamaan: hanya satu berhasil, saldo bertambah sekali.
6. Anggota biasa hanya melihat status iuran miliknya, tidak pernah milik orang lain, dan tidak melihat foto bukti/nota milik orang lain.
7. Tamu tidak melihat apa pun tentang kas; setelah Ketua mengubah visibilitas, tampilannya mengikuti pengaturan itu.
8. Catatan yang dibatalkan tetap tampil bertanda "dibatalkan", tidak dihitung ke saldo, dan alasan pembatalan tercatat.
9. Pengeluaran yang membuat saldo negatif tetap tersimpan dengan peringatan jelas.
10. Halaman Kas, penanda menunggu verifikasi, dan kartu Beranda terbaca dan bisa dipakai di layar ponsel dan desktop, tema terang dan gelap.

Cara kerja yang kuminta
1. Baca AGENTS.md, DESIGN.md, STATUS.md, dan blueprint.md sebelum mulai; ikuti aturannya.
2. Periksa apakah ada yang tumpang tindih dengan fitur yang sudah ada dan gunakan ulang bila ada.
3. Bila ada yang ambigu atau Keputusan terbuka perlu kupastikan, tanyakan dulu sebelum membangun.
4. Kerjakan Tahap 1 saja; jangan menambah hal di luar cakupan.
5. Di akhir, laporkan jujur mana yang sudah benar-benar terbukti diuji dan mana yang belum, lalu perbarui STATUS.md sesuai fakta itu.