import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KasBlock } from '../../src/features/home/blocks';
import {
  KAS_CATEGORIES, addDaysIso, canSubmitBill, formatDateOnly, formatRupiah, formatSignedRupiah,
  isPastDue, parseAmount, todayInZone,
} from '../../src/lib/kas/format';

describe('format kas', () => {
  it('menerima nominal rupiah bulat dalam batas aman', () => {
    expect(parseAmount(' 50000 ')).toBe(50_000);
    expect(parseAmount('100000000')).toBe(100_000_000);
    for (const value of ['', '0', '-1', '1.000', '1e3', '100000001', 'abc', null, undefined]) {
      expect(parseAmount(value), String(value)).toBeNull();
    }
  });

  it('memformat rupiah dan arah transaksi tanpa desimal', () => {
    expect(formatRupiah(50_000)).toContain('50.000');
    expect(formatRupiah(0)).toContain('0');
    expect(formatSignedRupiah(50_000, 'income').startsWith('+')).toBe(true);
    expect(formatSignedRupiah(50_000, 'expense').startsWith('−')).toBe(true);
  });

  it('membaca tanggal kalender dan menambah hari melewati akhir bulan', () => {
    expect(formatDateOnly('2026-11-09', 'Asia/Jakarta')).toContain('2026');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('hari ini mengikuti zona waktu kelas, bukan UTC', () => {
    const now = new Date('2026-11-12T16:30:00Z');
    expect(todayInZone('Asia/Jakarta', now)).toBe('2026-11-12');
    expect(todayInZone('Asia/Jayapura', now)).toBe('2026-11-13');
  });

  it('membandingkan tenggat dan status iuran', () => {
    expect(isPastDue('2026-11-11', '2026-11-12')).toBe(true);
    expect(isPastDue('2026-11-12', '2026-11-12')).toBe(false);
    expect(canSubmitBill('unpaid')).toBe(true);
    expect(canSubmitBill('rejected')).toBe(true);
    expect(canSubmitBill('pending')).toBe(false);
    expect(canSubmitBill('paid')).toBe(false);
    expect(KAS_CATEGORIES).toContain('Iuran');
  });
});

describe('blok kas Beranda', () => {
  it('menampilkan saldo, kewajiban, dan tautan rincian untuk anggota', () => {
    const html = renderToStaticMarkup(createElement(KasBlock, {
      summary: { balance: 125_000, own_unpaid: 2, own_pending: 1 },
    }));
    expect(html).toContain('Saldo kas');
    expect(html).toContain('125.000');
    expect(html).toContain('2');
    expect(html).toContain('iuran belum dibayar');
    expect(html).toContain('href="/kas"');
    expect(html).not.toContain('kas-home__balance--negative');
  });

  it('menandai saldo minus secara visual', () => {
    const html = renderToStaticMarkup(createElement(KasBlock, {
      summary: { balance: -1_000, own_unpaid: 0, own_pending: 0 },
    }));
    expect(html).toContain('kas-home__balance--negative');
  });
});
