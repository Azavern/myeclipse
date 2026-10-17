import { redirect } from 'next/navigation';

// /settings tidak punya isi sendiri; pintu masuknya selalu profil milik pengguna (blueprint §10).
// Anonim diarahkan ke login oleh halaman profil.
export default function SettingsIndexPage() {
  redirect('/settings/profile');
}
