import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CopyButton } from '@/components/copy-button';
import { DeleteButton, EntityForm } from '@/components/entity-form';
import { ExtLink, NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import { Chip, EmptyState, LinkButton, Notice, PageHeader, Section } from '@/components/ui/primitives';
import { addInventoryItem, deleteInventoryItem, revokeInventoryKey } from '@/features/inventory/actions';
import { InventoryKeyForm } from '@/features/inventory/components';
import type { Field } from '@/features/fields';
import { getClass } from '@/lib/class';
import {
  INV_KEY_QUOTA, INV_TTL_LABEL, invKeyStatus,
  type InvKeyStatus, type InvTtl,
} from '@/lib/inventory/keys';
import { createClient } from '@/lib/supabase/server';
import { formatDay, formatWhen } from '@/lib/time';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Inventory saya' };

type Item = { id: string; url: string; created_at: string };
type Key = {
  id: string; token: string; ttl: string;
  expires_at: string | null; revoked_at: string | null; created_at: string;
};

// `text`, bukan `url`: aturan produk hanya memeriksa awalan https://, tanpa
// validasi bentuk URL tambahan di browser.
const ITEM_FIELDS: Field[] = [{
  name: 'url', label: 'Tautan', type: 'text', required: true, max: 2048, full: true,
  placeholder: 'https://', hint: 'Hanya tautan yang diawali https://.',
}];

const KEY_UI: Record<InvKeyStatus, { tone: 'success' | 'warning' | 'neutral'; icon: 'check-circle' | 'hourglass' | 'x'; label: string }> = {
  active: { tone: 'success', icon: 'check-circle', label: 'Aktif' },
  expired: { tone: 'warning', icon: 'hourglass', label: 'Kedaluwarsa' },
  revoked: { tone: 'neutral', icon: 'x', label: 'Dicabut' },
};

// Inventory bersifat pribadi: tidak ada halaman jelajah dan tidak ada akses
// untuk sesama anggota tanpa inv_key. Semua keputusan akses tetap di DB.
export default async function InventoryPage() {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Finventory');
  if (viewer.status !== 'active') return <NoAccess />;

  const supabase = await createClient();
  const now = new Date();
  // Daftar dibatasi untuk tampilan, sedangkan hitungan slot aktif diambil dari
  // query count supaya riwayat key lama yang banyak tidak mengaburkannya.
  const [itemsResult, keysResult, permanentResult, timedResult, cls] = await Promise.all([
    supabase.from('inventory_items').select('id,url,created_at')
      .eq('owner_id', viewer.user.id).order('created_at', { ascending: false }).limit(500),
    supabase.from('inventory_keys')
      .select('id,token,ttl,expires_at,revoked_at,created_at')
      .eq('owner_id', viewer.user.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('inventory_keys').select('id', { count: 'exact', head: true })
      .eq('owner_id', viewer.user.id).is('revoked_at', null).is('expires_at', null),
    supabase.from('inventory_keys').select('id', { count: 'exact', head: true })
      .eq('owner_id', viewer.user.id).is('revoked_at', null).gt('expires_at', now.toISOString()),
    getClass(),
  ]);
  const items = (itemsResult.data ?? []) as Item[];
  const keys = (keysResult.data ?? []) as Key[];
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const activeCount = (permanentResult.count ?? 0) + (timedResult.count ?? 0);

  return (
    <>
      <PageHeader
        icon="link"
        title="Inventory saya"
        description="Kumpulan tautan pribadimu. Hanya kamu yang bisa membukanya dari akun; orang lain memerlukan inv_key yang kamu buat di halaman ini."
        actions={<LinkButton href="/inventory/access" variant="secondary" icon="key">Halaman akses</LinkButton>}
      />

      <Notice tone="info">
        Inventory tidak dijelajahi bersama. Setiap inv_key membuka <strong>seluruh isi inventory</strong> yang sama,
        jadi bagikan hanya kepada orang yang kamu percaya. Key bisa dicabut kapan saja.
      </Notice>

      <Section id="inventory-links" title="Tautan" icon="link"
        action={<Chip tone="outline">{items.length} tautan</Chip>}>
        <div className="stack">
          <div className="card">
            <EntityForm action={addInventoryItem} fields={ITEM_FIELDS} submit="Tambah tautan" columns={1} />
          </div>

          {items.length === 0 ? (
            <div className="card">
              <EmptyState compact icon="link" title="Inventory masih kosong">
                Tambahkan tautan pertama di atas. Hanya URL yang diawali https:// yang diterima.
              </EmptyState>
            </div>
          ) : (
            <div className="card card--flush">
              <ul className="rows">
                {items.map((item) => (
                  <li key={item.id} className="row row--wrap">
                    <div className="row__body">
                      <ExtLink href={item.url} className="row__title key-url">{item.url}</ExtLink>
                      <span className="muted">Ditambahkan {formatWhen(item.created_at, tz)}</span>
                    </div>
                    <div className="row__actions">
                      <DeleteButton action={deleteInventoryItem} id={item.id} size="sm"
                        label="Hapus" title="Hapus tautan ini?"
                        consequence="Tautan ini dihapus dari inventory dan tidak lagi tampil bagi pemegang key." />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Section>

      <Section id="inventory-keys" title="inv_key" icon="key"
        action={<Chip tone={activeCount >= INV_KEY_QUOTA ? 'warning' : 'outline'}>{activeCount}/{INV_KEY_QUOTA} aktif</Chip>}>
        <div className="stack">
          <div className="card">
            <InventoryKeyForm used={activeCount} tz={tz} />
          </div>

          <p className="muted">
            Maksimal 12 key aktif bersamaan. Key yang dicabut atau kedaluwarsa tidak menempati slot,
            jadi cabut key lama untuk membuat key baru. Saat ini {activeCount} key aktif.
          </p>

          {keys.length === 0 ? (
            <div className="card">
              <EmptyState compact icon="key" title="Belum ada inv_key">
                Buat key di atas, lalu buka halaman <strong>Akses inventory</strong> untuk mencobanya.
              </EmptyState>
            </div>
          ) : (
            <div className="card card--flush">
              <ul className="rows">
                {keys.map((key) => {
                  const status = invKeyStatus(key, now);
                  const ui = KEY_UI[status];
                  return (
                    <li key={key.id} className="row row--wrap">
                      <div className="row__body">
                        <code className="key-code">{key.token}</code>
                        <div className="meta">
                          <Chip tone={ui.tone} icon={ui.icon}>{ui.label}</Chip>
                          <span><Icon name="clock" size={14} />{INV_TTL_LABEL[key.ttl as InvTtl] ?? key.ttl}</span>
                          <span>
                            {key.expires_at
                              ? status === 'expired'
                                ? `Kedaluwarsa ${formatWhen(key.expires_at, tz)}`
                                : `Berlaku sampai ${formatWhen(key.expires_at, tz)}`
                              : 'Tanpa kedaluwarsa'}
                          </span>
                          {key.revoked_at && <span>Dicabut {formatDay(key.revoked_at, tz)}</span>}
                        </div>
                      </div>
                      <div className="row__actions">
                        <CopyButton text={key.token} label="Salin key" />
                        {status !== 'revoked' && (
                          <DeleteButton action={revokeInventoryKey} id={key.id} size="sm"
                            label="Cabut" title="Cabut inv_key ini?" confirmLabel="Cabut inv_key"
                            consequence="Siapa pun yang memegang key ini langsung kehilangan akses, dan satu slot key aktif kembali kosong." />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
