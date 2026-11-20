'use client';

import dynamic from 'next/dynamic';
import { Icon } from '@/components/ui/icon';
import { GuestQrStudio } from './guest-studio';

// Renderer dan encoder hanya masuk chunk dinamis ini. Tamu tidak pernah
// merender komponen tersebut, sehingga kode pembuat QR tidak diunduh.
const MemberQrStudio = dynamic(
  () => import('./studio').then((module) => module.QrStudio),
  {
    loading: () => (
      <div className="card qr-loading" aria-live="polite">
        <span className="cluster"><Icon name="loader" size={18} className="spin" />Menyiapkan studio anggota…</span>
      </div>
    ),
  },
);

export function QrStudioEntry({ member, tz }: { member: boolean; tz: string }) {
  return member ? <MemberQrStudio tz={tz} /> : <GuestQrStudio tz={tz} />;
}
