import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { needsSecondFactor } from './aal';

// Dibaca dari JWT sesi yang tersimpan (tanpa panggilan jaringan), jadi aman
// dipanggil di layout dan setiap Server Action. `nextLevel = aal2` hanya muncul
// bila akun sudah punya faktor terverifikasi; selama sesi belum `aal2`, akses
// aplikasi ditahan sampai kode dari aplikasi authenticator diverifikasi.
export async function mfaPending(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!data) return false;
  return needsSecondFactor(data);
}
