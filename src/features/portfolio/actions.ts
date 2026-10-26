'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireActionContext } from '@/lib/action-context';
import { runDelete, runSave } from '@/lib/crud';
import { withFlash } from '@/lib/flash';
import { clearImage, replaceImage, writeResult } from '@/lib/storage/swap';
import { FORBIDDEN, failState, type FormState } from '@/lib/form-state';
import { idOf, optText, optUrl, reqText } from '@/lib/zod-fields';
import { AUDIENCES } from '@/lib/visibility/audiences';

const visibilityField = z.enum(AUDIENCES).or(z.literal('')).optional().transform((v) => v || null);
const schema = z.object({
  title: reqText(100, 'Judul'), description: optText(1000), url: optUrl, visibility: visibilityField,
  kind: z.enum(['project', 'achievement', 'organization', 'competition', 'creative_work', 'certificate', 'experience']),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid.'),
});
const base = { perm: null, owned: true, table: 'portfolio_items', schema, paths: ['/settings/portfolio', '/settings/profile', '/members'], to: '/settings/portfolio', build: (d: z.infer<typeof schema>) => d };

export async function createPortfolioItem(_p: FormState, fd: FormData) { return runSave({ ...base, fd }); }
export async function updatePortfolioItem(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  return id ? runSave({ ...base, fd, id }) : failState('Data tidak ditemukan.', fd);
}
export async function deletePortfolioItem(_p: FormState, fd: FormData) {
  return runDelete({ fd, id: idOf(fd), perm: null, owned: true, table: base.table, paths: base.paths, to: base.to });
}

// ---- Gambar portofolio (bucket member-media; path {class_id}/{user_id}/portfolio/{uuid}.ext) ----
// Item dicari berdasarkan id DAN pemilik dari sesi; item milik orang lain tidak pernah cocok.
async function mediaCtx(fd: FormData) {
  const id = idOf(fd);
  const ctx = await requireActionContext();
  if (!id || !ctx) return null;
  const { data } = await ctx.supabase.from('portfolio_items').select('media_path').eq('id', id).eq('user_id', ctx.user.id).maybeSingle();
  if (!data) return null;
  const write = async (path: string | null) =>
    writeResult(await ctx.supabase.from('portfolio_items').update({ media_path: path }).eq('id', id).eq('user_id', ctx.user.id).select('id'));
  return { ctx, id, old: (data as { media_path: string | null }).media_path, write, back: `/settings/portfolio/${id}/edit` };
}
const mediaPaths = () => ['/settings/portfolio', '/settings/profile', '/members'].forEach((p) => revalidatePath(p));

export async function uploadPortfolioMedia(_p: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get('file');
  if (!(file instanceof File)) return { error: 'Pilih gambar terlebih dahulu.' };
  const m = await mediaCtx(fd);
  if (!m) return { error: FORBIDDEN };
  const err = await replaceImage({ supabase: m.ctx.supabase, bucket: 'member-media', dir: `${m.ctx.classId}/${m.ctx.user.id}/portfolio`, file, old: m.old, write: m.write });
  if (err) return err;
  mediaPaths();
  redirect(withFlash(m.back, 'uploaded'));
}

export async function removePortfolioMedia(_p: FormState, fd: FormData): Promise<FormState> {
  const m = await mediaCtx(fd);
  if (!m) return { error: FORBIDDEN };
  const err = await clearImage({ supabase: m.ctx.supabase, bucket: 'member-media', old: m.old, write: m.write });
  if (err) return err;
  mediaPaths();
  redirect(withFlash(m.back, 'removed'));
}
