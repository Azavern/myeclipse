'use client';
import { useActionState, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { Notice, btnClass } from '@/components/ui/primitives';
import {
  addKasBillMembers, cancelKasBill, cancelKasTransaction, createKasBill, createKasTransaction,
  markKasPaid, removeKasQris, reviewKasSubmission, saveKasQris, submitKasBillPayment,
  submitKasDeposit,
} from './actions';
import {
  KAS_CATEGORIES, KAS_IMAGE_MIME, KAS_MAX_FILE_BYTES, KAS_METHODS,
  formatRupiah, parseAmount,
} from '@/lib/kas/format';
import type { FormState } from '@/lib/form-state';

type MemberOption = { id: string; name: string; username: string };

const errorOf = (state: FormState) => state?.error ?? null;
const fieldError = (state: FormState, name: string) => state?.fieldErrors?.[name]?.[0] ?? null;

function Submit({ pending, children, className }: { pending: boolean; children: ReactNode; className?: string }) {
  return (
    <button data-ui="button" type="submit" className={btnClass({ className })} disabled={pending} aria-busy={pending}>
      {pending ? <Icon name="loader" size={18} className="spin" /> : <Icon name="check" size={18} />}
      {pending ? 'Menyimpan…' : children}
    </button>
  );
}

function ErrorNotice({ state }: { state: FormState }) {
  const error = errorOf(state);
  return error ? <Notice tone="error" role="alert">{error}</Notice> : null;
}

function FileField({ name, label, hint, required = false }: {
  name: string; label: string; hint: string; required?: boolean;
}) {
  const id = useId();
  const [fileError, setFileError] = useState<string | null>(null);
  return (
    <div className="field">
      <label className="field__label" htmlFor={`${id}-file`}>{label}{required && <span className="req" aria-hidden="true">*</span>}</label>
      <input
        id={`${id}-file`} name={name} type="file" accept={KAS_IMAGE_MIME}
        required={required} aria-describedby={`${id}-hint`}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) { setFileError(null); return; }
          if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > KAS_MAX_FILE_BYTES) {
            event.currentTarget.value = '';
            setFileError('Gambar harus JPEG, PNG, atau WebP maksimal 2 MB.');
            return;
          }
          setFileError(null);
        }}
      />
      <p id={`${id}-hint`} className={fileError ? 'field__error' : 'field__hint'}>
        {fileError ?? hint}
      </p>
    </div>
  );
}

export function PaymentDialog({ billMemberId, amount, title, qrisAvailable }: {
  billMemberId: string; amount: number; title: string; qrisAvailable: boolean;
}) {
  const [state, act, pending] = useActionState(submitKasBillPayment, null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={btnClass({ size: 'sm' })} onClick={() => ref.current?.showModal()}>
        <Icon name="wallet" size={16} />Ajukan pembayaran
      </button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(event) => {
        if (event.target === event.currentTarget && !pending) ref.current?.close();
      }}>
        <form action={act}>
          <div className="dialog__body">
            <h2 id={titleId}>Pembayaran {title}</h2>
            <p className="muted">Nominal tagihan terkunci. Pengajuan baru masuk ke saldo setelah disetujui Bendahara.</p>
            <input type="hidden" name="bill_member_id" value={billMemberId} />
            <input type="hidden" name="amount" value={amount} />
            <div className="field">
              <span className="field__label">Nominal</span>
              <p className="kas-amount">{formatRupiah(amount)}</p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${titleId}-method`}>Metode pembayaran</label>
              <select id={`${titleId}-method`} name="method" defaultValue={qrisAvailable ? 'qris' : 'transfer'}>
                {qrisAvailable && <option value="qris">{KAS_METHODS.qris}</option>}
                <option value="transfer">{KAS_METHODS.transfer}</option>
                <option value="cash">{KAS_METHODS.cash}</option>
              </select>
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${titleId}-note`}>Catatan (opsional)</label>
              <textarea id={`${titleId}-note`} name="note" maxLength={200} rows={3} />
            </div>
            <FileField name="proof" label="Bukti pembayaran (opsional)" hint="Satu foto, JPEG/PNG/WebP, maksimal 2 MB." />
            <ErrorNotice state={state} />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <Submit pending={pending}>Kirim pengajuan</Submit>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function DepositForm({ qrisAvailable }: { qrisAvailable: boolean }) {
  const [state, act, pending] = useActionState(submitKasDeposit, null);
  const [amount, setAmount] = useState('');
  return (
    <form action={act} className="form kas-form" aria-busy={pending}>
      {!qrisAvailable && <Notice tone="info">Bendahara belum mengunggah QRIS. Setoran lewat QRIS belum bisa diajukan.</Notice>}
      <div className="form__grid form__grid--2">
        <div className="field">
          <label className="field__label" htmlFor="kas-deposit-amount">Jumlah setoran</label>
          <input id="kas-deposit-amount" name="amount" type="number" min={1} max={100000000} step={1}
            inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.currentTarget.value)}
            placeholder="Contoh: 50000" aria-describedby="kas-deposit-amount-hint" />
          <p id="kas-deposit-amount-hint" className="field__hint">Bilangan bulat rupiah, maksimal Rp100.000.000.</p>
          {fieldError(state, 'amount') && <p className="field__error">{fieldError(state, 'amount')}</p>}
        </div>
        <FileField name="proof" label="Bukti pembayaran (opsional)" hint="Satu foto, JPEG/PNG/WebP, maksimal 2 MB." />
        <div className="field field--full">
          <label className="field__label" htmlFor="kas-deposit-note">Catatan (opsional)</label>
          <textarea id="kas-deposit-note" name="note" maxLength={200} rows={2} />
        </div>
      </div>
      <ErrorNotice state={state} />
      <div className="form__actions"><Submit pending={pending}>Ajukan setoran</Submit></div>
    </form>
  );
}

export function CreateBillForm({ members, defaultDue }: { members: MemberOption[]; defaultDue: string }) {
  const [state, act, pending] = useActionState(createKasBill, null);
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const ids = useId();
  return (
    <form action={act} className="form kas-form" aria-busy={pending}>
      <ErrorNotice state={state} />
      <div className="form__grid form__grid--2">
        <div className="field field--full">
          <label className="field__label" htmlFor={`${ids}-title`}>Nama tagihan</label>
          <input id={`${ids}-title`} name="title" maxLength={120} required defaultValue={state?.values?.title ?? ''}
            placeholder="Contoh: Iuran konsumsi" aria-describedby={`${ids}-title-hint`} />
          <p id={`${ids}-title-hint`} className="field__hint">Maksimal 120 karakter.</p>
          {fieldError(state, 'title') && <p className="field__error">{fieldError(state, 'title')}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-amount`}>Nominal per anggota</label>
          <input id={`${ids}-amount`} name="amount" type="number" min={1} max={100000000} step={1}
            inputMode="numeric" required defaultValue={state?.values?.amount ?? ''} />
          {fieldError(state, 'amount') && <p className="field__error">{fieldError(state, 'amount')}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-due`}>Tenggat</label>
          <input id={`${ids}-due`} name="due_on" type="date" required defaultValue={state?.values?.due_on ?? defaultDue} />
          {fieldError(state, 'due_on') && <p className="field__error">{fieldError(state, 'due_on')}</p>}
        </div>
      </div>
      <fieldset className="kas-fieldset">
        <legend className="field__label">Yang dikenai</legend>
        <label className="checklist__label">
          <input type="radio" name="recipient_mode" value="all" checked={mode === 'all'}
            onChange={() => setMode('all')} />
          <span className="checklist__text"><span className="checklist__title">Semua anggota aktif saat dibuat</span></span>
        </label>
        <label className="checklist__label">
          <input type="radio" name="recipient_mode" value="selected" checked={mode === 'selected'}
            onChange={() => setMode('selected')} />
          <span className="checklist__text"><span className="checklist__title">Pilih anggota</span></span>
        </label>
        {mode === 'selected' && (
          <div className="checklist kas-member-picker">
            {members.map((member) => (
              <label key={member.id} className="checklist__label">
                <input type="checkbox" name="user_ids" value={member.id} />
                <span className="checklist__text">
                  <span className="checklist__title">{member.name}</span>
                  {member.username && <span className="checklist__hint">@{member.username}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        {fieldError(state, 'user_ids') && <p className="field__error">{fieldError(state, 'user_ids')}</p>}
      </fieldset>
      <div className="form__actions"><Submit pending={pending}>Buat tagihan</Submit></div>
    </form>
  );
}

export function TransactionForm({ balance, today }: { balance: number; today: string }) {
  const [state, act, pending] = useActionState(createKasTransaction, null);
  const [direction, setDirection] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const parsed = parseAmount(amount);
  const makesNegative = direction === 'expense' && parsed !== null && parsed > balance;
  return (
    <form action={act} className="form kas-form" aria-busy={pending}>
      <ErrorNotice state={state} />
      {makesNegative && <Notice tone="warning">Pengeluaran ini akan membuat saldo kas minus. Catatan tetap boleh disimpan.</Notice>}
      <div className="form__grid form__grid--2">
        <div className="field">
          <label className="field__label" htmlFor="kas-tx-direction">Jenis</label>
          <select id="kas-tx-direction" name="direction" value={direction}
            onChange={(event) => setDirection(event.currentTarget.value as 'income' | 'expense')}>
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan lain</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="kas-tx-amount">Jumlah</label>
          <input id="kas-tx-amount" name="amount" type="number" min={1} max={100000000} step={1}
            inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.currentTarget.value)} />
          {fieldError(state, 'amount') && <p className="field__error">{fieldError(state, 'amount')}</p>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="kas-tx-category">Kategori</label>
          <select id="kas-tx-category" name="category" defaultValue={state?.values?.category ?? 'Konsumsi'}>
            {KAS_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="kas-tx-date">Tanggal</label>
          <input id="kas-tx-date" name="occurred_on" type="date" required defaultValue={state?.values?.occurred_on ?? today} />
          {fieldError(state, 'occurred_on') && <p className="field__error">{fieldError(state, 'occurred_on')}</p>}
        </div>
        <div className="field field--full">
          <label className="field__label" htmlFor="kas-tx-description">Keterangan</label>
          <textarea id="kas-tx-description" name="description" maxLength={200} rows={2} required defaultValue={state?.values?.description ?? ''} />
          {fieldError(state, 'description') && <p className="field__error">{fieldError(state, 'description')}</p>}
        </div>
        <FileField name="receipt" label="Nota (opsional)" hint="Satu foto, JPEG/PNG/WebP, maksimal 2 MB." />
      </div>
      <div className="form__actions"><Submit pending={pending}>Simpan catatan</Submit></div>
    </form>
  );
}

export function ApproveForm({ id }: { id: string }) {
  const [state, act, pending] = useActionState(reviewKasSubmission, null);
  return (
    <form action={act} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value="approve" />
      <button type="submit" className={btnClass({ size: 'sm' })} disabled={pending}>
        {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="check" size={16} />}
        {pending ? 'Memproses…' : 'Terima'}
      </button>
      <ErrorNotice state={state} />
    </form>
  );
}

export function RejectDialog({ id, name }: { id: string; name: string }) {
  const [state, act, pending] = useActionState(reviewKasSubmission, null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={btnClass({ variant: 'danger-soft', size: 'sm' })}
        onClick={() => ref.current?.showModal()}>
        <Icon name="x" size={16} />Tolak
      </button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(event) => {
        if (event.target === event.currentTarget && !pending) ref.current?.close();
      }}>
        <form action={act}>
          <div className="dialog__body">
            <h2 id={titleId}>Tolak pengajuan {name}</h2>
            <p className="muted">Iuran kembali ke Belum bayar. Alasan ini terlihat oleh anggota yang mengajukan.</p>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value="reject" />
            <div className="field">
              <label className="field__label" htmlFor={`${titleId}-reason`}>Alasan penolakan</label>
              <textarea id={`${titleId}-reason`} name="reason" maxLength={200} rows={3} required />
              {fieldError(state, 'reason') && <p className="field__error">{fieldError(state, 'reason')}</p>}
            </div>
            <ErrorNotice state={state} />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={pending}>
              {pending && <Icon name="loader" size={18} className="spin" />}{pending ? 'Menolak…' : 'Tolak pengajuan'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function MarkPaidButton({ id, pendingVerification }: { id: string; pendingVerification?: boolean }) {
  const [state, act, pending] = useActionState(markKasPaid, null);
  return (
    <form action={act} className="inline-form" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={btnClass({ variant: 'secondary', size: 'sm' })} disabled={pending}>
        {pending ? <Icon name="loader" size={16} className="spin" /> : <Icon name="check" size={16} />}
        {pending ? 'Memproses…' : pendingVerification ? 'Terima & lunas' : 'Tandai lunas'}
      </button>
      <ErrorNotice state={state} />
    </form>
  );
}

export function AddMembersForm({ billId, options }: { billId: string; options: MemberOption[] }) {
  const [state, act, pending] = useActionState(addKasBillMembers, null);
  return (
    <form action={act} className="form kas-form kas-form--compact" aria-busy={pending}>
      <input type="hidden" name="bill_id" value={billId} />
      {options.length === 0 ? (
        <p className="muted">Semua anggota aktif sudah masuk ke tagihan ini.</p>
      ) : (
        <fieldset className="kas-fieldset">
          <legend className="field__label">Tambah anggota</legend>
          <div className="checklist kas-member-picker">
            {options.map((member) => (
              <label key={member.id} className="checklist__label">
                <input type="checkbox" name="user_ids" value={member.id} />
                <span className="checklist__text">
                  <span className="checklist__title">{member.name}</span>
                  {member.username && <span className="checklist__hint">@{member.username}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {fieldError(state, 'user_ids') && <p className="field__error">{fieldError(state, 'user_ids')}</p>}
      <ErrorNotice state={state} />
      {options.length > 0 && <div className="form__actions"><Submit pending={pending}>Tambahkan</Submit></div>}
    </form>
  );
}

export function CancelBillDialog({ billId, title }: { billId: string; title: string }) {
  const [state, act, pending] = useActionState(cancelKasBill, null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={btnClass({ variant: 'danger-soft', size: 'sm' })}
        onClick={() => ref.current?.showModal()}>
        <Icon name="x" size={16} />Batalkan tagihan
      </button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(event) => {
        if (event.target === event.currentTarget && !pending) ref.current?.close();
      }}>
        <form action={act}>
          <div className="dialog__body">
            <h2 id={titleId}>Batalkan {title}?</h2>
            <p className="muted">Pengajuan yang menunggu dihentikan. Pemasukan dari iuran yang sudah lunas ikut dibatalkan, dan catatan tetap terlihat dengan status dibatalkan.</p>
            <input type="hidden" name="bill_id" value={billId} />
            <div className="field">
              <label className="field__label" htmlFor={`${titleId}-reason`}>Alasan pembatalan</label>
              <textarea id={`${titleId}-reason`} name="reason" maxLength={200} rows={3} required />
            </div>
            <ErrorNotice state={state} />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={pending}>
              {pending && <Icon name="loader" size={18} className="spin" />}{pending ? 'Membatalkan…' : 'Batalkan tagihan'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function CancelTransactionDialog({ id, description }: { id: string; description: string }) {
  const [state, act, pending] = useActionState(cancelKasTransaction, null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={btnClass({ variant: 'ghost', size: 'sm' })}
        onClick={() => ref.current?.showModal()} aria-label={`Batalkan transaksi ${description}`}>
        <Icon name="x" size={16} />Batalkan
      </button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(event) => {
        if (event.target === event.currentTarget && !pending) ref.current?.close();
      }}>
        <form action={act}>
          <div className="dialog__body">
            <h2 id={titleId}>Batalkan catatan ini?</h2>
            <p className="muted">Catatan tetap tampil sebagai dibatalkan dan tidak dihitung ke saldo. Bila ini pemasukan iuran, status iuran terkait kembali ke Belum bayar.</p>
            <input type="hidden" name="id" value={id} />
            <div className="field">
              <label className="field__label" htmlFor={`${titleId}-reason`}>Alasan pembatalan</label>
              <textarea id={`${titleId}-reason`} name="reason" maxLength={200} rows={3} required />
            </div>
            <ErrorNotice state={state} />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={pending}>
              {pending && <Icon name="loader" size={18} className="spin" />}{pending ? 'Membatalkan…' : 'Batalkan catatan'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function QrisForm({ hasQris }: { hasQris: boolean }) {
  const [state, act, pending] = useActionState(saveKasQris, null);
  return (
    <form action={act} className="form kas-form kas-form--compact" aria-busy={pending}>
      <FileField name="qris" label={hasQris ? 'Ganti gambar QRIS' : 'Unggah gambar QRIS'} required
        hint="JPEG/PNG/WebP, maksimal 2 MB. Gambar ini hanya terlihat oleh anggota kelas." />
      <ErrorNotice state={state} />
      <div className="form__actions"><Submit pending={pending}>{hasQris ? 'Ganti QRIS' : 'Simpan QRIS'}</Submit></div>
    </form>
  );
}

export function RemoveQrisDialog() {
  const [state, act, pending] = useActionState(removeKasQris, null);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={btnClass({ variant: 'ghost', size: 'sm' })}
        onClick={() => ref.current?.showModal()}>
        <Icon name="trash" size={16} />Hapus QRIS
      </button>
      <dialog ref={ref} aria-labelledby={titleId} onClick={(event) => {
        if (event.target === event.currentTarget && !pending) ref.current?.close();
      }}>
        <form action={act}>
          <div className="dialog__body">
            <h2 id={titleId}>Hapus gambar QRIS?</h2>
            <p className="muted">Anggota tidak bisa lagi mengajukan setoran lewat QRIS sampai gambar baru diunggah.</p>
            <ErrorNotice state={state} />
          </div>
          <div className="dialog__actions">
            <button type="button" className="btn btn--secondary" disabled={pending} onClick={() => ref.current?.close()}>Batal</button>
            <button type="submit" className="btn btn--danger" disabled={pending}>
              {pending && <Icon name="loader" size={18} className="spin" />}{pending ? 'Menghapus…' : 'Hapus QRIS'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
