import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoAccess } from '@/components/states';
import { Icon } from '@/components/ui/icon';
import {
  Avatar, Chip, EmptyState, Notice, PageHeader, Section, StatTile,
} from '@/components/ui/primitives';
import {
  AddMembersForm, ApproveForm, CancelBillDialog, CancelTransactionDialog, CreateBillForm,
  DepositForm, MarkPaidButton, PaymentDialog, QrisForm, RejectDialog, RemoveQrisDialog,
  TransactionForm,
} from '@/features/kas/components';
import { getClass } from '@/lib/class';
import {
  KAS_BILL_STATUS, KAS_BILL_UI, KAS_METHODS, KAS_SUBMISSION_STATUS, addDaysIso, canSubmitBill,
  formatDateOnly, formatRupiah, formatSignedRupiah, isPastDue, todayInZone,
} from '@/lib/kas/format';
import { signMany } from '@/lib/storage/sign';
import { createClient } from '@/lib/supabase/server';
import { formatWhen } from '@/lib/time';
import { getViewer, getVisibilityMap } from '@/lib/visibility/server';

export const metadata: Metadata = { title: 'Kas kelas' };

type AccessRow = { can_manage: boolean; can_read_all: boolean };
type Summary = {
  balance: number; month_income: number; month_expense: number;
  own_unpaid: number; own_pending: number; pending_verifications: number;
};
type BillRow = {
  id: string; title: string; amount: number; due_on: string;
  status: 'open' | 'closed' | 'cancelled'; cancel_reason: string | null;
};
type BillMemberRow = {
  id: string; bill_id: string; user_id: string | null; member_name: string;
  status: keyof typeof KAS_BILL_STATUS; rejection_reason: string | null;
  paid_at: string | null; added_at: string;
};
type SubmissionRow = {
  id: string; bill_member_id: string | null; user_id: string; member_name: string;
  kind: 'bill' | 'deposit'; amount: number; method: keyof typeof KAS_METHODS;
  note: string | null; proof_path: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  late: boolean; rejection_reason: string | null; submitted_at: string; reviewed_at: string | null;
};
type TxRow = {
  id: string; direction: 'income' | 'expense'; amount: number; category: string;
  description: string; occurred_on: string; source: 'contribution' | 'deposit' | 'manual';
  bill_member_id: string | null; submission_id: string | null;
  status: 'active' | 'cancelled'; cancel_reason: string | null; created_at: string;
};
type MemberRow = { user_id: string; full_name: string; username: string | null };

const statusMeta = (status: BillMemberRow['status']) => {
  switch (status) {
    case 'paid': return { tone: 'success' as const, icon: 'check-circle' as const };
    case 'pending': return { tone: 'warning' as const, icon: 'hourglass' as const };
    case 'rejected': return { tone: 'error' as const, icon: 'alert-circle' as const };
    default: return { tone: 'neutral' as const, icon: 'clock' as const };
  }
};
const billTone = (status: BillRow['status']) =>
  status === 'open' ? 'brand' as const : status === 'closed' ? 'success' as const : 'neutral' as const;

export default async function KasPage({ searchParams }: { searchParams: Promise<{ saldo?: string }> }) {
  const viewer = await getViewer();
  if (!viewer.user) redirect('/login?next=%2Fkas');
  if (viewer.status !== 'active') return <NoAccess />;
  const map = await getVisibilityMap();
  if (map.get('page.kas') !== true) return <NoAccess />;

  const sp = await searchParams;
  const supabase = await createClient();
  const accessRes = await supabase.rpc('get_kas_access');
  if (accessRes.error) throw new Error('Data akses kas tidak terbaca.');
  const access = ((accessRes.data ?? [])[0] ?? { can_manage: false, can_read_all: false }) as AccessRow;
  const canManage = access.can_manage === true;
  const canReadAll = access.can_read_all === true;

  const [cls, summaryRes, billsRes, billMembersRes, submissionsRes, txRes, settingsRes, receiptsRes, membersRes] = await Promise.all([
    getClass(),
    supabase.rpc('get_kas_summary'),
    supabase.from('kas_bills').select('id,title,amount,due_on,status,cancel_reason')
      .order('created_at', { ascending: false }).limit(100),
    supabase.from('kas_bill_members')
      .select('id,bill_id,user_id,member_name,status,rejection_reason,paid_at,added_at')
      .order('added_at', { ascending: false }).limit(800),
    supabase.from('kas_submissions')
      .select('id,bill_member_id,user_id,member_name,kind,amount,method,note,proof_path,status,late,rejection_reason,submitted_at,reviewed_at')
      .order('submitted_at', { ascending: false }).limit(500),
    supabase.from('kas_transactions')
      .select('id,direction,amount,category,description,occurred_on,source,bill_member_id,submission_id,status,cancel_reason,created_at')
      .order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(100),
    supabase.from('kas_settings').select('qris_path').maybeSingle(),
    supabase.from('kas_receipts').select('transaction_id,path'),
    canReadAll ? supabase.rpc('get_kas_members') : Promise.resolve({ data: [] }),
  ]);
  if (summaryRes.error) throw new Error('Ringkasan kas tidak terbaca.');

  const summary = ((summaryRes.data ?? [])[0] ?? {
    balance: 0, month_income: 0, month_expense: 0, own_unpaid: 0, own_pending: 0, pending_verifications: 0,
  }) as Summary;
  const bills = (billsRes.data ?? []) as BillRow[];
  const billMembers = (billMembersRes.data ?? []) as BillMemberRow[];
  const submissions = (submissionsRes.data ?? []) as SubmissionRow[];
  const transactions = (txRes.data ?? []) as TxRow[];
  const receipts = (receiptsRes.data ?? []) as { transaction_id: string; path: string }[];
  const members = (membersRes.data ?? []) as MemberRow[];
  const qrisPath = ((settingsRes.data ?? null) as { qris_path: string | null } | null)?.qris_path ?? null;
  const tz = cls?.timezone ?? 'Asia/Jakarta';
  const today = todayInZone(tz);
  const balance = Number(summary.balance ?? 0);
  const negative = balance < 0 || sp.saldo === 'negatif';

  const billById = new Map(bills.map((bill) => [bill.id, bill]));
  const submissionById = new Map(submissions.map((submission) => [submission.id, submission]));
  const membersByBill = new Map<string, BillMemberRow[]>();
  for (const member of billMembers) {
    const list = membersByBill.get(member.bill_id) ?? [];
    list.push(member);
    membersByBill.set(member.bill_id, list);
  }
  const latestForBillMember = new Map<string, SubmissionRow>();
  for (const submission of submissions) {
    if (submission.bill_member_id && !latestForBillMember.has(submission.bill_member_id)) {
      latestForBillMember.set(submission.bill_member_id, submission);
    }
  }
  const receiptByTx = new Map(receipts.map((receipt) => [receipt.transaction_id, receipt.path]));
  const myBillMembers = billMembers
    .filter((member) => member.user_id === viewer.user?.id)
    .sort((a, b) => (billById.get(a.bill_id)?.due_on ?? '').localeCompare(billById.get(b.bill_id)?.due_on ?? ''));
  const pending = canReadAll ? submissions.filter((submission) => submission.status === 'pending') : [];
  const myDeposits = submissions.filter((submission) => submission.kind === 'deposit' && submission.user_id === viewer.user?.id);

  const [qrisUrls, proofUrls, receiptUrls] = await Promise.all([
    signMany(supabase, 'kas-media', [qrisPath]),
    signMany(supabase, 'kas-media', submissions.map((submission) => submission.proof_path)),
    signMany(supabase, 'kas-media', receipts.map((receipt) => receipt.path)),
  ]);
  const qrisUrl = qrisPath ? qrisUrls.get(qrisPath) : undefined;
  const memberOptions = members.map((member) => ({
    id: member.user_id, name: member.full_name, username: member.username ?? '',
  }));

  return (
    <>
      <PageHeader icon="wallet" title="Kas kelas"
        description={canReadAll
          ? 'Saldo, iuran, dan seluruh catatan kelas. Hanya pemegang izin kelola kas yang dapat mengubah catatan.'
          : 'Lihat saldo dan riwayat kas kelas, lalu ajukan pembayaran iuranmu.'} />

      {negative && (
        <Notice tone="warning" role="status">
          Saldo kas saat ini minus. Catatan tetap boleh disimpan, tetapi Bendahara perlu meninjau pemasukan dan pengeluaran.
        </Notice>
      )}

      <div className="stat-grid kas-summary">
        <StatTile icon="wallet" label="Saldo kas" value={formatRupiah(balance)} tone={balance < 0 ? 'warning' : 'brand'} />
        <StatTile icon="download" label="Masuk bulan ini" value={formatRupiah(summary.month_income)} tone="success" />
        <StatTile icon="upload" label="Keluar bulan ini" value={formatRupiah(summary.month_expense)} tone="accent" />
        <StatTile icon="clock" label="Iuran belum dibayar" value={summary.own_unpaid} tone={summary.own_unpaid > 0 ? 'warning' : 'neutral'} />
      </div>

      {canReadAll && (canManage || pending.length > 0) && (
        <Section id="kas-pending" title={canManage ? 'Menunggu verifikasi' : 'Pengajuan menunggu verifikasi'}
          icon="hourglass" className="kas-section"
          action={<Chip tone={pending.length ? 'warning' : 'neutral'}>{pending.length} pengajuan</Chip>}>
          {pending.length === 0 ? (
            <EmptyState compact slim icon="check-circle" title="Tidak ada pengajuan menunggu">
              Setoran dan iuran baru akan muncul di sini sebelum masuk saldo.
            </EmptyState>
          ) : (
            <div className="card card--flush">
              <ul className="rows">
                {pending.map((submission) => {
                  const billMember = submission.bill_member_id
                    ? billMembers.find((member) => member.id === submission.bill_member_id)
                    : null;
                  const bill = billMember ? billById.get(billMember.bill_id) : null;
                  const proof = submission.proof_path ? proofUrls.get(submission.proof_path) : undefined;
                  return (
                    <li className="row row--wrap kas-pending" key={submission.id}>
                      <Avatar name={submission.member_name} size="sm" />
                      <div className="row__body">
                        <div className="row__title">
                          {submission.member_name}
                          <Chip tone="outline">{submission.kind === 'deposit' ? 'Setoran QRIS' : 'Iuran'}</Chip>
                          {submission.late && <Chip tone="warning">Terlambat</Chip>}
                        </div>
                        <p className="row__meta">
                          {submission.kind === 'bill' ? `Iuran ${bill?.title ?? 'kelas'} · ` : 'Setoran kas · '}
                          {formatWhen(submission.submitted_at, tz)} · {KAS_METHODS[submission.method]}
                        </p>
                        {submission.note && <p className="kas-note">{submission.note}</p>}
                        {proof && <a className="kas-evidence" href={proof} target="_blank" rel="noopener noreferrer">Lihat bukti</a>}
                      </div>
                      <div className="row__actions kas-pending__actions">
                        <strong className="kas-amount">{formatRupiah(submission.amount)}</strong>
                        {canManage && (
                          <div className="cluster">
                            <ApproveForm id={submission.id} />
                            <RejectDialog id={submission.id} name={submission.member_name} />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Section>
      )}

      <div className="kas-layout">
        <div className="kas-main">
          <Section id="kas-dues" title="Iuran saya" icon="wallet" className="kas-section"
            action={<div className="cluster">
              <Chip tone={summary.own_unpaid > 0 ? 'warning' : 'neutral'}>{summary.own_unpaid} belum dibayar</Chip>
              {summary.own_pending > 0 && <Chip tone="warning" icon="hourglass">{summary.own_pending} menunggu</Chip>}
            </div>}>
            {myBillMembers.length === 0 ? (
              <EmptyState compact slim icon="check-circle" title="Belum ada iuran untukmu">
                Ketua atau Bendahara akan menambahkan tagihan bila ada iuran kelas.
              </EmptyState>
            ) : (
              <div className="stack stack--sm">
                {myBillMembers.map((member) => {
                  const bill = billById.get(member.bill_id);
                  if (!bill) return null;
                  const meta = statusMeta(member.status);
                  const latest = latestForBillMember.get(member.id);
                  const proof = latest?.proof_path ? proofUrls.get(latest.proof_path) : undefined;
                  const late = latest?.late || (member.status !== 'paid' && bill.status === 'open' && isPastDue(bill.due_on, today));
                  const cancelled = bill.status === 'cancelled';
                  return (
                    <article className="card kas-bill" key={member.id} aria-labelledby={`bill-${member.id}`}>
                      <div className="kas-bill__head">
                        <div>
                          <h3 id={`bill-${member.id}`}>{bill.title}</h3>
                          <p className="muted">Jatuh tempo {formatDateOnly(bill.due_on, tz)}</p>
                        </div>
                        <div className="cluster">
                          {cancelled
                            ? <Chip icon="archive">Dibatalkan</Chip>
                            : <Chip tone={meta.tone} icon={meta.icon}>{KAS_BILL_STATUS[member.status]}</Chip>}
                          {late && !cancelled && <Chip tone="warning" icon="alert-triangle">Terlambat</Chip>}
                        </div>
                      </div>
                      <div className="kas-bill__amount">{formatRupiah(bill.amount)}</div>
                      {cancelled && bill.cancel_reason && <p className="muted">Alasan: {bill.cancel_reason}</p>}
                      {!cancelled && member.status === 'rejected' && member.rejection_reason && (
                        <Notice tone="error">Pengajuan terakhir ditolak: {member.rejection_reason}</Notice>
                      )}
                      {!cancelled && member.status === 'pending' && latest && (
                        <p className="muted">Diajukan {formatWhen(latest.submitted_at, tz)}. Menunggu verifikasi Bendahara.</p>
                      )}
                      {member.status === 'paid' && member.paid_at && (
                        <p className="muted">Lunas {formatWhen(member.paid_at, tz)}.</p>
                      )}
                      {proof && (
                        <a className="kas-evidence" href={proof} target="_blank" rel="noopener noreferrer">Lihat bukti pembayaran</a>
                      )}
                      {!cancelled && bill.status === 'open' && canSubmitBill(member.status) && (
                        <div className="kas-bill__actions">
                          <PaymentDialog billMemberId={member.id} amount={Number(bill.amount)} title={bill.title} qrisAvailable={!!qrisUrl} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </Section>

          {myDeposits.length > 0 && (
            <Section id="kas-my-deposits" title="Setoran QRIS saya" icon="qr" className="kas-section"
              action={<Chip tone="outline">{myDeposits.length} pengajuan</Chip>}>
              <div className="card card--flush">
                <ul className="rows">
                  {myDeposits.map((deposit) => {
                    const proof = deposit.proof_path ? proofUrls.get(deposit.proof_path) : undefined;
                    const tone = deposit.status === 'approved' ? 'success' as const
                      : deposit.status === 'rejected' ? 'error' as const
                        : deposit.status === 'pending' ? 'warning' as const : 'neutral' as const;
                    const icon = deposit.status === 'approved' ? 'check-circle' as const
                      : deposit.status === 'rejected' ? 'alert-circle' as const
                        : deposit.status === 'pending' ? 'hourglass' as const : 'archive' as const;
                    return (
                      <li className="row row--wrap" key={deposit.id}>
                        <div className="row__body">
                          <div className="row__title">
                            Setoran kas <Chip tone={tone} icon={icon}>{KAS_SUBMISSION_STATUS[deposit.status]}</Chip>
                          </div>
                          <p className="row__meta">Diajukan {formatWhen(deposit.submitted_at, tz)}</p>
                          {deposit.note && <p className="kas-note">{deposit.note}</p>}
                          {deposit.status === 'rejected' && deposit.rejection_reason && (
                            <p className="muted">Alasan: {deposit.rejection_reason}</p>
                          )}
                          {proof && (
                            <a className="kas-evidence" href={proof} target="_blank" rel="noopener noreferrer">Lihat bukti</a>
                          )}
                        </div>
                        <div className="row__actions">
                          <strong className="kas-amount">{formatRupiah(Number(deposit.amount))}</strong>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Section>
          )}

          <Section id="kas-history" title="Riwayat kas" icon="activity" className="kas-section"
            action={<span className="muted">Terbaru 100 catatan</span>}>
            {transactions.length === 0 ? (
              <EmptyState compact slim icon="wallet" title="Belum ada transaksi">
                Setelah Bendahara mencatat pemasukan atau pengeluaran, riwayatnya tampil di sini.
              </EmptyState>
            ) : (
              <div className="card card--flush">
                <ul className="rows">
                  {transactions.map((tx) => {
                    const submission = tx.submission_id ? submissionById.get(tx.submission_id) : null;
                    const receiptPath = receiptByTx.get(tx.id);
                    const evidencePath = tx.source === 'manual' ? receiptPath : submission?.proof_path ?? null;
                    const evidenceUrl = evidencePath
                      ? (tx.source === 'manual' ? receiptUrls.get(evidencePath) : proofUrls.get(evidencePath))
                      : undefined;
                    const canSeeEvidence = canReadAll || submission?.user_id === viewer.user?.id;
                    const sourceLabel = tx.source === 'manual' ? 'Catatan manual' : tx.source === 'deposit' ? 'Setoran QRIS' : 'Iuran';
                    return (
                      <li className="row row--wrap kas-tx" key={tx.id}>
                        <span className={`tile tile--${tx.direction === 'income' ? 'success' : 'accent'}`}>
                          <Icon name={tx.direction === 'income' ? 'download' : 'upload'} size={18} />
                        </span>
                        <div className="row__body">
                          <div className="row__title">
                            {tx.description}
                            <Chip tone="outline">{tx.category}</Chip>
                            {tx.status === 'cancelled' && <Chip tone="neutral">Dibatalkan</Chip>}
                          </div>
                          <p className="row__meta">
                            {formatDateOnly(tx.occurred_on, tz)} · {sourceLabel}
                            {tx.status === 'cancelled' && tx.cancel_reason ? ` · ${tx.cancel_reason}` : ''}
                          </p>
                          {canSeeEvidence && evidenceUrl && (
                            <a className="kas-evidence" href={evidenceUrl} target="_blank" rel="noopener noreferrer">
                              {tx.source === 'manual' ? 'Lihat nota' : 'Lihat bukti'}
                            </a>
                          )}
                        </div>
                        <div className="row__actions kas-tx__actions">
                          <span className={`kas-tx__amount ${tx.direction === 'income' ? 'kas-tx__amount--income' : ''}`}>
                            {formatSignedRupiah(Number(tx.amount), tx.direction)}
                          </span>
                          {canManage && tx.status === 'active' && (
                            <CancelTransactionDialog id={tx.id} description={tx.description} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Section>
        </div>

        <aside className="kas-aside" aria-label="Pembayaran dan pengelolaan kas">
          <Section id="kas-qris" title="QRIS kas kelas" icon="qr" className="kas-section">
            <div className="card stack stack--sm">
              {qrisUrl ? (
                <div className="kas-qris">
                  <img src={qrisUrl} alt="Gambar QRIS pembayaran kas kelas" width={720} height={720} />
                  <p className="muted">Pindai dengan aplikasi pembayaran, lalu ajukan setoran dengan nominal yang kamu bayar. Bukti bersifat opsional.</p>
                </div>
              ) : (
                <EmptyState compact slim icon="qr" title={canManage ? 'QRIS belum diunggah' : 'QRIS belum tersedia'}>
                  {canManage ? 'Unggah gambar QRIS agar anggota bisa mengajukan setoran.' : 'Bendahara belum mengunggah gambar QRIS.'}
                </EmptyState>
              )}
              {qrisUrl && <DepositForm qrisAvailable />}
            </div>
            {canManage && (
              <div className="card kas-manage-media">
                <QrisForm hasQris={!!qrisUrl} />
                {qrisUrl && <RemoveQrisDialog />}
              </div>
            )}
          </Section>

          {canManage && (
            <>
              <Section id="kas-create-bill" title="Buat tagihan iuran" icon="plus" className="kas-section">
                <div className="card">
                  <CreateBillForm members={memberOptions} defaultDue={addDaysIso(today, 7)} />
                </div>
              </Section>
              <Section id="kas-create-tx" title="Catat transaksi manual" icon="pencil" className="kas-section">
                <div className="card">
                  <TransactionForm balance={balance} today={today} />
                </div>
              </Section>
            </>
          )}

          {canReadAll && (
            <Section id="kas-bills-admin" title="Tagihan kelas" icon="tasks" className="kas-section"
              action={<Chip tone="outline">{bills.length} tagihan</Chip>}>
              {bills.length === 0 ? (
                <EmptyState compact slim icon="tasks" title="Belum ada tagihan" />
              ) : (
                <div className="stack stack--sm">
                  {bills.map((bill) => {
                    const recipients = membersByBill.get(bill.id) ?? [];
                    const paid = recipients.filter((member) => member.status === 'paid').length;
                    const existing = new Set(recipients.map((member) => member.user_id).filter(Boolean));
                    const options = memberOptions.filter((member) => !existing.has(member.id));
                    const counts = recipients.reduce((acc, member) => {
                      acc[member.status] = (acc[member.status] ?? 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);
                    return (
                      <details className="card kas-admin-bill" key={bill.id}>
                        <summary className="kas-admin-bill__summary">
                          <span className="kas-admin-bill__title">
                            <span>{bill.title}</span>
                            <span className="muted">{formatRupiah(Number(bill.amount))} · jatuh tempo {formatDateOnly(bill.due_on, tz)}</span>
                          </span>
                          <span className="cluster">
                            <Chip tone={billTone(bill.status)}>{KAS_BILL_UI[bill.status]}</Chip>
                            <span className="muted">{paid}/{recipients.length} lunas</span>
                            <Icon name="chevron-down" size={18} className="kas-admin-bill__chevron" />
                          </span>
                        </summary>
                        <div className="kas-admin-bill__body">
                          {bill.status === 'cancelled' && bill.cancel_reason && (
                            <p className="muted">Dibatalkan: {bill.cancel_reason}</p>
                          )}
                          <ul className="kas-recipients">
                            {recipients.map((member) => {
                              const meta = statusMeta(member.status);
                              return (
                                <li key={member.id}>
                                  <span className="cluster">
                                    <Avatar name={member.member_name} size="xs" />
                                    <span>{member.member_name}</span>
                                    <Chip tone={meta.tone} icon={meta.icon}>{KAS_BILL_STATUS[member.status]}</Chip>
                                  </span>
                                  {canManage && bill.status === 'open' && member.status !== 'paid' && (
                                    <MarkPaidButton id={member.id} pendingVerification={member.status === 'pending'} />
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          {recipients.length === 0 && <p className="muted">Belum ada penerima.</p>}
                          {canManage && (
                            <div className="kas-admin-bill__manage">
                              {bill.status !== 'cancelled' && (
                                <>
                                  <AddMembersForm billId={bill.id} options={options} />
                                  <div className="cluster">
                                    <CancelBillDialog billId={bill.id} title={bill.title} />
                                  </div>
                                </>
                              )}
                              <p className="muted">
                                {counts.unpaid ?? 0} belum bayar · {counts.pending ?? 0} menunggu · {counts.rejected ?? 0} ditolak
                              </p>
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {!canReadAll && (
            <Section id="kas-info" title="Tentang kas kelas" icon="info" className="kas-section">
              <div className="card">
                <p className="muted">
                  Semua anggota dapat melihat saldo dan riwayat. Bukti pembayaran hanya terlihat oleh pengunggah,
                  Bendahara, dan Ketua. Setoran lewat QRIS baru masuk saldo setelah diverifikasi.
                </p>
              </div>
            </Section>
          )}
        </aside>
      </div>

      {canReadAll && members.length === 0 && canManage && (
        <p className="muted">Belum ada anggota aktif lain. Tagihan dapat dibuat setelah anggota bergabung.</p>
      )}
      <p className="kas-footnote muted">
        Data QRIS dan bukti disajikan lewat tautan bertanda tangan. Tidak ada tautan yang bisa diakses publik.
      </p>
    </>
  );
}
