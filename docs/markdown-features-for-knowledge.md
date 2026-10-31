Berikut daftar fitur Markdown, sintaks, dan cara penggunaannya dalam teks biasa. Format penjelasan ini sengaja dibuat netral, tanpa menggunakan pemformatan Markdown untuk judul, daftar, atau contoh.

DAFTAR FITUR MARKDOWN

1\. Judul (Headings)

Fungsi: Membuat judul dan subjudul dengan beberapa tingkat hierarki.

Sintaks:

# Judul tingkat 1

## Judul tingkat 2

### Judul tingkat 3

#### Judul tingkat 4

#### Judul tingkat 5

#### Judul tingkat 6

Cara penggunaan: Letakkan tanda pagar (#) di awal baris, lalu beri spasi sebelum teks judul. Semakin banyak tanda pagar, semakin rendah tingkat judulnya. Tingkat judul berkisar dari 1 sampai 6.

Contoh hasil: Judul tingkat 1, Judul tingkat 2, dan seterusnya, masing-masing dengan ukuran atau hierarki visual berbeda.

2\. Teks Tebal (Bold)

Fungsi: Memberikan penekanan kuat pada teks.

Sintaks:\
teks tebal\
teks tebal

Cara penggunaan: Apit teks dengan dua tanda bintang atau dua garis bawah.

Contoh hasil: teks tebal.

3\. Teks Miring (Italic)

Fungsi: Memberikan penekanan ringan pada teks atau menandai istilah tertentu.

Sintaks:\
teks miring\
teks miring

Cara penggunaan: Apit teks dengan satu tanda bintang atau satu garis bawah.

Contoh hasil: teks miring.

4\. Teks Tebal dan Miring

Fungsi: Menggabungkan penekanan tebal dan miring.

Sintaks:\
teks tebal dan miring\
teks tebal dan miring

Cara penggunaan: Apit teks dengan tiga tanda bintang atau tiga garis bawah.

Contoh hasil: teks tebal dan miring.

5\. Teks Dicoret (Strikethrough)

Fungsi: Menandai teks yang dibatalkan, tidak berlaku, atau sudah tidak relevan.

Sintaks:\
teks dicoret

Cara penggunaan: Letakkan dua tanda tilde di kedua sisi teks.

Contoh hasil: teks dicoret.

Catatan: Fitur ini didukung oleh GitHub Flavored Markdown (GFM), tetapi tidak termasuk sintaks inti Markdown asli.

6\. Garis Bawah (Underline)

Fungsi: Memberikan garis bawah pada teks.

Sintaks: Markdown standar tidak menyediakan sintaks khusus untuk garis bawah.

Alternatif: Beberapa platform mendukung HTML seperti , tetapi dukungannya bergantung pada aplikasi yang digunakan.

7\. Paragraf

Fungsi: Membagi tulisan menjadi beberapa paragraf.

Sintaks:\
Paragraf pertama.

Paragraf kedua.

Cara penggunaan: Pisahkan dua paragraf dengan satu baris kosong. Baris baru biasa di dalam satu paragraf dapat ditampilkan sebagai spasi, bergantung pada pemroses Markdown.

8\. Baris Baru (Line Break)

Fungsi: Memulai baris baru tanpa memulai paragraf baru.

Sintaks alternatif pertama:\
Baris pertama··\
Baris kedua

Sintaks alternatif kedua:\
Baris pertama\
Baris kedua

Cara penggunaan: Pada sintaks pertama, letakkan dua spasi di akhir baris sebelum menekan Enter. Pada sintaks kedua, letakkan garis miring terbalik () di akhir baris.

Catatan: Dua titik tengah pada contoh pertama hanya merupakan penanda visual untuk dua spasi; jangan mengetikkan titik tersebut.

9\. Garis Horizontal (Horizontal Rule)

Fungsi: Membuat garis pemisah antarbagi­an tulisan.

## Sintaks:

Cara penggunaan: Letakkan minimal tiga tanda hubung, tanda bintang, atau garis bawah pada satu baris tersendiri.

10\. Daftar Tidak Berurutan (Unordered List)

Fungsi: Membuat daftar yang menggunakan simbol penanda, bukan nomor.

Sintaks:

- Item pertama
- Item kedua
- Item ketiga

Alternatif:

- Item pertama
- Item kedua

* Item pertama
* Item kedua

Cara penggunaan: Mulai setiap item dengan tanda hubung, bintang, atau tanda tambah, lalu beri spasi.

11\. Daftar Berurutan (Ordered List)

Fungsi: Membuat daftar dengan nomor secara berurutan.

Sintaks:

1. Item pertama
2. Item kedua
3. Item ketiga

Cara penggunaan: Awali setiap item dengan angka, tanda titik, dan spasi.

Catatan: Beberapa pemroses Markdown otomatis mengoreksi nomor urutan yang ditampilkan.

12\. Daftar Bertingkat (Nested List)

Fungsi: Membuat subitem di dalam suatu item daftar.

Sintaks:

- Item utama
  - Subitem pertama
  - Subitem kedua
    - Sub-subitem
- Item utama lainnya

Cara penggunaan: Tambahkan indentasi atau spasi di depan penanda subitem. Jumlah spasi yang diperlukan bergantung pada struktur daftar dan pemroses Markdown.

13\. Daftar Tugas (Task List / Checklist)

Fungsi: Menampilkan daftar tugas dengan status selesai atau belum selesai.

Sintaks:

- Tugas belum selesai
- Tugas sudah selesai

Cara penggunaan: Tambahkan [ ] setelah penanda daftar untuk tugas yang belum selesai, atau [x] untuk tugas yang sudah selesai.

Contoh hasil: Kotak centang kosong dan kotak centang bertanda selesai.

Catatan: Sintaks ini umum digunakan di GitHub dan aplikasi yang mendukung GFM. Tidak semua pemroses Markdown mendukungnya.

14\. Tautan (Links)

Fungsi: Membuat teks yang dapat diklik untuk membuka halaman lain.

Sintaks:\
[Google](https://www.google.com?utm_source=chatgpt.com)

Cara penggunaan: Tuliskan teks yang ingin ditampilkan di dalam tanda kurung siku, kemudian URL di dalam tanda kurung biasa.

Contoh hasil: Google menjadi teks yang dapat diklik menuju situs Google.

15\. Tautan dengan Judul Tambahan (Link Title)

Fungsi: Memberikan informasi tambahan pada tautan, yang dapat muncul sebagai tooltip ketika kursor diarahkan ke tautan.

Sintaks:\
[Google](https://www.google.com?utm_source=chatgpt.com)

Cara penggunaan: Tambahkan teks judul di dalam tanda kutip setelah URL, tetapi tetap di dalam tanda kurung.

16\. Gambar (Images)

Fungsi: Menampilkan gambar dari URL atau lokasi berkas yang dapat diakses oleh pemroses Markdown.

Sintaks:

Cara penggunaan: Gunakan tanda seru (!) sebelum sintaks tautan. Teks di dalam tanda kurung siku berfungsi sebagai teks alternatif (alt text), sedangkan bagian URL menunjukkan sumber gambar.

Catatan: Gambar lokal hanya akan tampil jika aplikasi mendukung jalur berkas tersebut dan berkasnya dapat diakses.

17\. Gambar dengan Judul Tambahan

Fungsi: Menambahkan keterangan tambahan pada gambar.

Sintaks:

Cara penggunaan: Tambahkan teks judul dalam tanda kutip setelah URL.

Catatan: Cara tampilan judul bergantung pada pemroses Markdown dan browser.

18\. Kode Sebaris (Inline Code)

Fungsi: Menampilkan potongan kode atau teks teknis di dalam paragraf tanpa menjalankannya.

Sintaks:\
Gunakan perintah `npm install` untuk memasang dependensi.

Cara penggunaan: Apit teks dengan satu tanda backtick (\`).

Contoh hasil: npm install ditampilkan dengan gaya teks kode.

19\. Blok Kode (Fenced Code Block)

Fungsi: Menampilkan kode dalam blok terpisah dengan format monospace dan biasanya mempertahankan indentasi.

Sintaks:

```
const message = "Halo dunia";
console.log(message);
```

Cara penggunaan: Letakkan tiga tanda backtick pada baris sebelum dan sesudah kode.

Catatan: Dalam dokumen nyata, contoh ini harus menggunakan tiga backtick secara langsung, tanpa spasi tambahan di antara tanda-tandanya.

20\. Blok Kode dengan Penanda Bahasa (Syntax Highlighting)

Fungsi: Memberikan pewarnaan sintaks berdasarkan bahasa pemrograman.

Sintaks:

```
const message = "Halo dunia";
console.log(message);
```

Cara penggunaan: Tambahkan nama bahasa setelah tiga backtick pembuka. Contoh bahasa yang umum digunakan adalah javascript, typescript, python, html, css, json, bash, sql, dan markdown.

Catatan: Pewarnaan sintaks bergantung pada aplikasi yang digunakan.

21\. Kutipan (Blockquote)

Fungsi: Menampilkan teks sebagai kutipan atau bagian yang perlu dibedakan dari tulisan utama.

Sintaks:

> Ini adalah kutipan.

Cara penggunaan: Tambahkan tanda lebih besar dari (>) dan spasi di awal baris.

22\. Kutipan Bertingkat (Nested Blockquote)

Fungsi: Membuat kutipan yang berada di dalam kutipan lainnya.

Sintaks:

> Kutipan tingkat pertama.
>
> > Kutipan tingkat kedua.

Cara penggunaan: Tambahkan tanda > tambahan untuk tingkat kutipan yang lebih dalam.

23\. Tabel (Tables)

Fungsi: Menyajikan informasi dalam baris dan kolom.

Sintaks:

| Nama | Umur |
| ---- | ---- |
| Andi | 20   |
| Budi | 21   |

Cara penggunaan: Gunakan tanda garis vertikal (|) untuk memisahkan kolom. Baris kedua digunakan sebagai pemisah antara kepala tabel dan isi tabel.

Catatan: Tabel bukan bagian dari spesifikasi Markdown inti, tetapi didukung oleh banyak implementasi populer seperti GFM.

24\. Perataan Kolom Tabel

Fungsi: Mengatur perataan teks di dalam kolom tabel.

Sintaks:

| Kiri | Tengah | Kanan |
| ---- | ------ | ----- |
| Teks | Teks   | Teks  |

Cara penggunaan:

- \:--- berarti rata kiri.
- \:---: berarti rata tengah.
- \---: berarti rata kanan.

Catatan: Dukungan bergantung pada pemroses Markdown.

25\. Karakter Khusus dan Escape

Fungsi: Menampilkan karakter yang biasanya ditafsirkan sebagai sintaks Markdown.

Sintaks:\
\*teks biasa\*\
\# Bukan judul

Cara penggunaan: Tambahkan garis miring terbalik () sebelum karakter yang ingin ditampilkan secara literal.

Karakter yang umum di-escape meliputi:\
\*\
\_\
\`\
\#\
+\
-\
.\
!\
\\[\
\\]\
\\(\
)\
\\