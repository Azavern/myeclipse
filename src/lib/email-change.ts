import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { OTP_RESEND_SECONDS } from '@/lib/mail/otp';

export type PendingEmailChange = { email: string; expiresInSec: number; cooldownSec: number };

type Row = { new_email: string; expires_at: string; sent_at: string };

// Tabel OTP tidak punya grant untuk peramban (migrasi 0020), jadi bacaannya
// memakai service role. Yang ditampilkan hanya alamat dan sisa waktu.
export async function getPendingEmailChange(userId: string): Promise<PendingEmailChange | null> {
  const { data, error } = await createAdminClient()
    .from('email_change_requests')
    .select('new_email,expires_at,sent_at')
    .eq('user_id', userId)
    .maybeSingle<Row>();
  if (error || !data) return null;
  const now = Date.now();
  return {
    email: data.new_email,
    expiresInSec: Math.max(0, Math.ceil((Date.parse(data.expires_at) - now) / 1000)),
    cooldownSec: Math.max(0, Math.ceil((Date.parse(data.sent_at) + OTP_RESEND_SECONDS * 1000 - now) / 1000)),
  };
}

// Apakah email sudah dipakai akun lain. Gagal membaca tidak dianggap "bebas";
// verifikasi tetap akan menolak di Auth Admin API bila ternyata sudah dipakai.
export async function findEmailOwner(email: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    let page = 1;
    for (let i = 0; i < 20; i += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data) return null;
      const found = data.users.find((u) => u.email?.toLowerCase() === email);
      if (found) return found.id;
      if (!data.nextPage) return null;
      page = data.nextPage;
    }
  } catch {
    console.error('findEmailOwner gagal');
  }
  return null;
}
