import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyPin } from './pin-hash';

type BeginRow = { pin_hash?: string | null; allowed?: boolean };

// Dipakai aksi sensitif (ganti kata sandi, matikan 2FA). Percobaan tetap
// dihitung dan dikunci di database, sama seperti login dengan PIN.
export async function verifyUserPin(admin: SupabaseClient, userId: string, pin: string): Promise<boolean> {
  const begin = await admin.rpc('pin_begin_by_user', { p_user_id: userId });
  if (begin.error) {
    console.error('pin begin', begin.error.code);
    return false;
  }
  const row = (Array.isArray(begin.data) ? begin.data[0] : begin.data) as BeginRow | null;
  if (!row?.allowed || typeof row.pin_hash !== 'string') return false;

  let ok = false;
  try {
    ok = await verifyPin(pin, row.pin_hash);
  } catch {
    ok = false;
  }

  const finish = await admin.rpc('pin_finish', { p_user_id: userId, p_success: ok });
  if (finish.error) console.error('pin finish', finish.error.code);
  return ok;
}
