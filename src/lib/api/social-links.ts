import { z } from 'zod';
import { SOCIAL_PLATFORMS, socialHostOk } from '@/lib/social';
import { AUDIENCES } from '@/lib/visibility/audiences';
import { httpsUrl } from './fields';

export const SOCIAL_LINK_FIELDS = 'id,user_id,platform,label,url,visibility,created_at,updated_at';

const base = z.object({
  platform: z.enum([...SOCIAL_PLATFORMS]),
  label: z.string().trim().max(40).nullable().optional(),
  url: httpsUrl,
  visibility: z.enum([...AUDIENCES]).nullable().optional(),
}).strict();

export const socialLinkSchema = base.superRefine((value, ctx) => {
  if (!socialHostOk(value.platform, value.url)) {
    ctx.addIssue({ code: 'custom', path: ['url'], message: 'Tautan tidak cocok dengan platform yang dipilih.' });
  }
  if (value.platform === 'custom' && !value.label) {
    ctx.addIssue({ code: 'custom', path: ['label'], message: 'Nama tautan wajib diisi untuk platform custom.' });
  }
});

export const socialLinkPatchSchema = base.partial();
