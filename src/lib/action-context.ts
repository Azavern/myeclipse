import 'server-only';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

// Konteks aksi: sesi tervalidasi (getUser) + anggota aktif. class_id dari DB, tidak pernah dari input.
export async function requireActionContext() {
  const [supabase, viewer, cls] = await Promise.all([createClient(), getViewer(), getClass()]);
  if (!viewer.user || viewer.status !== 'active' || !cls) return null;
  return { supabase, user: viewer.user, can: viewer.can, classId: cls.id, className: cls.name, timezone: cls.timezone };
}
