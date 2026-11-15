import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import '@/features/intro/intro.css';
import { introFontClass } from '@/lib/theme/fonts';
import { getViewer } from '@/lib/visibility/server';

// Layout sendiri di luar grup (app): tanpa AppFrame, sidebar, dan bottom nav.
// Pemeriksaan MFA disalin dari (app)/layout.tsx sebagai defense in depth; gerbang
// visibility tetap di page.tsx. Pengecualian shell ini dicatat di docs/MOBILE.md.
export default async function IntroLayout({ children }: { children: ReactNode }) {
  if ((await getViewer()).mfaPending) redirect('/login/2fa');
  return <div className={`intro-shell ${introFontClass()}`}>{children}</div>;
}
