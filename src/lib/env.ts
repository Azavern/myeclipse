import 'server-only';
import { z } from 'zod';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1), // hanya dipakai lib/supabase/admin.ts
  APP_URL: z.string().url(),
});
export const env = { ...schema.parse(process.env), IS_PROD: process.env.NODE_ENV === 'production' };
