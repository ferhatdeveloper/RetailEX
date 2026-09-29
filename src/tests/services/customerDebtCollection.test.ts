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
const {
  getCustomerOutstandingInvoices,
  getCustomerOutstandingBalance,
  getCustomerBalance,
  collectCustomerDebt,
} = await import('../../services/api/customerDebtCollection');

describe('customerDebtCollection (SQL)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('getCustomerOutstandingInvoices', () => {
    it('müşterinin bekleyen faturalarını listeler (sales + beauty_sales paralel sorgular)', async () => {
      // İki paralel sorgu: önce sales, sonra beauty_sales (Promise.allSettled sırası)
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'inv-1',
              invoice_no: 'SAT-2026-0001',
              invoice_date: '2026-09-01T10:00:00Z',
              total_amount: '5000',
              paid_amount: '2000',
              remaining: '3000',
              currency: 'IQD',
              source: 'sales',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'inv-beauty-1',
              invoice_no: 'BEA-MUM3R9M',
              invoice_date: '2026-09-15T12:00:00Z',
              total_amount: '36000',
              paid_amount: '0',
              remaining: '36000',
              currency: 'IQD',
              source: 'beauty_sales',
            },
          ],
        });

      const result = await getCustomerOutstandingInvoices('cust-1');

      expect(result).toHaveLength(2);
      // Tarihe göre sıralı (sales 09-01, beauty 09-15)
      expect(result[0].source).toBe('sales');
      expect(result[0].invoice_no).toBe('SAT-2026-0001');
      expect(result[1].source).toBe('beauty_sales');
      expect(result[1].invoice_no).toBe('BEA-MUM3R9M');
      expect(result[1].remaining).toBe(36000);
      // 1. sorgu sales tablosuna
      const salesSql = String(mockQuery.mock.calls[0][0]);
      expect(salesSql).toMatch(/rex_001_01_sales/);
      expect(salesSql).toMatch(/is_cancelled/);
      // 2. sorgu beauty_sales tablosuna
      const beautySql = String(mockQuery.mock.calls[1][0]);
      expect(beautySql).toMatch(/beauty\.rex_001_01_beauty_sales/);
      expect(beautySql).toMatch(/invoice_number/);
      expect(beautySql).toMatch(/payment_status/);
    });

    it('bir sorgu hata verirse diğeri yine de döner (graceful degradation)', async () => {
      // sales hata verir, beauty_sales başarılı — BEA-MUM3R9M yine de gelmeli
      mockQuery
        .mockRejectedValueOnce(new Error('column paid_amount does not exist'))
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'inv-beauty-1',
              invoice_no: 'BEA-MUM3R9M',
              invoice_date: '2026-09-15T12:00:00Z',
              total_amount: '36000',
              paid_amount: '0',
              remaining: '36000',
              currency: 'IQD',
              source: 'beauty_sales',
            },
          ],
        });

      const result = await getCustomerOutstandingInvoices('cust-1');

      // Sales hatası göz ardı edilir, beauty_sales listelenir
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('beauty_sales');
      expect(result[0].invoice_no).toBe('BEA-MUM3R9M');
      expect(result[0].remaining).toBe(36000);
    });

    it('müşteri yoksa boş döner (DB çağrısı yapmaz)', async () => {
      const result = await getCustomerOutstandingInvoices('');
      expect(result).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('DB hatasında boş döner (alarm vermez)', async () => {
      // İki paralel sorgu (sales + beauty_sales) — her ikisi de reddedilir
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      const result = await getCustomerOutstandingInvoices('cust-1');
      expect(result).toEqual([]);
    });
  });

  describe('getCustomerBalance (customers.balance)', () => {
    it('müşterinin cari bakiyesini döner (negatif = borçlu)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ balance: '-36000' }],
      });

      const balance = await getCustomerBalance('cust-1');

      expect(balance).toBe(-36000);
      // customers tablosuna sorgu
      const sql = String(mockQuery.mock.calls[0][0]);
      expect(sql).toMatch(/rex_001_customers/);
      expect(sql).toMatch(/balance/);
    });

    it('pozitif bakiye = müşteri alacaklı (0 yerine pozitif döner)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ balance: '5000' }] });
      const balance = await getCustomerBalance('cust-1');
      expect(balance).toBe(5000);
    });

    it('müşteri yoksa 0 döner (DB çağrısı yok)', async () => {
      const balance = await getCustomerBalance('');
      expect(balance).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('DB hatasında 0 döner (graceful)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      const balance = await getCustomerBalance('cust-1');
      expect(balance).toBe(0);
    });
  });

  describe('getCustomerOutstandingBalance (cari bakiye + fatura listesi)', () => {
    it('müşteri bilgisi + cari bakiye + bekleyen faturaları tek seferde döner', async () => {
      // Sorgu sırası:
      //   1) customers tablosundan cari bakiye + isim/kod
      //   2-3) sales + beauty_sales (getCustomerOutstandingInvoices içinden)
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cust-1',
              code: 'BCust-002',
              name: 'FERHAT',
              balance: '-36000',
            },
          ],
        })
        .mockResolvedValueOnce({
          // sales sorgusu (1. paralel)
          rows: [
            {
              id: 'inv-1',
              invoice_no: 'SAT-2026-0001',
              invoice_date: '2026-09-01T10:00:00Z',
              total_amount: '5000',
              paid_amount: '2000',
              remaining: '3000',
              currency: 'IQD',
              source: 'sales',
            },
          ],
        })
        .mockResolvedValueOnce({
          // beauty_sales sorgusu (2. paralel)
          rows: [
            {
              id: 'inv-beauty-1',
              invoice_no: 'BEA-MUM3R9M',
              invoice_date: '2026-09-15T12:00:00Z',
              total_amount: '36000',
              paid_amount: '0',
              remaining: '36000',
              currency: 'IQD',
              source: 'beauty_sales',
            },
          ],
        });

      const info = await getCustomerOutstandingBalance('cust-1');

      // Müşteri bilgisi
      expect(info.customerId).toBe('cust-1');
      expect(info.customerCode).toBe('BCust-002');
      expect(info.customerName).toBe('FERHAT');
      // Cari bakiye — negatif = borçlu
      expect(info.customerBalance).toBe(-36000);
      // Fatura listesi (sales + beauty_sales birleşik)
      expect(info.outstandingInvoices).toHaveLength(2);
      // İlk sorgu customers tablosuna (cari bakiye + isim)
      const firstSql = String(mockQuery.mock.calls[0][0]);
      expect(firstSql).toMatch(/rex_001_customers/);
      expect(firstSql).toMatch(/balance/);
      expect(firstSql).toMatch(/code/);
      expect(firstSql).toMatch(/name/);
    });

    it('cari bakiye sorgusu başarısız olursa 0 döner; fatura listesi yine de gelir', async () => {
      // 1) customers sorgusu hata verir → customerBalance = 0
      // 2-3) sales + beauty_sales başarılı
      mockQuery
        .mockRejectedValueOnce(new Error('relation does not exist'))
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'inv-1',
              invoice_no: 'SAT-2026-0001',
              invoice_date: '2026-09-01T10:00:00Z',
              total_amount: '5000',
              paid_amount: '0',
              remaining: '5000',
              currency: 'IQD',
              source: 'sales',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const info = await getCustomerOutstandingBalance('cust-1');

      expect(info.customerBalance).toBe(0); // graceful
      expect(info.customerCode).toBeNull();
      expect(info.customerName).toBeNull();
      expect(info.outstandingInvoices).toHaveLength(1);
      expect(info.outstandingInvoices[0].invoice_no).toBe('SAT-2026-0001');
    });

    it('müşteri yoksa boş döner (DB çağrısı yok)', async () => {
      const info = await getCustomerOutstandingBalance('');
      expect(info.customerId).toBe('');
      expect(info.customerBalance).toBe(0);
      expect(info.outstandingInvoices).toEqual([]);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('müşteri var ama fatura listesi sorgusu başarısız: bakiye döner, fatura listesi boş', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cust-1',
              code: 'BCust-002',
              name: 'FERHAT',
              balance: '-10000',
            },
          ],
        })
        .mockRejectedValueOnce(new Error('db down')) // sales
        .mockRejectedValueOnce(new Error('db down')); // beauty_sales

      const info = await getCustomerOutstandingBalance('cust-1');

      expect(info.customerBalance).toBe(-10000);
      expect(info.customerName).toBe('FERHAT');
      expect(info.outstandingInvoices).toEqual([]);
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

    it('beauty_sales: invoiceSources ile paid_amount + remaining_amount günceller', async () => {
      // Güzellik satışından gelen fatura için salesTableIsBeauty=true → SQL'de
      // beauty_sales tablosuna paid_amount, remaining_amount ve payment_status yazılır.
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'cl-beauty-1', inserted: true }] })
        .mockResolvedValueOnce({ rowCount: 1 }) // kasa bakiye +amount
        .mockResolvedValueOnce({ rowCount: 1 }) // cari bakiye -amount
        .mockResolvedValueOnce({ rowCount: 1 }); // beauty_sales.paid_amount + remaining_amount

      const res = await collectCustomerDebt({
        customerId: 'cust-1',
        invoiceIds: ['inv-beauty-1'],
        amount: 10000,
        cashRegisterId: 'cash-1',
        invoiceSources: { 'inv-beauty-1': 'beauty_sales' },
      });

      expect(res.cashLinesWritten).toBe(1);
      expect(res.totalAmount).toBe(10000);

      // 4. sorgu beauty_sales tablosuna, remaining_amount + payment_status içerir
      const updateBeauty = String(mockQuery.mock.calls[3][0]);
      expect(updateBeauty).toMatch(/beauty\.rex_001_01_beauty_sales/);
      expect(updateBeauty).toMatch(/remaining_amount/);
      expect(updateBeauty).toMatch(/payment_status/);
      // sales (market) tablosuna DEĞİL
      expect(updateBeauty).not.toMatch(/UPDATE rex_001_01_sales/);
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