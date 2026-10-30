import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { getClass } from '@/lib/class';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description: 'Data yang diproses aplikasi kelas, tujuan, masa simpan, dan hak pengguna.',
};

// Halaman publik: tidak memerlukan login dan tidak membaca data pribadi.
export default async function PrivacyPage() {
  const cls = await getClass();
  const name = cls?.name ?? 'Eclipse';
  return (
    <LegalPage icon="lock" title="Kebijakan Privasi"
      description={`Cara ${name} memproses dan melindungi data di aplikasi kelas.`} updated="30 Oktober 2026">
      <section>
        <h2>1. Ringkasan</h2>
        <p>
          Kami memakai data hanya untuk menjalankan fitur kelas, menjaga keamanan, dan berkomunikasi soal
          akun. Data tidak dijual, dan aplikasi ini tidak memasang iklan atau pelacak pihak ketiga.
        </p>
      </section>

      <section>
        <h2>2. Data yang diproses</h2>
        <ul>
          <li><strong>Akun:</strong> email, kata sandi (disimpan sebagai hash oleh Supabase Auth), status keanggotaan, dan peran.</li>
          <li><strong>Profil:</strong> nama lengkap, nama panggilan, username, bio, foto, tautan sosial, dan portofolio.</li>
          <li><strong>Aktivitas kelas:</strong> jadwal, tugas, event, entri pengetahuan, inventory, serta permintaan edit dan persetujuan jabatan.</li>
          <li><strong>Berkas:</strong> gambar yang kamu unggah (avatar, portofolio, logo atau sampul kelas) beserta metadata dasarnya.</li>
          <li><strong>Teknis:</strong> cookie sesi, alamat IP untuk pembatasan laju dan log kesalahan, serta waktu akses.</li>
        </ul>
      </section>

      <section>
        <h2>3. QR Studio</h2>
        <p>
          Teks atau tautan yang kamu masukkan ke QR Studio dirender di browser dan tidak dikirim ke server.
          Ikon tengah juga tetap di perangkatmu. Hanya gambar PNG akhir yang dikirim saat kamu menekan
          tombol unggah.
        </p>
        <p>
          Gambar itu disimpan di penyimpanan publik dengan nama acak dan tautan yang dapat dibuka siapa pun
          yang memegangnya. File disapu setelah sekitar 6 jam, tetapi cache penyedia dapat menyajikan salinan
          hingga sekitar 1 jam setelah penghapusan. Jangan memakai QR Studio untuk data rahasia.
        </p>
      </section>

      <section>
        <h2>4. Tujuan pemrosesan</h2>
        <ul>
          <li>Menampilkan profil, jadwal, tugas, event, pengetahuan, dan inventory sesuai pengaturan visibilitas.</li>
          <li>Menjalankan akun, reset kata sandi, dan permintaan yang diajukan ke pengelola kelas.</li>
          <li>Mencegah penyalahgunaan, membatasi laju permintaan, dan mendiagnosis kesalahan.</li>
          <li>Memenuhi kewajiban hukum yang berlaku.</li>
        </ul>
      </section>

      <section>
        <h2>5. Visibilitas dan pihak lain</h2>
        <p>
          Sebagian data profil dapat diatur audiensnya: publik, pengguna yang masuk, anggota kelas, pengelola,
          atau hanya dirimu. Data pribadi secara bawaan hanya terlihat oleh anggota kelas. Identitas kelas
          seperti nama dan deskripsi bersifat publik.
        </p>
        <ul>
          <li>Pengelola kelas berwenang dapat melihat data administrasi, termasuk email akun, untuk mengelola keanggotaan.</li>
          <li>Pemegang <em>inv_key</em> inventory dapat melihat seluruh isi inventory pemilik sampai key dicabut atau kedaluwarsa.</li>
          <li>Saat menambahkan tautan portofolio, server dapat mengambil metadata publik tautan tersebut untuk membuat pratinjau.</li>
          <li>Layanan berjalan di atas Supabase (autentikasi, basis data, penyimpanan) dan Vercel (hosting). Data dapat diproses di luar Indonesia oleh penyedia tersebut; data tidak dijual atau dipakai untuk iklan.</li>
        </ul>
      </section>

      <section>
        <h2>6. Cookie dan penyimpanan browser</h2>
        <p>
          Aplikasi memakai cookie sesi yang bersifat <em>httpOnly</em>, <em>SameSite=Lax</em>, dan <em>Secure</em>
          {' '}di produksi untuk menjaga proses masuk. Tidak ada cookie iklan atau analitik.
        </p>
        <p>
          Draf entri pengetahuan disimpan di <em>localStorage</em> browser agar tidak hilang saat berpindah
          halaman. Kunci inventory tidak disimpan di URL atau <em>localStorage</em>. Kamu dapat menghapus data
          browser kapan saja, tetapi draf yang belum dikirim akan hilang.
        </p>
      </section>

      <section>
        <h2>7. Masa simpan</h2>
        <ul>
          <li>Data akun dan profil disimpan selama akun aktif. Penghapusan akun dilakukan oleh pengelola; salinan cadangan mengikuti kebijakan retensi penyedia.</li>
          <li>Gambar QR Studio disapu setelah sekitar 6 jam, dengan batasan cache dan penjadwalan yang dijelaskan di bagian 3.</li>
          <li>Kunci inventory berlaku sampai masa aktifnya berakhir atau dicabut pemilik.</li>
          <li>Log teknis disimpan terbatas untuk keamanan dan diagnosis, lalu diganti secara berkala oleh penyedia.</li>
        </ul>
      </section>

      <section>
        <h2>8. Keamanan</h2>
        <p>
          Koneksi memakai HTTPS, akses data dibatasi aturan baris dan peran, kata sandi tidak disimpan dalam
          bentuk teks biasa, dan sesi dapat dicabut saat kredensial berubah. Tidak ada sistem yang sepenuhnya
          aman: jaga kata sandi, jangan memakai kata sandi yang sama di tempat lain, dan segera beri tahu
          pengelola bila mencurigai akses tanpa izin.
        </p>
      </section>

      <section>
        <h2>9. Hakmu</h2>
        <p>
          Kamu dapat meminta akses, koreksi, atau penghapusan data, serta membatasi visibilitas profil melalui
          pengaturan. Sampaikan permintaan kepada Ketua atau pengurus kelas. Sebagian data mungkin perlu tetap
          disimpan untuk menjalankan layanan atau memenuhi kewajiban hukum; dalam hal itu kami akan
          menjelaskan alasannya.
        </p>
      </section>

      <section>
        <h2>10. Anak, perubahan, dan kontak</h2>
        <p>
          Layanan ini ditujukan untuk anggota kelas dan tidak untuk anak di bawah 13 tahun. Kebijakan ini dapat
          diperbarui; versi terbaru berlaku sejak tanggal di atas dan perubahan penting diberitahukan melalui
          aplikasi.
        </p>
        <p>
          Pertanyaan atau permintaan terkait privasi disampaikan kepada Ketua atau pengurus kelas melalui kanal
          kelas yang biasa dipakai.
        </p>
      </section>
    </LegalPage>
  );
}
