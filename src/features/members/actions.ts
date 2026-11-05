'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { dbMessage, failState, invalid, ROLE_LIMIT, type FormState } from '@/lib/form-state';
import { idOf, reqText } from '@/lib/zod-fields';
import { requireActionContext } from '@/lib/action-context';
import { env } from '@/lib/env';
import { withFlash } from '@/lib/flash';
import { fail, type ActionResult } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncLibraryFolderName } from '@/lib/gdrive/library-folders';
import { pickUsername, slugifyUsername } from '@/lib/username';

export type LinkState = ActionResult<{ url: string }> | null;
const FORBIDDEN = 'Kamu tidak punya izin untuk tindakan ini.';
const createSchema = z.object({
  full_name: z.string().trim().min(1, 'Nama wajib diisi.').max(80, 'Nama maksimal 80 karakter.'),
  email: z.string().trim().toLowerCase().email('Email tidak valid.'),
  role_id: z.string().uuid('Role tidak valid.'),
});

// Tautan akses = kredensial: dikembalikan sekali ke dialog, tidak disimpan dan tidak dicatat.
async function accessUrl(email: string) {
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'recovery', email });
  const t = data?.properties?.hashed_token;
  return error || !t ? null : `${env.APP_URL.replace(/\/$/, '')}/auth/confirm#token_hash=${t}&type=recovery`;
}

export async function createMember(_p: LinkState, fd: FormData): Promise<LinkState> {
  const parsed = createSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Isian tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('members.manage')) return fail('forbidden', FORBIDDEN);
  const { full_name, email, role_id } = parsed.data;

  const base = slugifyUsername(full_name);
  const { data: taken } = await ctx.supabase.from('member_profile_v').select('username').like('username', `${base}%`).limit(100);
  const username = pickUsername(base, new Set(((taken ?? []) as { username: string }[]).map((r) => r.username)));

  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email, password: randomBytes(32).toString('hex'), email_confirm: true });
  if (created.error || !created.data.user) return fail('conflict', 'Email ini sudah terdaftar atau tidak bisa dipakai.');
  const id = created.data.user.id;

  const prov = await ctx.supabase.rpc('provision_member', { p_user_id: id, p_full_name: full_name, p_username: username, p_role_id: role_id });
  if (prov.error) {
    await admin.auth.admin.deleteUser(id); // kompensasi: tidak boleh ada user Auth yatim
    console.error('createMember: provision_member gagal', prov.error.code);
    if (prov.error.code === '23505') return fail('conflict', 'Username sudah dipakai.');
    if (prov.error.code === 'EC041') return fail('conflict', ROLE_LIMIT);
    if (prov.error.code === 'EC001') return fail('conflict', 'Anggota dengan role Ketua harus aktif dulu. Buat sebagai Member, lalu ubah role-nya setelah ia aktif.');
    if (prov.error.code === '42501') return fail('forbidden', FORBIDDEN);
    return fail('unknown', 'Anggota belum bisa dibuat. Coba lagi.');
  }
  revalidatePath('/settings/members');
  const url = await accessUrl(email);
  return url ? { ok: true, data: { url } }
    : fail('unknown', 'Anggota dibuat, tetapi tautan akses gagal terbit. Terbitkan ulang dari daftar anggota.');
}

export async function issueAccessLink(_p: LinkState, fd: FormData): Promise<LinkState> {
  const id = z.string().uuid().safeParse(fd.get('user_id'));
  if (!id.success) return fail('validation', 'Anggota tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('members.manage')) return fail('forbidden', FORBIDDEN);
  // Pastikan target memang anggota kelas ini (view bagi members.manage memuat semua status).
  const { data: m } = await ctx.supabase.from('member_profile_v').select('user_id').eq('user_id', id.data).maybeSingle();
  if (!m) return fail('not_found', 'Data tidak ditemukan.');
  const email = (await createAdminClient().auth.admin.getUserById(id.data)).data.user?.email;
  const url = email ? await accessUrl(email) : null;
  return url ? { ok: true, data: { url } } : fail('unknown', 'Tautan akses gagal terbit. Coba lagi.');
}

// ---- Kelola anggota (blueprint §9.5). Identitas target = hidden `id`; pelaku dan class_id dari sesi/DB. ----
const guard = async () => { const ctx = await requireActionContext(); return ctx?.can('members.manage') ? ctx : null; };
const detail = (id: string) => `/settings/members/${id}`;
function done(id: string): never {
  ['/settings/members', detail(id), '/members', '/'].forEach((p) => revalidatePath(p));
  redirect(withFlash(detail(id), 'saved'));
}

export async function updateMemberIdentity(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  const parsed = z.object({
    full_name: reqText(80, 'Nama'),
    username: z.string().trim().regex(/^[a-z0-9_]{3,30}$/, 'Username 3–30 karakter: huruf kecil, angka, garis bawah.'),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error, fd);
  if (!id) return failState('Data tidak ditemukan.', fd);
  const ctx = await guard();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('update_member_identity', { p_user_id: id, p_full_name: parsed.data.full_name, p_username: parsed.data.username });
  if (error) {
    console.error('updateMemberIdentity', error.code);
    return failState(error.code === '23505' ? 'Username sudah dipakai.' : dbMessage(error), fd);
  }
  // Nama folder Drive mengikuti username. Folder diganti nama (file tidak pernah
  // dihapus); kegagalan dicatat dan dicoba lagi saat unggahan Library berikutnya.
  const synced = await syncLibraryFolderName({
    supabase: ctx.supabase, classId: ctx.classId, userId: id, username: parsed.data.username,
  });
  if (synced.failed > 0) {
    console.error('updateMemberIdentity: folder Library tidak seluruhnya tersesuaikan', synced.failed);
  }
  return done(id);
}

export async function changeMemberRole(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  const role = z.string().uuid().safeParse(fd.get('role_id'));
  if (!id || !role.success) return failState('Isian tidak valid.', fd);
  const ctx = await guard();
  if (!ctx) return failState(FORBIDDEN, fd);
  const { data, error } = await ctx.supabase.from('memberships').update({ role_id: role.data })
    .eq('class_id', ctx.classId).eq('user_id', id).select('user_id');
  if (error) { console.error('changeMemberRole', error.code); return failState(dbMessage(error), fd); } // EC001 = pengelola terakhir
  if (!data?.length) return failState('Data tidak ditemukan.', fd);
  return done(id);
}

export async function setMemberStatus(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  const status = z.enum(['active', 'inactive']).safeParse(fd.get('status'));
  if (!id || !status.success) return failState('Isian tidak valid.', fd);
  const ctx = await guard();
  if (!ctx) return failState(FORBIDDEN, fd);
  if (id === ctx.user.id) return failState('Kamu tidak bisa mengubah status akunmu sendiri.', fd);
  const { data, error } = await ctx.supabase.from('memberships').update({ status: status.data })
    .eq('class_id', ctx.classId).eq('user_id', id).select('user_id');
  if (error) { console.error('setMemberStatus', error.code); return failState(dbMessage(error), fd); }
  if (!data?.length) return failState('Data tidak ditemukan.', fd);
  // DB sudah memutus akses non-publik; ban Auth menutup sisa sesi dan login baru.
  const ban = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: status.data === 'inactive' ? '876000h' : 'none' });
  if (ban.error) { console.error('setMemberStatus: ban gagal'); return failState('Status sudah diubah, tetapi pemblokiran akun di Auth gagal. Coba lagi.', fd); }
  return done(id);
}

async function purgeMemberMedia(admin: ReturnType<typeof createAdminClient>, classId: string, userId: string) {
  try { // best-effort setelah semua langkah dependen sukses (blueprint §6.2, §13.6)
    const bucket = admin.storage.from('member-media');
    for (const sub of ['avatar', 'portfolio', 'library']) {
      const dir = `${classId}/${userId}/${sub}`;
      const { data } = await bucket.list(dir, { limit: 100 });
      if (data?.length) await bucket.remove(data.map((o: { name: string }) => `${dir}/${o.name}`));
    }
  } catch { console.error('purgeMemberMedia gagal'); }
}

export async function deleteMember(_p: FormState, fd: FormData): Promise<FormState> {
  const id = idOf(fd);
  const ctx = await guard();
  if (!ctx) return failState(FORBIDDEN, fd);
  if (!id) return failState('Data tidak ditemukan.', fd);
  if (id === ctx.user.id) return failState('Kamu tidak bisa menghapus akunmu sendiri.', fd);
  const { data: m } = await ctx.supabase.from('member_profile_v').select('user_id').eq('user_id', id).maybeSingle();
  if (!m) return failState('Data tidak ditemukan.', fd);
  const admin = createAdminClient();
  const del = await admin.auth.admin.deleteUser(id); // CASCADE membersihkan DB; trigger last-admin dapat menolak
  if (del.error) { console.error('deleteMember gagal', del.error.status); return failState('Anggota tidak bisa dihapus. Jika dia pengelola terakhir, tambahkan pengelola lain dulu.', fd); }
  await purgeMemberMedia(admin, ctx.classId, id);
  ['/settings/members', '/members', '/'].forEach((p) => revalidatePath(p));
  redirect(withFlash('/settings/members', 'deleted'));
}

// Antrean reset (migrasi 0011): tautan diterbitkan hanya saat Ketua menekan tombol dan tampil sekali.
// Tanpa revalidatePath agar tautan tidak hilang bersama barisnya sebelum sempat disalin.
export async function issueResetLink(_p: LinkState, fd: FormData): Promise<LinkState> {
  const id = idOf(fd);
  if (!id) return fail('validation', 'Permintaan tidak valid.');
  const ctx = await guard();
  if (!ctx) return fail('forbidden', FORBIDDEN);
  const { data } = await ctx.supabase.from('password_reset_requests').select('email,status').eq('id', id).maybeSingle();
  const r = data as { email: string; status: string } | null;
  if (!r || r.status !== 'pending') return fail('not_found', 'Permintaan tidak ditemukan atau sudah diproses.');
  const url = await accessUrl(r.email);
  if (!url) return fail('unknown', 'Tautan akses gagal terbit. Coba lagi.');
  const { error } = await ctx.supabase.from('password_reset_requests').update({ status: 'issued' }).eq('id', id);
  if (error) console.error('issueResetLink: gagal menandai permintaan', error.code);
  return { ok: true, data: { url } };
}
