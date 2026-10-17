import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getClass } from '@/lib/class';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';
import { DeleteButton, EntityForm } from '@/components/entity-form';
import { NoAccess } from '@/components/states';
import { Icon, type IconName } from '@/components/ui/icon';
import { PageHeader, type Crumb } from '@/components/ui/primitives';
import type { Field, Row } from '@/features/fields';
import { cx } from '@/lib/cx';
import type { FormState } from '@/lib/form-state';

type Action = (p: FormState, fd: FormData) => Promise<FormState>;
type Common = { perm: string | null; next: string; title: string; description?: string; icon?: IconName; parent: Crumb & { href: string }; tips?: string[]; columns?: 1 | 2; after?: ReactNode };

async function gate(perm: string | null, next: string) {
  const v = await getViewer();
  if (!v.user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return (perm ? v.can(perm) : v.status === 'active') ? null : <NoAccess />;
}

// Kerangka halaman form: breadcrumb, judul, kartu form, dan (bila ada) panel tips di samping.
function FormPage({ o, children, extra }: { o: Common; children: ReactNode; extra?: ReactNode }) {
  return (
    <>
      <PageHeader crumbs={[{ label: o.parent.label, href: o.parent.href }, { label: o.title }]} icon={o.icon} title={o.title} description={o.description} />
      <div className={cx('form-layout', o.tips && 'form-layout--aside')}>
        <div className="stack">
          <section className="card" aria-label="Formulir">{children}</section>
          {o.after}
          {extra}
        </div>
        {o.tips && (
          <aside className="card card--tint" aria-labelledby="tips-title">
            <h2 id="tips-title" className="card__title"><Icon name="info" size={20} />Tips</h2>
            <ul className="aside-list">
              {o.tips.map((t) => <li key={t}><Icon name="check-circle" size={16} /><span>{t}</span></li>)}
            </ul>
          </aside>
        )}
      </div>
    </>
  );
}

export async function ManageNew(o: Common & { action: Action; fields: Field[]; submit?: string }) {
  return (await gate(o.perm, o.next)) ?? (
    <FormPage o={o}>
      <EntityForm action={o.action} fields={o.fields} submit={o.submit ?? 'Simpan'} cancelHref={o.parent.href} columns={o.columns} />
    </FormPage>
  );
}

export async function ManageEdit(o: Omit<Common, 'after'> & {
  ownerOnly?: boolean; id: string; table: string; consequence?: string; deleteTitle?: string; extraCols?: string[];
  action: Action; remove?: Action; fieldsFor: (r: Row | null, tz: string) => Field[];
  after?: (row: Row) => ReactNode | Promise<ReactNode>; // bagian tambahan (mis. unggah gambar) di bawah form
}) {
  const denied = await gate(o.perm, o.next);
  if (denied) return denied;
  const tz = (await getClass())?.timezone ?? 'Asia/Jakarta';
  const cols = [...o.fieldsFor(null, tz).map((f) => f.name), ...(o.extraCols ?? [])].join(',');
  const uid = (await getViewer()).user?.id ?? '';
  const q = (await createClient()).from(o.table).select(cols).eq('id', o.id);
  const { data } = await (o.ownerOnly ? q.eq('user_id', uid) : q).maybeSingle();
  if (!data) notFound();
  const row = data as unknown as Row;
  const after = o.after ? await o.after(row) : undefined;
  return (
    <FormPage o={{ ...o, after }} extra={o.remove && (
      <section className="card danger-zone" aria-labelledby="danger-title">
        <div className="card__head">
          <h2 id="danger-title" className="card__title"><Icon name="alert-triangle" size={20} />Hapus</h2>
        </div>
        <div className="zone">
          <p className="muted">{o.consequence ?? 'Data ini akan dihapus.'}</p>
          <DeleteButton action={o.remove} id={o.id} consequence={o.consequence ?? ''} title={o.deleteTitle} />
        </div>
      </section>
    )}>
      <EntityForm action={o.action} fields={o.fieldsFor(row, tz)} submit="Simpan perubahan" hidden={{ id: o.id }} cancelHref={o.parent.href} columns={o.columns} />
    </FormPage>
  );
}
