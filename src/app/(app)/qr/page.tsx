import type { Metadata } from 'next';
import { EmptyState, PageHeader, Section } from '@/components/ui/primitives';
import { QrStudioEntry } from '@/features/qr/entry';
import { QrQrisForm, RemoveQrStudioQrisDialog } from '@/features/qr/qris-settings';
import { getClass } from '@/lib/class';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'QR Studio' };

type AccessRow = { can_manage: boolean; qris_available: boolean };

// Halaman publik: tamu memakai render server tanpa preview; anggota aktif
// memakai renderer browser seperti sebelumnya. QRIS donasi hanya diatur
// Bendahara/pemegang kas.manage atau Ketua.
export default async function QrPage() {
  const [cls, viewer] = await Promise.all([getClass(), getViewer()]);
  const member = !!viewer.user && viewer.status === 'active' && !viewer.mfaPending;
  const supabase = await createClient();
  const accessRes = await supabase.rpc('get_qr_studio_access');
  const access = ((accessRes.data ?? [])[0] ?? { can_manage: false, qris_available: false }) as AccessRow;
  const canManage = member && access.can_manage === true;

  let qrisUrl: string | undefined;
  if (canManage) {
    const settings = await supabase.from('qr_studio_settings')
      .select('qris_path').maybeSingle();
    const path = (settings.data as { qris_path: string | null } | null)?.qris_path;
    if (path) qrisUrl = (await signMany(supabase, 'qr-studio-media', [path])).get(path);
  }

  return (
    <>
      <PageHeader
        icon="qr"
        title="QR Studio"
        description={member
          ? 'Buat QR normal atau custom dengan pratinjau langsung, lalu simpan gambarnya untuk dibagikan.'
          : 'Buat QR normal atau custom tanpa login. QR diproses di server; pratinjau langsung tersedia untuk anggota kelas.'}
      />

      <QrStudioEntry member={member} tz={cls?.timezone ?? 'Asia/Jakarta'} />

      {canManage && (
        <Section id="qr-studio-qris" title="QRIS donasi QR Studio" icon="qr" className="qr-qris-section">
          <div className="card stack stack--sm">
            {qrisUrl ? (
              <div className="qr-donation-qris qr-donation-qris--manage">
                <img src={qrisUrl} alt="Gambar QRIS donasi QR Studio" width={720} height={720} />
              </div>
            ) : (
              <EmptyState compact slim icon="qr" title="QRIS donasi belum diatur">
                Unggah gambar QRIS agar tamu bisa memilih donasi sebelum membuat QR.
              </EmptyState>
            )}
            <p className="muted">
              Gambar ini terpisah dari QRIS kas dan hanya dikirim ke tamu lewat tautan bertanda tangan setelah mereka memilih donasi.
            </p>
            <div className="qr-qris-manage">
              <QrQrisForm hasQris={!!qrisUrl} />
              {qrisUrl && <RemoveQrStudioQrisDialog />}
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
