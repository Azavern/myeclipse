import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { EntityForm } from '@/components/entity-form';
import { NoAccess } from '@/components/states';
import { PageHeader, Notice } from '@/components/ui/primitives';
import { requestEdit } from '@/features/knowledge/actions';
import type { Field } from '@/features/fields';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Minta akses edit' };

const fields: Field[] = [{
  name: 'reason', label: 'Alasan permintaan', type: 'textarea', required: true, min: 5, max: 500,
  full: true, hint: 'Jelaskan apa yang ingin kamu perbaiki atau tambahkan. 5–500 karakter.',
}];

export default async function RequestEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer.user) redirect(`/login?next=${encodeURIComponent(`/knowledge/${slug}/request-edit`)}`);
  if (viewer.status !== 'active') return <NoAccess />;

  const supabase = await createClient();
  const { data, error } = await supabase.from('knowledge_entries')
    .select('id,slug,title,author_id,status').eq('slug', slug).maybeSingle();
  const entry = data as { id: string; slug: string; title: string; author_id: string; status: string } | null;
  if (error || !entry) notFound();
  if (entry.author_id === viewer.user.id) redirect(`/knowledge/${entry.slug}/edit`);

  const [grantRes, pendingRes] = await Promise.all([
    supabase.from('knowledge_editors').select('id,revoked_at,expires_at')
      .eq('entry_id', entry.id).eq('user_id', viewer.user.id).maybeSingle(),
    supabase.from('knowledge_edit_requests').select('id,status')
      .eq('entry_id', entry.id).eq('requester_id', viewer.user.id)
      .in('status', ['pending_author', 'escalated']).maybeSingle(),
  ]);
  const grant = grantRes.data as { revoked_at: string | null; expires_at: string | null } | null;
  if (grant && !grant.revoked_at && (!grant.expires_at || new Date(grant.expires_at) > new Date())) {
    redirect(`/knowledge/${entry.slug}/edit`);
  }
  if (pendingRes.data) redirect(`/knowledge/${entry.slug}`);

  const back = `/knowledge/${entry.slug}`;
  return (
    <>
      <PageHeader crumbs={[{ label: 'Knowledge', href: '/knowledge' }, { label: entry.title, href: back }, { label: 'Minta akses' }]}
        icon="key" title="Minta akses edit"
        description="Penulis dapat menyetujui atau menolak. Akses yang disetujui berlaku sampai dicabut." />
      <div className="form-layout">
        <div className="stack">
          <Notice tone="info">
            Permintaan ini dikirim ke penulis <strong>{entry.title}</strong>. Jika penulis tidak merespons, kamu dapat meneruskannya ke Ketua dari halaman kelola.
          </Notice>
          <section className="card" aria-label="Formulir permintaan akses">
            <EntityForm action={requestEdit} fields={fields} submit="Kirim permintaan"
              hidden={{ id: entry.id }} cancelHref={back} columns={1} />
          </section>
        </div>
      </div>
    </>
  );
}
