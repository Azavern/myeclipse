import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { FORBIDDEN, dbMessage, failState, invalid, type FormState } from '@/lib/form-state';

type Save<S extends z.ZodTypeAny> = {
  fd: FormData; perm: string | null; table: string; schema: S; id?: string; owned?: boolean; paths: string[]; to: string;
  build: (d: z.infer<S>, tz: string) => Record<string, unknown>;
};

// Pola Server Action blueprint §9.3: Zod -> konteks+permission -> mutasi via RLS -> cek baris -> revalidate -> redirect.
export async function runSave<S extends z.ZodTypeAny>(o: Save<S>): Promise<FormState> {
  const parsed = o.schema.safeParse(Object.fromEntries(o.fd));
  if (!parsed.success) return invalid(parsed.error, o.fd);
  const ctx = await requireActionContext();
  if (!ctx || (o.perm && !ctx.can(o.perm))) return failState(FORBIDDEN, o.fd);
  const row = o.build(parsed.data, ctx.timezone); // class_id dari ctx, bukan dari input
  if (o.id === undefined) {
    const { error } = await ctx.supabase.from(o.table).insert({ class_id: ctx.classId, ...(o.owned ? { user_id: ctx.user.id } : {}), ...row });
    if (error) { console.error(o.table, 'insert', error.code); return failState(dbMessage(error), o.fd); }
  } else {
    const upd = ctx.supabase.from(o.table).update(row).eq('id', o.id);
    const { data, error } = await (o.owned ? upd.eq('user_id', ctx.user.id) : upd).select('id');
    if (error) { console.error(o.table, 'update', error.code); return failState(dbMessage(error), o.fd); }
    if (!data?.length) return failState('Data tidak ditemukan.', o.fd); // 0 baris = gagal
  }
  o.paths.forEach((p) => revalidatePath(p));
  redirect(withFlash(o.to, o.id === undefined ? 'created' : 'saved'));
}

export async function runDelete(o: { fd: FormData; id: string | null; perm: string | null; owned?: boolean; table: string; paths: string[]; to: string }): Promise<FormState> {
  const ctx = await requireActionContext();
  if (!ctx || (o.perm && !ctx.can(o.perm))) return failState(FORBIDDEN, o.fd);
  if (!o.id) return failState('Data tidak ditemukan.', o.fd);
  const del = ctx.supabase.from(o.table).delete().eq('id', o.id);
  const { data, error } = await (o.owned ? del.eq('user_id', ctx.user.id) : del).select('id');
  if (error) { console.error(o.table, 'delete', error.code); return failState(dbMessage(error), o.fd); }
  if (!data?.length) return failState('Data tidak ditemukan.', o.fd);
  o.paths.forEach((p) => revalidatePath(p));
  redirect(withFlash(o.to, 'deleted'));
}
