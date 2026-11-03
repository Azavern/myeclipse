import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Chip, EmptyState, LinkButton, Notice, PageHeader, Section } from '@/components/ui/primitives';
import { ApiKeyForm, type MemberOption } from '@/features/developer/components';
import { normalizePermissions, permissionCount } from '@/lib/api/permissions';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/time';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Developer API' };

type KeyRow = {
  id: string; name: string; prefix: string; permissions: unknown; scope: unknown;
  status: string; created_at: string; last_used_at: string | null; revoked_at: string | null;
};

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'Aktif', tone: 'success' },
  disabled: { label: 'Nonaktif', tone: 'warning' },
  revoked: { label: 'Dicabut', tone: 'neutral' },
};

export default async function DeveloperPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fsettings%2Fdeveloper');
  if (!viewer.can('class.manage')) return <NoAccess />;

  const supabase = await createClient();
  const [keysResult, membersResult, cls] = await Promise.all([
    supabase.from('api_keys')
      .select('id,name,prefix,permissions,scope,status,created_at,last_used_at,revoked_at')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('member_profile_v').select('user_id,full_name,status')
      .eq('status', 'active').order('full_name').limit(200),
    getClass(),
  ]);

  const keys = (keysResult.data ?? []) as KeyRow[];
  const members: MemberOption[] = ((membersResult.data ?? []) as { user_id: string; full_name: string }[])
    .map((row) => ({ id: row.user_id, name: row.full_name }));
  const tz = cls?.timezone ?? 'Asia/Jakarta';

  return (
    <>
      <PageHeader
        icon="code"
        title="Developer API"
        description="Buat API key untuk aplikasi eksternal. Izin dan cakupan data diatur terpisah, dan secret hanya tampil sekali."
      />

      <Notice tone="info">
        API v1 mencakup data kelas non-media. Cloud/Google Drive, kredensial, perubahan role, penghapusan akun,
        dan seluruh unggahan media sengaja tidak dapat diakses lewat API key.
      </Notice>

      <Section id="new-key" title="Buat API key" icon="key">
        <div className="card">
          <ApiKeyForm mode="create" members={members} />
        </div>
      </Section>

      <Section id="keys" title="Daftar API key" icon="code"
        action={<Chip tone="outline">{keys.length} key</Chip>}>
        {keys.length === 0 ? (
          <div className="card">
            <EmptyState icon="key" title="Belum ada API key" compact>
              Buat key pertama di atas. Setiap key bisa diberi izin dan cakupan yang berbeda.
            </EmptyState>
          </div>
        ) : (
          <div className="card card--flush">
            <ul className="rows">
              {keys.map((key) => {
                const status = STATUS_LABEL[key.status] ?? { label: 'Dicabut', tone: 'neutral' as const };
                const count = permissionCount(normalizePermissions(key.permissions));
                return (
                  <li key={key.id} className="row row--wrap">
                    <div className="row__body">
                      <span className="row__title">{key.name}</span>
                      <span className="muted">
                        <code>ecl_{key.prefix}_…</code> · {count} izin
                        {key.last_used_at ? ` · terakhir dipakai ${formatWhen(key.last_used_at, tz)}` : ' · belum pernah dipakai'}
                      </span>
                    </div>
                    <Chip tone={status.tone}>{status.label}</Chip>
                    <div className="row__actions">
                      <LinkButton href={`/settings/developer/${key.id}`} variant="secondary" size="sm" icon="pencil">
                        Kelola
                      </LinkButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Section>
    </>
  );
}
