import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-shell';
import { FlashToast } from '@/components/flash';
import { ScrollReveal } from '@/components/scroll-reveal';
import { getViewer } from '@/lib/visibility/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth di samping gate setiap Server Action: sesi aal1 milik akun
  // ber-2FA tidak pernah melihat halaman aplikasi sebelum kode diverifikasi.
  if ((await getViewer()).mfaPending) redirect('/login/2fa');
  return (
    <AppFrame>
      {children}
      <Suspense fallback={null}><FlashToast /></Suspense>
      <ScrollReveal />
    </AppFrame>
  );
}
