import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Chip, EmptyState, LinkButton, Notice, PageHeader, Section } from '@/components/ui/primitives';
import { ApiKeyForm, KeyLifecycle, type MemberOption } from '@/features/developer/components';
import { normalizePermissions, normalizeScope } from '@/lib/api/permissions';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/time';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Kelola API key' };

type KeyRow = {
  id: string; name: string; prefix: string; permissions: unknown; scope: unknown;
  status: string; created_at: string; updated_at: string;
  last_used_at: string | null; revoked_at: string | null;
};

type AuditRow = {
  id: number; method: string; path: string; resource: string | null;
  status_code: number; duration_ms: number; created_at: string;
};

export default async function DeveloperKeyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/login?next=${encodeURIComponent(`/settings/developer/${id}`)}`);
  if (!viewer.can('class.manage')) return <NoAccess />;

  const supabase = await createClient();
  const { data, error } = await supabase.from('api_keys')
    .select('id,name,prefix,permissions,scope,status,created_at,updated_at,last_used_at,revoked_at')
    .eq('id', id).maybeSingle();
  if (error || !data) notFound();
  const key = data as KeyRow;

  const [selectedResult, membersResult, auditResult, cls] = await Promise.all([
    supabase.from('api_key_members').select('user_id').eq('key_id', id),
    supabase.from('member_profile_v').select('user_id,full_name,status')
      .eq('status', 'active').order('full_name').limit(200),
    supabase.from('api_audit_log')
      .select('id,method,path,resource,status_code,duration_ms,created_at')
      .eq('api_key_id', id).order('created_at', { ascending: false }).limit(20),
    getClass(),
  ]);

  const members: MemberOption[] = ((membersResult.data ?? []) as { user_id: string; full_name: string }[])
    .map((row) => ({ id: row.user_id, name: row.full_name }));
  const selected = (selectedResult.data ?? []).map((row) => (row as { user_id: string }).user_id);
  const audit = (auditResult.data ?? []) as AuditRow[];
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const revoked = key.status === 'revoked';

  return (
    <>
      <PageHeader
        icon="code"
        title={key.name}
        description={<>Key <code>ecl_{key.prefix}_…</code> · dibuat {formatWhen(key.created_at, tz)}{key.last_used_at ? ` · terakhir dipakai ${formatWhen(key.last_used_at, tz)}` : ''}</>}
        actions={<LinkButton href="/settings/developer" variant="secondary" icon="arrow-left">Kembali</LinkButton>}
      />

      {revoked && (
        <Notice tone="warning">
          Key ini sudah dicabut dan tidak bisa diaktifkan kembali. Izin dan cakupan dikunci.
        </Notice>
      )}

      <Section id="key-settings" title="Izin dan cakupan" icon="shield">
        <div className="card">
          <ApiKeyForm
            mode="update"
            id={key.id}
            members={members}
            disabled={revoked}
            defaults={{
              name: key.name,
              permissions: normalizePermissions(key.permissions),
              scope: normalizeScope(key.scope),
              memberIds: selected,
            }}
          />
        </div>
      </Section>

      <KeyLifecycle id={key.id} status={key.status} />

      <Section id="key-audit" title="Aktivitas terakhir" icon="activity"
        action={<Chip tone="outline">{audit.length} catatan</Chip>}>
        {audit.length === 0 ? (
          <div className="card">
            <EmptyState icon="activity" title="Belum ada aktivitas" compact>
              Permintaan yang memakai key ini akan tercatat di sini, tanpa header atau isi body.
            </EmptyState>
          </div>
        ) : (
          <div className="card card--flush">
            <ul className="rows">
              {audit.map((row) => (
                <li key={row.id} className="row row--wrap">
                  <div className="row__body">
                    <span className="row__title">
                      {row.method} {row.path}
                    </span>
                    <span className="muted">
                      {row.resource ?? 'whoami'} · status {row.status_code} · {row.duration_ms} ms · {formatWhen(row.created_at, tz)}
                    </span>
                  </div>
                  <Chip tone={row.status_code < 400 ? 'success' : row.status_code < 500 ? 'warning' : 'error'}>
                    {row.status_code}
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <p className="muted">
        Dokumentasi endpoint ada di <code>docs/api-reference.md</code>, dan aturan keamanan di{' '}
        <code>docs/api-security.md</code>. <Link href="/settings/class">Kembali ke pengaturan kelas</Link>.
      </p>
    </>
  );
}
