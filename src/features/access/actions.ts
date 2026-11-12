'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { FORBIDDEN, ROLE_LIMIT } from '@/lib/form-state';
import { fail, type ActionResult } from '@/lib/result';

export type AccessState = ActionResult<null> | null;

const permission = z.enum(['class.manage', 'schedule.manage', 'events.manage', 'tasks.manage', 'members.request', 'kas.manage']);

// Checklist akses: satu permintaan per centang/un-centang, langsung disimpan.
export async function toggleRoleAccess(_p: AccessState, fd: FormData): Promise<AccessState> {
  const parsed = z.object({ role_id: z.string().uuid(), permission })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail('validation', 'Akses tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('members.manage')) return fail('forbidden', FORBIDDEN);
  const { error } = await ctx.supabase.rpc('set_role_access', {
    p_role_id: parsed.data.role_id,
    p_permission: parsed.data.permission,
    p_enabled: fd.get('enabled') === '1',
  });
  if (error) {
    console.error('toggleRoleAccess', error.code);
    const message = error.code === 'EC063' ? 'Akses Ketua tetap dan tidak dapat diubah.'
      : error.code === 'EC064' ? 'Role ini tidak dapat diberi akses.'
      : error.code === 'P0002' ? 'Role tidak ditemukan.'
      : error.code === '22023' ? 'Akses ini tidak dapat diberikan.'
      : 'Akses belum bisa disimpan. Coba lagi.';
    return fail('unknown', message);
  }
  revalidatePath('/settings/access');
  return { ok: true, data: null };
}

// Pengajuan dari pemegang `members.request`: hanya jabatan, bukan identitas,
// status, atau keanggotaan. DB memvalidasi ulang seluruh aturan.
export async function requestRoleChange(_p: AccessState, fd: FormData): Promise<AccessState> {
  const parsed = z.object({ target_id: z.string().uuid(), role_id: z.string().uuid() })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail('validation', 'Pilih jabatan terlebih dahulu.');
  const ctx = await requireActionContext();
  if (!ctx?.can('members.request')) return fail('forbidden', FORBIDDEN);
  const { error } = await ctx.supabase.rpc('request_role_change', {
    p_target: parsed.data.target_id, p_role_id: parsed.data.role_id,
  });
  if (error) {
    console.error('requestRoleChange', error.code);
    const message = error.code === '23505' ? 'Pengajuan untuk anggota ini masih menunggu persetujuan Ketua.'
      : error.code === 'EC060' ? 'Jabatan sendiri tidak dapat diajukan.'
      : error.code === 'EC061' ? 'Jabatan Ketua tidak dapat diubah lewat pengajuan.'
      : error.code === 'EC062' ? 'Anggota sudah memakai jabatan itu.'
      : error.code === '22023' ? 'Jabatan itu tidak dapat diajukan.'
      : error.code === 'P0002' ? 'Anggota atau jabatan tidak ditemukan.'
      : 'Pengajuan belum bisa dikirim. Coba lagi.';
    return fail(error.code === '42501' ? 'forbidden' : 'unknown', message);
  }
  revalidatePath('/settings/members');
  return { ok: true, data: null };
}

// Persetujuan hanya untuk Ketua (pemegang members.manage).
export async function decideRoleChange(_p: AccessState, fd: FormData): Promise<AccessState> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse({ id: fd.get('id') });
  if (!parsed.success) return fail('validation', 'Pengajuan tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('members.manage')) return fail('forbidden', FORBIDDEN);
  const { error } = await ctx.supabase.rpc('decide_role_change_request', {
    p_id: parsed.data.id, p_approve: fd.get('approve') === '1',
  });
  if (error) {
    console.error('decideRoleChange', error.code);
    if (error.code === 'EC041') return fail('conflict', ROLE_LIMIT);
    const message = error.code === 'EC057' ? 'Pengajuan ini sudah diputuskan.'
      : error.code === 'EC061' ? 'Jabatan Ketua tidak dapat diubah lewat pengajuan.'
      : error.code === 'P0002' ? 'Pengajuan tidak ditemukan.'
      : 'Pengajuan belum bisa diproses. Coba lagi.';
    return fail('unknown', message);
  }
  ['/settings/access', '/settings/members', '/members', '/'].forEach((p) => revalidatePath(p));
  return { ok: true, data: null };
}

// Akses tambahan per anggota dengan role `member` untuk event/tugas. Hanya Ketua.
export async function toggleMemberAccess(_p: AccessState, fd: FormData): Promise<AccessState> {
  const parsed = z.object({
    user_id: z.string().uuid(),
    permission: z.enum(['events.manage', 'tasks.manage']),
  }).safeParse({ user_id: fd.get('user_id'), permission: fd.get('permission') });
  if (!parsed.success) return fail('validation', 'Akses tidak valid.');
  const ctx = await requireActionContext();
  if (!ctx?.can('members.manage')) return fail('forbidden', FORBIDDEN);
  const { error } = await ctx.supabase.rpc('set_member_access', {
    p_user_id: parsed.data.user_id,
    p_permission: parsed.data.permission,
    p_enabled: fd.get('enabled') === '1',
  });
  if (error) {
    console.error('toggleMemberAccess', error.code);
    const message = error.code === 'EC083' ? 'Akses khusus hanya untuk anggota dengan role member.'
      : error.code === 'P0002' ? 'Anggota tidak ditemukan.'
      : error.code === '22023' ? 'Akses ini tidak dapat diberikan.'
      : 'Akses belum bisa disimpan. Coba lagi.';
    return fail('unknown', message);
  }
  revalidatePath('/settings/access');
  return { ok: true, data: null };
}
