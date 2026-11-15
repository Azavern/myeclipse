import { Bricolage_Grotesque, Cormorant_Garamond, Courier_Prime, Fraunces, Nunito, Nunito_Sans, Public_Sans, Source_Sans_3, Space_Grotesk, Space_Mono } from 'next/font/google';
import { themeTemplate, type Theme, type ThemeTemplate } from './schema';

// Next.js mewajibkan setiap loader font dipanggil dan di-assign ke const pada scope modul, dengan opsi literal
// (dibuktikan build Next 16.4.0). Jangan memanggil loader di dalam objek/array/fungsi.
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const sourceSans3 = Source_Sans_3({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const publicSans = Public_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

const nunito = Nunito({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

// Font template dimuat tanpa preload global. Next.js menentukan preload saat build, bukan
// per request; dengan preload:false hanya template yang memakai class-nya yang mengunduh
// font ini. Body Neo/Arsip memakai Public Sans/Source Sans yang sudah ada.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-display', preload: false });
const spaceMono = Space_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-template-mono', preload: false, weight: ['400', '700'] });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], display: 'swap', variable: '--font-display', preload: false });
const courier = Courier_Prime({ subsets: ['latin'], display: 'swap', variable: '--font-template-mono', preload: false, weight: ['400', '700'] });

const PRESETS = {
  editorial: [fraunces, sourceSans3],
  grotesk: [bricolage, publicSans],
  rounded: [nunito, nunitoSans],
} as const;

const TEMPLATE_PRESETS = {
  neobrutalism: [spaceGrotesk, publicSans, spaceMono],
  archive: [cormorant, sourceSans3, courier],
} as const;

export type TemplateFont = Exclude<ThemeTemplate, 'default'>;

// Hanya preset aktif yang diberi class di root (blueprint §17.4). Tanpa Inter/Roboto/Arial/Geist sebagai pilihan.
export const fontClass = (preset: Theme['font_preset']) => PRESETS[preset].map((f) => f.variable).join(' ');
export const templateFontClass = (template: TemplateFont) => TEMPLATE_PRESETS[template].map((f) => f.variable).join(' ');

// Intro memakai pasangan font sendiri yang tetap (Fraunces + Source Sans + Space Mono),
// bukan font tema kelas, agar identitas visualnya konsisten. Semua loader sudah ada di modul ini.
export const introFontClass = () => [fraunces, sourceSans3, spaceMono].map((font) => font.variable).join(' ');

// Saat template non-default, font_preset diabaikan saat render.
export const themeFontClass = (theme: Theme) => {
  const template = themeTemplate(theme);
  return template === 'default' ? fontClass(theme.font_preset) : templateFontClass(template);
};
