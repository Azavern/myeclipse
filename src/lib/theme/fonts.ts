import { Bricolage_Grotesque, Fraunces, Nunito, Nunito_Sans, Public_Sans, Source_Sans_3 } from 'next/font/google';
import type { Theme } from './schema';

// Next.js mewajibkan setiap loader font dipanggil dan di-assign ke const pada scope modul, dengan opsi literal
// (dibuktikan build Next 16.4.0). Jangan memanggil loader di dalam objek/array/fungsi.
const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const sourceSans3 = Source_Sans_3({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const publicSans = Public_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

const nunito = Nunito({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const nunitoSans = Nunito_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

const PRESETS = {
  editorial: [fraunces, sourceSans3],
  grotesk: [bricolage, publicSans],
  rounded: [nunito, nunitoSans],
} as const;

// Hanya preset aktif yang diberi class di root (blueprint §17.4). Tanpa Inter/Roboto/Arial/Geist sebagai pilihan.
export const fontClass = (preset: Theme['font_preset']) => PRESETS[preset].map((f) => f.variable).join(' ');
