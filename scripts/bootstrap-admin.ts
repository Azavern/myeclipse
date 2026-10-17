// Membuat Ketua pertama + tautan akses (stdout saja, tidak disimpan). Jalankan lokal: npm run bootstrap:admin
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { slugifyUsername } from '../src/lib/username';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const need = (k: string) => {
  const v = process.env[k];
  if (!v) { console.error(`Env ${k} wajib diisi.`); process.exit(1); }
  return v;
};
const url = need('SUPABASE_URL');
const appUrl = need('APP_URL').replace(/\/$/, '');
const email = need('BOOTSTRAP_ADMIN_EMAIL').trim().toLowerCase();
const name = need('BOOTSTRAP_ADMIN_NAME').trim();
const admin = createClient(url, need('SUPABASE_SECRET_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: cls } = await admin.from('classes').select('id').single();
  if (!cls) throw new Error('Kelas tidak ditemukan. Terapkan migrasi 0001–0011 lebih dulu.');
  const { data: role } = await admin.from('roles').select('id').eq('class_id', cls.id).eq('key', 'ketua').single();
  if (!role) throw new Error('Role ketua tidak ada.');
  const { data: ketua } = await admin.from('memberships').select('user_id,status').eq('class_id', cls.id).eq('role_id', role.id);
  if (ketua?.some((m: { status: string }) => m.status === 'active')) throw new Error('Kelas sudah punya Ketua aktif; skrip ini ditolak.');

  let target = email;
  const pending = ketua?.find((m: { status: string; user_id: string }) => m.status === 'invited'); // idempoten: hanya terbitkan tautan baru
  if (pending) {
    const { data } = await admin.auth.admin.getUserById(pending.user_id);
    if (!data.user?.email) throw new Error('Akun Ketua tertunda tidak punya email.');
    target = data.user.email;
  } else {
    const created = await admin.auth.admin.createUser({ email, password: randomBytes(32).toString('hex'), email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Gagal membuat akun: ${created.error?.message}`);
    const id = created.data.user.id;
    // Langsung dengan service role: RPC provision_member memeriksa permission pemanggil.
    const m = await admin.from('memberships').insert({ class_id: cls.id, user_id: id, role_id: role.id, status: 'invited' });
    const p = m.error ? null : await admin.from('member_profiles')
      .insert({ class_id: cls.id, user_id: id, username: slugifyUsername(name), full_name: name });
    const err = m.error ?? p?.error;
    if (err) { await admin.auth.admin.deleteUser(id); throw new Error(`Gagal menyimpan keanggotaan: ${err.message}`); }
  }
  const link = await admin.auth.admin.generateLink({ type: 'recovery', email: target });
  const token = link.data?.properties?.hashed_token;
  if (link.error || !token) throw new Error('Gagal menerbitkan tautan akses.');
  console.log(`\nTautan akses Ketua (24 jam, sekali pakai):\n${appUrl}/auth/confirm#token_hash=${token}&type=recovery\n`);
}
main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
