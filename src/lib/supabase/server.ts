import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { CookieToSet } from './cookie-types';

// Klien berbasis JWT user: RLS tetap berlaku (blueprint §3.2, §9.2).
export const createClient = cache(async () => {
  const store = await cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          for (const { name, value, options } of list)
            store.set(name, value, { ...options, httpOnly: true, sameSite: 'lax', secure: env.IS_PROD, path: '/' });
        } catch { /* dipanggil dari Server Component; refresh dilakukan proxy */ }
      },
    },
  });
});
