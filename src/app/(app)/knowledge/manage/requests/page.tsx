import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, LinkButton, Notice, PageHeader, Segmented } from '@/components/ui/primitives';
import {
  changeKnowledgeVisibility, decideRequest, escalateRequest, revokeEditor,
} from '@/features/knowledge/actions';
import {
  KnowledgeStatusChip, KnowledgeVisibilityChip,
} from '@/features/knowledge/components';
import { DecisionForm, EscalateForm, RevokeForm, VisibilityForm } from '@/features/knowledge/forms';
import { KB_AUDIT_LABEL, KB_REQUEST_LABEL } from '@/lib/knowledge/labels';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/time';
import { getClass } from '@/lib/class';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Permintaan & akses edit' };

type EntryRef = { id: string; title: string; slug: string; author_id: string };
type Req = {
  id: string; entry_id: string; requester_id: string; reason: string;
  escalation_reason: string | null; status: string; decided_as: string | null;
  created_at: string; knowledge_entries: EntryRef | EntryRef[] | null;
};
type Grant = {
  entry_id: string; user_id: string; expires_at: string | null; revoked_at: string | null;
  knowledge_entries: EntryRef | EntryRef[] | null;
};
type Audit = {
  id: string; action: string; reason: string | null; created_at: string; actor_id: string | null;
  knowledge_entries: { title: string; slug: string } | { title: string; slug: string }[] | null;
};
type ModEntry = { id: string; slug: string; title: string; status: string; visibility: string };

const refOf = (value: EntryRef | EntryRef[] | null): EntryRef | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;
const auditEntry = (value: Audit['knowledge_entries']) => (Array.isArray(value) ? value[0] : value) ?? null;

function RequestStatus({ status }: { status: string }) {
  const tone: 'success' | 'error' | 'accent' | 'warning' | 'neutral' =
    status === 'approved' ? 'success' : status === 'rejected' ? 'error'
      : status === 'escalated' ? 'accent' : status === 'pending_author' ? 'warning' : 'neutral';
  return <Chip tone={tone}>{KB_REQUEST_LABEL[status] ?? status}</Chip>;
}

function Panel({ id, icon, title, desc, children }: {
  id: string; icon: 'key' | 'users' | 'book-open' | 'shield' | 'eye' | 'activity'; title: string;
  desc?: string; children: React.ReactNode;
}) {
  return (
    <section className="card" aria-labelledby={id}>
      <div className="card__head">
        <div>
          <h2 id={id} className="card__title"><Icon name={icon} size={20} />{title}</h2>
          {desc && <p className="card__desc">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function KnowledgeRequestsPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=/knowledge/manage/requests');
  if (viewer.status !== 'active') return <NoAccess />;
  const uid = viewer.user.id;
  const isLeader = viewer.can('class.manage');
  const supabase = await createClient();

  const [cls, reqRes, grantRes, auditRes, allRes] = await Promise.all([
    getClass(),
    supabase.from('knowledge_edit_requests')
      .select('id,entry_id,requester_id,reason,escalation_reason,status,decided_as,created_at,' +
        'knowledge_entries(id,title,slug,author_id)')
      .order('created_at', { ascending: false }).limit(120),
    supabase.from('knowledge_editors')
      .select('entry_id,user_id,expires_at,revoked_at,knowledge_entries(id,title,slug,author_id)')
      .order('created_at', { ascending: false }).limit(120),
    isLeader
      ? supabase.from('knowledge_audit')
        .select('id,action,reason,created_at,actor_id,knowledge_entries(title,slug)')
        .order('created_at', { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
    isLeader
      ? supabase.from('knowledge_entries').select('id,slug,title,status,visibility')
        .order('updated_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] }),
  ]);
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const requests = (reqRes.data ?? []) as unknown as Req[];
  const grants = (grantRes.data ?? []) as Grant[];
  const audits = (auditRes.data ?? []) as Audit[];
  const allEntries = (allRes.data ?? []) as ModEntry[];
  const now = new Date();
  // Status kedaluwarsa diturunkan dari izin editor: tidak ada job latar yang
  // menulis ulang status permintaan, jadi UI menampilkannya dari data izin.
  const effectiveStatus = (r: Req) => {
    if (r.status !== 'approved') return r.status;
    const grant = grants.find((g) => g.entry_id === r.entry_id && g.user_id === r.requester_id);
    if (!grant || grant.revoked_at) return 'revoked';
    if (grant.expires_at && new Date(grant.expires_at) <= now) return 'expired';
    return 'approved';
  };

  const received = requests.filter((r) => refOf(r.knowledge_entries)?.author_id === uid);
  const escalated = isLeader ? requests.filter((r) => r.status === 'escalated') : [];
  const sent = requests.filter((r) => r.requester_id === uid);
  const activeGrants = grants.filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > now));
  const myGrants = activeGrants.filter((g) => g.user_id === uid);
  const authorGrants = received.length > 0 ? activeGrants.filter((g) => g.user_id !== uid) : [];

  const nameIds = [...new Set([
    ...requests.map((r) => r.requester_id), ...grants.map((g) => g.user_id),
    ...audits.map((a) => a.actor_id).filter((x): x is string => !!x),
  ])];
  const profileRes = nameIds.length > 0
    ? await supabase.from('member_profile_v').select('user_id,full_name,username').in('user_id', nameIds)
    : { data: [] };
  const names = new Map(((profileRes.data ?? []) as { user_id: string; full_name: string; username: string }[])
    .map((p) => [p.user_id, p.full_name]));
  const nameOf = (id: string | null) => (id ? names.get(id) ?? 'Anggota kelas' : 'Anggota kelas');
  const totalActionable = (isLeader ? escalated.length : 0) + received.filter((r) => r.status === 'pending_author').length;

  return (
    <>
      <PageHeader icon="key" title="Permintaan & akses edit"
        description="Tinjau permintaan menulis, beri atau cabut akses edit, dan kelola visibilitas entri."
        actions={<LinkButton href="/knowledge/manage" variant="secondary" icon="book-open">Entri saya</LinkButton>} />
      <div className="toolbar">
        <Segmented label="Bagian kelola pengetahuan" items={[
          { href: '/knowledge/manage', label: 'Entri saya', active: false, icon: 'book-open' },
          { href: '/knowledge/manage/requests', label: 'Permintaan & akses', active: true, icon: 'key' },
        ]} />
        <p className="muted" role="status">{totalActionable} permintaan menunggu tindakanmu</p>
      </div>

      {isLeader && (
        <Panel id="kb-escalated-title" icon="shield" title="Perlu keputusan Ketua"
          desc="Permintaan yang diteruskan karena penulis tidak merespons. Persetujuan Ketua memberi akses sementara 7 hari.">
          {escalated.length === 0
            ? <EmptyState compact icon="shield" title="Tidak ada eskalasi">Permintaan yang diteruskan pemohon akan muncul di sini.</EmptyState>
            : (
              <ul className="rows">
                {escalated.map((r) => {
                  const entry = refOf(r.knowledge_entries);
                  return (
                    <li key={r.id} className="row row--wrap">
                      <div className="row__body">
                        <div className="cluster"><RequestStatus status={effectiveStatus(r)} /><span className="muted">oleh {nameOf(r.requester_id)}</span></div>
                        <h3 className="kb-row__title">{entry ? <Link href={`/knowledge/${entry.slug}`} className="row__title">{entry.title}</Link> : 'Entri dihapus'}</h3>
                        <p className="muted">Alasan awal: {r.reason}</p>
                        {r.escalation_reason && <p className="muted">Alasan eskalasi: {r.escalation_reason}</p>}
                        <span className="meta"><Icon name="clock" size={14} />{formatWhen(r.created_at, tz)}</span>
                      </div>
                      <div className="row__actions"><DecisionForm action={decideRequest} requestId={r.id} mode="leader" /></div>
                    </li>
                  );
                })}
              </ul>
            )}
        </Panel>
      )}

      <Panel id="kb-received-title" icon="key" title="Permintaan masuk"
        desc="Permintaan dari anggota lain untuk entri milikmu. Setujui untuk memberi akses berkelanjutan yang bisa kamu cabut.">
        {received.length === 0
          ? <EmptyState compact icon="key" title="Belum ada permintaan">Permintaan edit untuk entri milikmu akan muncul di sini.</EmptyState>
          : (
            <ul className="rows">
              {received.map((r) => {
                const entry = refOf(r.knowledge_entries);
                return (
                  <li key={r.id} className="row row--wrap">
                    <div className="row__body">
                      <div className="cluster"><RequestStatus status={effectiveStatus(r)} /><span className="muted">dari {nameOf(r.requester_id)}</span></div>
                      <h3 className="kb-row__title">{entry ? <Link href={`/knowledge/${entry.slug}`} className="row__title">{entry.title}</Link> : 'Entri dihapus'}</h3>
                      <p className="muted">{r.reason}</p>
                      {r.escalation_reason && <p className="muted">Eskalasi: {r.escalation_reason}</p>}
                      <span className="meta"><Icon name="clock" size={14} />{formatWhen(r.created_at, tz)}{r.decided_as === 'leader' ? ' · diputuskan Ketua' : ''}</span>
                    </div>
                    {r.status === 'pending_author' && (
                      <div className="row__actions"><DecisionForm action={decideRequest} requestId={r.id} mode="author" /></div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        {authorGrants.length > 0 && (
          <div className="kb-subsection">
            <h3 className="kb-subsection__title">Editor yang disetujui</h3>
            <ul className="rows">
              {authorGrants.map((g) => {
                const entry = refOf(g.knowledge_entries);
                return (
                  <li key={`${g.entry_id}-${g.user_id}`} className="row row--wrap">
                    <div className="row__body">
                      <strong>{nameOf(g.user_id)}</strong>
                      <span className="muted">{entry ? entry.title : 'Entri dihapus'}{g.expires_at ? ` · sampai ${formatWhen(g.expires_at, tz)}` : ' · berkelanjutan'}</span>
                    </div>
                    <div className="row__actions">
                      <RevokeForm action={revokeEditor} entryId={g.entry_id} userId={g.user_id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Panel>

      <Panel id="kb-sent-title" icon="activity" title="Permintaan saya"
        desc="Status permintaan yang kamu kirim. Jika penulis tidak merespons, teruskan ke Ketua.">
        {sent.length === 0
          ? <EmptyState compact icon="activity" title="Belum ada permintaan">Buka entri anggota lain lalu pilih “Minta akses edit”.</EmptyState>
          : (
            <ul className="rows">
              {sent.map((r) => {
                const entry = refOf(r.knowledge_entries);
                return (
                  <li key={r.id} className="row row--wrap">
                    <div className="row__body">
                      <div className="cluster"><RequestStatus status={effectiveStatus(r)} /></div>
                      <h3 className="kb-row__title">{entry ? <Link href={`/knowledge/${entry.slug}`} className="row__title">{entry.title}</Link> : 'Entri dihapus'}</h3>
                      <p className="muted">{r.reason}</p>
                      <span className="meta"><Icon name="clock" size={14} />{formatWhen(r.created_at, tz)}</span>
                    </div>
                    {r.status === 'pending_author' && (
                      <div className="row__actions"><EscalateForm action={escalateRequest} requestId={r.id} /></div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </Panel>

      <Panel id="kb-my-grants-title" icon="users" title="Akses edit saya"
        desc="Entri milik anggota lain yang boleh kamu ubah. Akses sementara dari Ketua berakhir otomatis.">
        {myGrants.length === 0
          ? <EmptyState compact icon="users" title="Tidak ada akses edit tambahan">Kamu selalu bisa mengubah entri milikmu sendiri.</EmptyState>
          : (
            <ul className="rows">
              {myGrants.map((g) => {
                const entry = refOf(g.knowledge_entries);
                return (
                  <li key={g.entry_id} className="row">
                    <div className="row__body">
                      <h3 className="kb-row__title">{entry ? <Link href={`/knowledge/${entry.slug}/edit`} className="row__title">{entry.title}</Link> : 'Entri dihapus'}</h3>
                      <span className="muted">{entry ? `Milik ${nameOf(entry.author_id)}` : ''}{g.expires_at ? ` · berlaku sampai ${formatWhen(g.expires_at, tz)}` : ' · berkelanjutan'}</span>
                    </div>
                    <div className="row__actions"><LinkButton href={entry ? `/knowledge/${entry.slug}/edit` : '/knowledge/manage'} size="sm" variant="secondary" icon="pencil">Ubah</LinkButton></div>
                  </li>
                );
              })}
            </ul>
          )}
      </Panel>

      {isLeader && (
        <Panel id="kb-moderation-title" icon="eye" title="Moderasi visibilitas"
          desc="Ketua dapat mengubah visibilitas entri mana pun tanpa otomatis mendapat hak menulis isinya.">
          <Notice tone="info">Tindakan visibilitas dicatat pada jejak audit. Alasan opsional membantu penjelasan saat meninjau.</Notice>
          {allEntries.length === 0
            ? <EmptyState compact icon="book-open" title="Belum ada entri" />
            : (
              <ul className="rows">
                {allEntries.map((e) => (
                  <li key={e.id} className="row row--wrap">
                    <div className="row__body">
                      <div className="cluster">
                        <KnowledgeStatusChip status={e.status} />
                        <KnowledgeVisibilityChip visibility={e.visibility} />
                      </div>
                      <h3 className="kb-row__title"><Link href={`/knowledge/${e.slug}`} className="row__title">{e.title}</Link></h3>
                    </div>
                    <div className="row__actions">
                      <VisibilityForm action={changeKnowledgeVisibility} entryId={e.id}
                        current={e.visibility} back="/knowledge/manage/requests" allowReason />
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      )}

      {isLeader && (
        <Panel id="kb-audit-title" icon="activity" title="Jejak audit"
          desc="Hanya tindakan izin dan visibilitas; tidak ada snapshot isi entri.">
          {audits.length === 0
            ? <EmptyState compact icon="activity" title="Belum ada tindakan tercatat" />
            : (
              <ul className="kb-audit">
                {audits.map((a) => {
                  const entry = auditEntry(a.knowledge_entries);
                  return (
                    <li key={a.id}>
                      <Icon name="activity" size={16} />
                      <span>
                        <strong>{KB_AUDIT_LABEL[a.action] ?? a.action}</strong>
                        {entry && <> · <Link href={`/knowledge/${entry.slug}`}>{entry.title}</Link></>}
                        <span className="muted"> oleh {nameOf(a.actor_id)} · {formatWhen(a.created_at, tz)}</span>
                        {a.reason && <span className="kb-audit__reason">{a.reason}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
        </Panel>
      )}
    </>
  );
}
