import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { getClass } from '@/lib/class';

export const metadata: Metadata = {
  title: 'Syarat Layanan',
  description: 'Ketentuan penggunaan aplikasi kelas: akun, konten, dan QR Studio.',
};

// Halaman publik: tidak memerlukan login dan tidak membaca data pribadi.
export default async function TermsPage() {
  const cls = await getClass();
  const name = cls?.name ?? 'Eclipse';
  return (
    <LegalPage icon="shield" title="Syarat Layanan"
      description={`Ketentuan penggunaan aplikasi kelas ${name}.`} updated="30 Oktober 2026">
      <section>
        <h2>1. Penerimaan</h2>
        <p>
          Dengan membuka atau memakai aplikasi ini, kamu setuju pada ketentuan di halaman ini dan pada
          Kebijakan Privasi. Bila tidak setuju, jangan gunakan layanan.
        </p>
      </section>

      <section>
        <h2>2. Layanan</h2>
        <p>
          Aplikasi ini adalah ruang kelas digital untuk profil anggota, jadwal, tugas, event, pengetahuan,
          inventory pribadi, dan QR Studio. Sebagian halaman terbuka untuk umum; fitur lain memerlukan akun
          yang dibuat oleh pengelola kelas.
        </p>
        <p>
          Fitur dapat ditambah, diubah, atau dihentikan untuk menjaga layanan, keamanan, atau menyesuaikan
          kebutuhan kelas.
        </p>
      </section>

      <section>
        <h2>3. Akun</h2>
        <ul>
          <li>Akun dibuat dan dikelola oleh Ketua atau pengurus kelas; tidak ada pendaftaran mandiri.</li>
          <li>Jaga kerahasiaan kata sandi dan jangan membagikan akunmu. Kamu bertanggung jawab atas aktivitas yang terjadi melalui akunmu.</li>
          <li>Data profil yang kamu isi harus benar dan bukan milik orang lain tanpa izin.</li>
          <li>Beri tahu pengelola segera bila akunmu diakses tanpa izin agar sesi dan kata sandi bisa direset.</li>
        </ul>
      </section>

      <section>
        <h2>4. Penggunaan yang dilarang</h2>
        <ul>
          <li>Melanggar hukum, mengancam, melecehkan, atau menyebarkan konten yang menyesatkan.</li>
          <li>Menyamar sebagai orang lain atau memakai identitas tanpa izin.</li>
          <li>Mengunggah malware, berkas berbahaya, atau konten yang melanggar hak cipta dan privasi.</li>
          <li>Mengakses data, akun, atau area yang bukan hakmu; memindai, menyalin massal, atau membebani layanan secara otomatis.</li>
          <li>Mengirim spam, tautan phishing, atau memakai QR Studio untuk menipu orang lain.</li>
        </ul>
      </section>

      <section>
        <h2>5. Kontenmu</h2>
        <p>
          Kamu tetap memiliki konten yang kamu buat, seperti profil, portofolio, dan entri pengetahuan.
          Dengan mengunggahnya, kamu memberi izin terbatas kepada pengelola untuk menyimpan, menampilkan,
          dan membagikannya sesuai pengaturan visibilitas yang kamu pilih.
        </p>
        <p>
          Kamu menjamin berhak atas konten tersebut. Pengelola dapat menyembunyikan atau menghapus konten
          yang melanggar ketentuan, hak orang lain, atau keamanan kelas. Penghapusan konten tidak selalu
          menghapus salinan cadangan seketika.
        </p>
      </section>

      <section>
        <h2>6. Pengetahuan dan kolaborasi</h2>
        <p>
          Entri pengetahuan dapat diusulkan perubahannya oleh anggota lain melalui alur persetujuan. Jangan
          menghapus atau menimpa kontribusi orang lain tanpa dasar; sertakan sumber bila mengutip karya pihak
          lain.
        </p>
      </section>

      <section>
        <h2>7. QR Studio</h2>
        <p>
          QR Studio dapat dipakai tanpa login. Teks QR diproses di browser, sedangkan gambar PNG yang kamu
          unggah disimpan sementara di penyimpanan publik dengan tautan acak dan dihapus setelah sekitar
          6 jam. Siapa pun yang memiliki tautan dapat membuka gambar tersebut.
        </p>
        <p>
          Jangan memakai QR Studio untuk konten ilegal, phishing, atau data sensitif. Ketersediaan tautan
          tidak dijamin, dan layanan ini bukan tempat penyimpanan permanen.
        </p>
      </section>

      <section>
        <h2>8. Ketersediaan dan batas tanggung jawab</h2>
        <p>
          Layanan disediakan apa adanya untuk kebutuhan kelas. Kami berusaha menjaga ketersediaan dan
          keamanan, tetapi tidak menjamin layanan selalu bebas gangguan, kehilangan data, atau kesalahan.
          Sejauh diizinkan hukum, pengelola tidak bertanggung jawab atas kerugian tidak langsung yang timbul
          dari penggunaan layanan.
        </p>
      </section>

      <section>
        <h2>9. Penangguhan dan penghentian</h2>
        <p>
          Akses dapat dibatasi atau dihentikan bila akun melanggar ketentuan, membahayakan anggota lain,
          atau disalahgunakan. Akun yang tidak lagi menjadi anggota kelas dapat dinonaktifkan oleh pengelola.
        </p>
      </section>

      <section>
        <h2>10. Perubahan dan hukum</h2>
        <p>
          Ketentuan ini dapat diperbarui; tanggal berlaku di atas menunjukkan versi terbaru. Perubahan
          penting akan diberitahukan melalui aplikasi. Ketentuan ini tunduk pada hukum yang berlaku di
          Indonesia.
        </p>
      </section>

      <section>
        <h2>11. Kontak</h2>
        <p>
          Pertanyaan tentang ketentuan ini disampaikan kepada Ketua atau pengurus kelas melalui kanal kelas
          yang biasa dipakai.
        </p>
      </section>
    </LegalPage>
  );
}
