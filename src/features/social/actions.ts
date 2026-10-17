'use server';
import { z } from 'zod';
import { runDelete, runSave } from '@/lib/crud';
import { failState, type FormState } from '@/lib/form-state';
import { idOf, optText, optUrl } from '@/lib/zod-fields';
import { AUDIENCES } from '@/lib/visibility/audiences';

const HOSTS: Record<string, string[]> = {
  instagram: ['instagram.com'], linkedin: ['linkedin.com'], github: ['github.com'], tiktok: ['tiktok.com'], x: ['x.com', 'twitter.com'],
};
const hostOk = (platform: string, url: string) => {
  const allowed = HOSTS[platform];
  const host = new URL(url).hostname.replace(/^www\./, '');
  return !allowed || allowed.some((d) => host === d || host.endsWith(`.${d}`));
};
const schema = z.object({
  platform: z.enum(['instagram', 'linkedin', 'github', 'tiktok', 'x', 'website', 'custom']),
  label: optText(40), url: optUrl,
  visibility: z.enum(AUDIENCES).or(z.literal('')).optional().transform((v) => v || null),
}).superRefine((v, ctx) => {
  if (!v.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Tautan wajib diisi.' });
  else if (!hostOk(v.platform, v.url)) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Tautan tidak cocok dengan platform yang dipilih.' });
  if (v.platform === 'custom' && !v.label) ctx.addIssue({ code: 'custom', path: ['label'], message: 'Nama tautan wajib diisi.' });
});
const base = { perm: null, owned: true, table: 'social_links', schema, paths: ['/settings/profile', '/members'], to: '/settings/profile', build: (d: z.infer<typeof schema>) => d };

export async function createSocialLink(_p: FormState, fd: FormData) { return runSave({ ...base, fd }); }
export async function updateSocialLink(_p: FormState, fd: FormData) {
  const id = idOf(fd);
  return id ? runSave({ ...base, fd, id }) : failState('Data tidak ditemukan.', fd);
}
export async function deleteSocialLink(_p: FormState, fd: FormData) {
  return runDelete({ fd, id: idOf(fd), perm: null, owned: true, table: base.table, paths: base.paths, to: base.to });
}
