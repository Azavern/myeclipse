import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { PwaRegister } from '@/components/pwa-register';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/developer.css';
import '../styles/shell.css';
import '../styles/templates/neobrutalism.css';
import '../styles/templates/archive.css';
import { getClass } from '@/lib/class';
import { buildThemeCss } from '@/lib/theme/css';
import { themeFontClass } from '@/lib/theme/fonts';
import { resolveStoredTheme } from '@/lib/theme/resolve';

export const metadata: Metadata = {
  title: { default: 'Eclipse', template: '%s · Eclipse' },
  applicationName: 'Eclipse',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.ico', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Eclipse', statusBarStyle: 'default' },
};

export async function generateViewport(): Promise<Viewport> {
  const cls = await getClass().catch(() => null);
  const theme = resolveStoredTheme(cls?.theme).theme;
  return {
    // Warna chrome peramban mengikuti latar tema, bukan aksen, agar tema gelap tidak menyisakan
    // bilah terang di atas halaman.
    themeColor: theme.palette.background,
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cls, nonce] = await Promise.all([getClass(), headers().then((h) => h.get('x-nonce') ?? undefined)]);
  const resolved = resolveStoredTheme(cls?.theme);
  // Jangan crash (blueprint §17.4); template yang rusak kembali ke default tanpa membuang palet.
  if (cls && resolved.invalidTemplate) console.error('Template tema di DB tidak dikenal; memakai template default');
  else if (cls && resolved.invalid) console.error('Theme di DB tidak valid; memakai DEFAULT_THEME');
  const theme = resolved.theme;
  return (
    <html lang="id" data-template={resolved.template} className={themeFontClass(theme)}>
      <head><style nonce={nonce}>{buildThemeCss(theme)}</style></head>
      <body>
        <a className="skip" href="#main">Lewati ke konten</a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
