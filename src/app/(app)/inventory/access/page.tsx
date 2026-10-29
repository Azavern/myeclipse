import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/primitives';
import { InventoryAccess } from '@/features/inventory/components';
import { getClass } from '@/lib/class';

export const metadata: Metadata = { title: 'Akses inventory' };

// Halaman publik: tidak memerlukan login. Key hanya dikirim lewat POST dan
// tidak pernah masuk URL, sehingga tidak tersimpan di riwayat atau log akses.
export default async function InventoryAccessPage() {
  const cls = await getClass();
  return (
    <>
      <PageHeader
        icon="key"
        title="Akses inventory"
        description="Punya inv_key? Masukkan 16 karakter di bawah untuk membuka inventory pemiliknya tanpa perlu masuk ke akun."
      />
      <InventoryAccess tz={cls?.timezone ?? 'Asia/Jakarta'} />
    </>
  );
}
