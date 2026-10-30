import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { PwaRegister } from '@/components/pwa-register';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/shell.css';
import { getClass } from '@/lib/class';
import { DEFAULT_THEME } from '@/lib/theme/defaults';
import { buildThemeCss } from '@/lib/theme/css';
import { fontClass } from '@/lib/theme/fonts';
import { ThemeSchema } from '@/lib/theme/schema';

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
  const parsed = ThemeSchema.safeParse(cls?.theme);
  const theme = parsed.success ? parsed.data : DEFAULT_THEME;
  return {
    themeColor: theme.palette.primary,
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [cls, nonce] = await Promise.all([getClass(), headers().then((h) => h.get('x-nonce') ?? undefined)]);
  const parsed = ThemeSchema.safeParse(cls?.theme);
  if (cls && !parsed.success) console.error('Theme di DB tidak valid; memakai DEFAULT_THEME'); // jangan crash (blueprint §17.4)
  const theme = parsed.success ? parsed.data : DEFAULT_THEME;
  return (
    <html lang="id" className={fontClass(theme.font_preset)}>
      <head><style nonce={nonce}>{buildThemeCss(theme)}</style></head>
      <body>
        <a className="skip" href="#main">Lewati ke konten</a>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
