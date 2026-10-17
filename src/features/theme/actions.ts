'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, dbMessage, type FormState } from '@/lib/form-state';
import { PALETTE_KEYS, ThemeSchema } from '@/lib/theme/schema';

export async function updateTheme(_p: FormState, fd: FormData): Promise<FormState> {
  const g = (k: string) => String(fd.get(k) ?? '');
  const parsed = ThemeSchema.safeParse({
    layout: g('layout'), font_preset: g('font_preset'),
    palette: Object.fromEntries(PALETTE_KEYS.map((k) => [k, g(`p_${k}`)])),
  });
  if (!parsed.success) return { error: parsed.error.issues.slice(0, 3).map((i) => i.message).join(' ') }; // validasi ulang di server
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return { error: FORBIDDEN };
  const { data, error } = await ctx.supabase.from('classes').update({ theme: parsed.data }).eq('id', ctx.classId).select('id');
  if (error) { console.error('updateTheme', error.code); return { error: dbMessage(error) }; }
  if (!data?.length) return { error: 'Data tidak ditemukan.' };
  revalidatePath('/', 'layout');
  redirect(withFlash('/settings/theme', 'saved'));
}
