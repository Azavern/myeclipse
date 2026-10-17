import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Hanya untuk Auth Admin API (createUser, generateLink, getUserById, deleteUser) — bukan query konten (blueprint §3.2).
export const createAdminClient = () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
