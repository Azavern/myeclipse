import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type ClassIdentity = {
  id: string; name: string; timezone: string;
  tagline: string | null; description: string | null; code: string | null;
  theme: unknown; logo_path: string | null; cover_path: string | null;
};
export const getClass = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from('class_identity_v')
    .select('id,name,timezone,tagline,description,code,theme,logo_path,cover_path').single();
  return data as ClassIdentity | null;
});
