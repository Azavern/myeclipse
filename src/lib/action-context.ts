import 'server-only';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

// Konteks aksi: sesi tervalidasi (getUser) + anggota aktif. class_id dari DB, tidak pernah dari input.
export async function requireActionContext() {
  const [supabase, viewer, cls] = await Promise.all([createClient(), getViewer(), getClass()]);
  // Sesi aal1 dari akun yang punya faktor 2FA belum boleh menjalankan aksi apa pun.
  if (!viewer.user || viewer.status !== 'active' || !cls || viewer.mfaPending) return null;
  return { supabase, user: viewer.user, can: viewer.can, classId: cls.id, className: cls.name, timezone: cls.timezone };
}
