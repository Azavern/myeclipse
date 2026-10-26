import { Suspense } from 'react';
import { AppFrame } from '@/components/app-shell';
import { FlashToast } from '@/components/flash';
import { ScrollReveal } from '@/components/scroll-reveal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame>
      {children}
      <Suspense fallback={null}><FlashToast /></Suspense>
      <ScrollReveal />
    </AppFrame>
  );
}
