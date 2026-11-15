import { resolveStoredTheme } from './resolve';
import { homeMode } from './schema';

// Keputusan route beranda yang bisa dites tanpa runtime Next. Tema lama atau rusak
// diperlakukan sebagai klasik oleh resolveStoredTheme, jadi / tetap aman.
export function homeDestination(theme: unknown): '/' | '/intro' {
  return homeMode(resolveStoredTheme(theme).theme) === 'intro' ? '/intro' : '/';
}
