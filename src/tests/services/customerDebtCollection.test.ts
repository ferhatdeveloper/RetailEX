/**
 * Müşteri cari borç tahsilatı — SQL modu testleri.
 *
 * Akış:
 *   1) getCustomerOutstandingInvoices → sales tablosundan bekleyen faturaları listele
 *   2) collectCustomerDebt → her fatura için:
 *        - cash_lines INSERT (CH_TAHSILAT, sign=+1, ON CONFLICT UPDATE)
 *        - cash_registers.balance += amount (yalnızca INSERT)
 *        - customers.balance -= amount (yalnızca INSERT)
 *        - sales.paid_amount += amount (clamp)
 *
 * Postgres mock'lanır; PostgREST yolu bu testte kapsanmıyor
 * (PostgREST mock'lamak setup ağırlığı getirir; SQL yolu ana akış).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../services/postgres', () => ({
  postgres: { query: (...args: unknown[]) => mockQuery(...args) },
  ERP_SETTINGS: { firmNr: '001', periodNr: '01' },
  DB_SETTINGS: { connectionProvider: 'db' },
}));

// Mock sonrası import
const { getCustomerOutstandingInvoices, collectCustomerDebt } = await import(
  '../../services/api/customerDebtCollection'
);

describe('customerDebtCollection (SQL)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('getCustomerOutstandingInvoices', () => {
    it('müşterinin bekleyen satış faturalarını listeler', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'inv-1',
            invoice_no: 'F-2026-001',
            invoice_date: '2026-09-01T10:00:00Z',
            total_amount: '5000',
            paid_amount: '2000',
            remaining: '3000',
            currency: 'IQD',
          },
          {
            id: 'inv-2',
            invoice_no: 'F-2026-002',
            invoice_date: '2026-09-15T12:00:00Z',
            total_amount: '1000',
            paid_amount: '0',
            remaining: '1000',
            currency: 'IQD',
          },
        ],
      });

      const result = await getCustomerOutstandingInvoices('cust-1');

      expect(result).toHaveLength(2);
      expect(result[0].invoice_no).toBe('F-2026-001');
      expect(result[0].remaining).toBe(3000);
      expect(result[1].remaining).toBe(1000);
      // SQL filtre: customer_id + remaining > 0 + is_cancelled=false
      const sqlArg = String(mockQuery.mock.calls[0][0]);
      expect(sqlArg).toMatch(/customer_id\s*=\s*\$1/);
      expect(sqlArg).toMatch(/is_cancelled/);
      expect(sqlArg).toMatch(/ORDER BY date ASC/);
    });

    it('müşteri yoksa boş döner (DB çağrısı yapmaz)', async () => {
      const result = await getCustomerOutstandingInvoices('');
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('DB hatasında boş döner (alarm vermez)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      const result = await getCustomerOutstandingInvoices('cust-1');
      expect(result).toEqual([]);
    });
  });

  describe('collectCustomerDebt', () => {
    it('her fatura için cash_lines INSERT ve balance UPDATE çağırır', async () => {
      // 1) cash_lines INSERT (idempotent: xmax = 0 → inserted=true)
      // 2) cash_registers.balance += amount
      // 3) customers.balance -= amount
      // 4) sales.paid_amount += amount (clamp)
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'cl-1', inserted: true }],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // kasa bakiye +amount
        .mockResolvedValueOnce({ rowCount: 1 }) // cari bakiye -amount
        .mockResolvedValueOnce({ rowCount: 1 }) // sales.paid_amount +amount
        .mockResolvedValueOnce({
          rows: [{ id: 'cl-2', inserted: true }],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const res = await collectCustomerDebt({
        customerId: 'cust-1',
        invoiceIds: ['inv-1', 'inv-2'],
        amount: 4000,
        cashRegisterId: 'cash-1',
      });

      expect(res.cashLinesWritten).toBe(2);
      expect(res.totalAmount).toBe(4000);
      expect(res.ficheNumbers).toEqual(['TAH-inv-1', 'TAH-inv-2']);

      // 1. INSERT: CH_TAHSILAT, sign=+1
      const insert1 = String(mockQuery.mock.calls[0][0]);
      expect(insert1).toMatch(/INSERT INTO rex_001_01_cash_lines/);
      expect(insert1).toMatch(/CH_TAHSILAT/);
      expect(insert1).toMatch(/ON CONFLICT \(fiche_no\) DO UPDATE/);

      // 2. cash_registers.balance +amount
      const update2 = String(mockQuery.mock.calls[1][0]);
      expect(update2).toMatch(/UPDATE rex_001_cash_registers/);
      expect(update2).toMatch(/balance\s*=\s*COALESCE\(balance,\s*0\)\s*\+\s*\$1/);

      // 3. customers.balance -= amount (cari alacak azaltma — tahsilat)
      const update3 = String(mockQuery.mock.calls[2][0]);
      expect(update3).toMatch(/UPDATE rex_001_customers/);
      expect(update3).toMatch(/balance\s*=\s*COALESCE\(balance,\s*0\)\s*-\s*\$1/);

      // 4. sales.paid_amount clamp
      const update4 = String(mockQuery.mock.calls[3][0]);
      expect(update4).toMatch(/UPDATE rex_001_01_sales/);
      expect(update4).toMatch(/LEAST/);
    });

    it('idempotent: cash_lines zaten varsa bakiye güncellenmez (inserted=false)', async () => {
      // inserted=false → kasa/cari UPDATE atlanmalı; sales UPDATE yine çalışır
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'cl-1', inserted: false }] })
        .mockResolvedValueOnce({ rowCount: 1 }); // sales.paid_amount

      const res = await collectCustomerDebt({
        customerId: 'cust-1',
        invoiceIds: ['inv-1'],
        amount: 3000,
        cashRegisterId: 'cash-1',
      });

      expect(res.cashLinesWritten).toBe(1);
      expect(mockQuery).toHaveBeenCalledTimes(2); // upsert + sales only
    });

    it('input validasyon: customerId yoksa hata', async () => {
      await expect(
        collectCustomerDebt({
          customerId: '',
          invoiceIds: ['inv-1'],
          amount: 100,
          cashRegisterId: 'cash-1',
        }),
      ).rejects.toThrow(/Müşteri/);
    });

    it('input validasyon: invoiceIds boşsa hata', async () => {
      await expect(
        collectCustomerDebt({
          customerId: 'cust-1',
          invoiceIds: [],
          amount: 100,
          cashRegisterId: 'cash-1',
        }),
      ).rejects.toThrow(/fatura/);
    });

    it('input validasyon: amount <= 0 ise hata', async () => {
      await expect(
        collectCustomerDebt({
          customerId: 'cust-1',
          invoiceIds: ['inv-1'],
          amount: 0,
          cashRegisterId: 'cash-1',
        }),
      ).rejects.toThrow(/tutar/);
    });

    it('input validasyon: cashRegisterId yoksa hata', async () => {
      await expect(
        collectCustomerDebt({
          customerId: 'cust-1',
          invoiceIds: ['inv-1'],
          amount: 100,
          cashRegisterId: '',
        }),
      ).rejects.toThrow(/kasa/);
    });

    it('çoklu fatura: yuvarlama farkı son satıra eklenir (toplam korunur)', async () => {
      // 3 fatura, 1000 → her biri 333.33..., toplam 999.99 (1 kuruş fark)
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'cl-1', inserted: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'cl-2', inserted: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'cl-3', inserted: true }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const res = await collectCustomerDebt({
        customerId: 'cust-1',
        invoiceIds: ['inv-1', 'inv-2', 'inv-3'],
        amount: 1000,
        cashRegisterId: 'cash-1',
      });

      // Üç INSERT: amount parametrelerinin toplamı tam 1000 olmalı
      const insertParams = [
        mockQuery.mock.calls[0][1], // cl-1
        mockQuery.mock.calls[4][1], // cl-2
        mockQuery.mock.calls[8][1], // cl-3
      ];
      // INSERT parametre dizilimi: firmNr, periodNr, cashRegisterId, ficheNo, tarih, amount, aciklama, customerId
      // amount parametreleri 5. indeks (0-bazlı)
      const amounts = insertParams.map((p) => Number(p[5]));
      const sum = amounts.reduce((s, n) => s + n, 0);
      expect(Math.abs(sum - 1000)).toBeLessThan(0.001);
      // Toplam: yuvarlama farkı son satıra yansımış
      expect(res.totalAmount).toBeCloseTo(1000, 3);
    });
  });
});