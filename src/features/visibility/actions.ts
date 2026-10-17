'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, dbMessage, failState, type FormState } from '@/lib/form-state';
import { CLASS_KEYS, allowedFor } from '@/lib/visibility/audiences';

export async function saveClassVisibility(_p: FormState, fd: FormData): Promise<FormState> {
  const rules: { key: string; audience: string | null }[] = [];
  for (const [key, , widest] of CLASS_KEYS) { // allowlist; pilihan lebih luas dari batas ditolak di sini, DB (EC011) tetap penegak
    const v = String(fd.get(`v:${key}`) ?? '');
    if (v !== '' && !allowedFor(widest).includes(v as never)) return failState('Ada pilihan visibilitas yang tidak valid.', fd);
    rules.push({ key, audience: v || null });
  }
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return failState(FORBIDDEN, fd);
  const { error } = await ctx.supabase.rpc('save_class_visibility', { p_rules: rules });
  if (error) { console.error('saveClassVisibility', error.code); return failState(dbMessage(error), fd); }
  ['/', '/class', '/schedule', '/events', '/tasks', '/members', '/settings/visibility'].forEach((p) => revalidatePath(p));
  redirect(withFlash('/settings/visibility', 'saved'));
}
