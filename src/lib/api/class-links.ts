import { z } from 'zod';
import { SOCIAL_PLATFORMS, socialHostOk } from '@/lib/social';
import { httpsUrl } from './fields';

export const CLASS_LINK_FIELDS = 'id,platform,label,url,created_at';

const base = z.object({
  platform: z.enum([...SOCIAL_PLATFORMS]),
  label: z.string().trim().max(40).nullable().optional(),
  url: httpsUrl,
}).strict();

export const classLinkSchema = base.superRefine((value, ctx) => {
  if (!socialHostOk(value.platform, value.url)) {
    ctx.addIssue({ code: 'custom', path: ['url'], message: 'Tautan tidak cocok dengan platform yang dipilih.' });
  }
  if (value.platform === 'custom' && !value.label) {
    ctx.addIssue({ code: 'custom', path: ['label'], message: 'Nama tautan wajib diisi untuk platform custom.' });
  }
});

export const classLinkPatchSchema = base.partial();
