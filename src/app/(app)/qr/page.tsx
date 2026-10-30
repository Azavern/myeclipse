import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { QrStudio } from '@/features/qr/studio';
import { getClass } from '@/lib/class';

export const metadata: Metadata = { title: 'QR Studio' };

// Halaman publik: tidak memerlukan login. Pembuatan QR terjadi di browser;
// server hanya memvalidasi dan menyimpan PNG ke bucket publik sementara.
export default async function QrPage() {
  const cls = await getClass();
  return (
    <>
      <PageHeader
        icon="qr"
        title="QR Studio"
        description="Buat QR normal atau custom dengan bentuk titik, warna, dan ikon tengah. Tanpa login, langsung dari browser."
      />
      <QrStudio tz={cls?.timezone ?? 'Asia/Jakarta'} />
    </>
  );
}
