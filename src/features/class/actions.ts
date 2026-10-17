'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActionContext } from '@/lib/action-context';
import { withFlash } from '@/lib/flash';
import { clearImage, replaceImage, writeResult } from '@/lib/storage/swap';
import { runSave } from '@/lib/crud';
import { FORBIDDEN, failState, type FormState } from '@/lib/form-state';
import { idOf, optText, optUrl, reqText } from '@/lib/zod-fields';

const schema = z.object({
  name: reqText(60, 'Nama kelas'),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{2,20}$/, 'Kode 2–20 karakter: huruf, angka, atau tanda hubung.').or(z.literal('')).optional().transform((v) => v || null),
  tagline: optText(120), description: optText(800), highlight_text: optText(160), highlight_url: optUrl,
  timezone: z.enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura']),
});
export async function updateClass(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  if (!id) return failState('Data tidak ditemukan.', fd);
  return runSave({ fd, id, perm: 'class.manage', table: 'classes', schema, paths: ['/', '/class', '/settings/class'], to: '/settings/class', build: (d: z.infer<typeof schema>) => d });
}

// ---- Logo & cover kelas (bucket class-media; path {class_id}/{logo|cover}/{uuid}.ext) ----
const kindSchema = z.enum(['logo', 'cover']);
const COL = { logo: 'logo_path', cover: 'cover_path' } as const;

async function currentPath(ctx: NonNullable<Awaited<ReturnType<typeof requireActionContext>>>, col: string) {
  const { data } = await ctx.supabase.from('classes').select(col).eq('id', ctx.classId).single();
  return ((data as unknown as Record<string, string | null> | null)?.[col]) ?? null;
}
const imagePaths = () => ['/', '/class', '/settings/class'].forEach((p) => revalidatePath(p));

export async function uploadClassImage(_p: FormState, fd: FormData): Promise<FormState> {
  const kind = kindSchema.safeParse(fd.get('kind'));
  const file = fd.get('file');
  if (!kind.success || !(file instanceof File)) return { error: 'Pilih gambar terlebih dahulu.' };
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return { error: FORBIDDEN };
  const col = COL[kind.data];
  const err = await replaceImage({
    supabase: ctx.supabase, bucket: 'class-media', dir: `${ctx.classId}/${kind.data}`, file, old: await currentPath(ctx, col),
    write: async (path) => writeResult(await ctx.supabase.from('classes').update({ [col]: path }).eq('id', ctx.classId).select('id')),
  });
  if (err) return err;
  imagePaths();
  redirect(withFlash('/settings/class', 'uploaded'));
}

export async function removeClassImage(_p: FormState, fd: FormData): Promise<FormState> {
  const kind = kindSchema.safeParse(fd.get('kind'));
  if (!kind.success) return { error: 'Data tidak ditemukan.' };
  const ctx = await requireActionContext();
  if (!ctx?.can('class.manage')) return { error: FORBIDDEN };
  const col = COL[kind.data];
  const err = await clearImage({
    supabase: ctx.supabase, bucket: 'class-media', old: await currentPath(ctx, col),
    write: async (path) => writeResult(await ctx.supabase.from('classes').update({ [col]: path }).eq('id', ctx.classId).select('id')),
  });
  if (err) return err;
  imagePaths();
  redirect(withFlash('/settings/class', 'removed'));
}
