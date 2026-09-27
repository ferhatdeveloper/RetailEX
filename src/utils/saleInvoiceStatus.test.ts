/**
 * Soft-delete fatura filtreleri — Fiş Listesi / Malzeme Ekstresi ile aynı kural.
 */
import { describe, expect, it } from 'vitest';
import {
  isRemovedSaleRow,
  REMOVED_SALE_STATUSES,
  sqlSaleNotCancelled,
} from './saleInvoiceStatus';

describe('sqlSaleNotCancelled', () => {
  it('alias ile is_cancelled + status filtresi üretir', () => {
    const sql = sqlSaleNotCancelled('sl');
    expect(sql).toContain('COALESCE(sl.is_cancelled, false) = false');
    expect(sql).toContain("LOWER(TRIM(COALESCE(sl.status, ''))) NOT IN");
    for (const st of REMOVED_SALE_STATUSES) {
      expect(sql).toContain(`'${st}'`);
    }
  });

  it('varsayılan alias s kullanır', () => {
    expect(sqlSaleNotCancelled()).toContain('s.is_cancelled');
  });
});

describe('isRemovedSaleRow', () => {
  it('is_cancelled=true satırını silinmiş sayar', () => {
    expect(isRemovedSaleRow({ is_cancelled: true, status: 'approved' })).toBe(true);
    expect(isRemovedSaleRow({ is_cancelled: 'true', status: 'completed' })).toBe(true);
  });

  it('InvoicesAPI.delete status=Silindi satırını hariç tutar', () => {
    expect(isRemovedSaleRow({ status: 'Silindi' })).toBe(true);
    expect(isRemovedSaleRow({ status: 'silindi' })).toBe(true);
    expect(isRemovedSaleRow({ status: 'deleted' })).toBe(true);
    expect(isRemovedSaleRow({ status: 'cancelled' })).toBe(true);
  });

  it('aktif faturaları tutar', () => {
    expect(isRemovedSaleRow({ is_cancelled: false, status: 'approved' })).toBe(false);
    expect(isRemovedSaleRow({ status: 'completed' })).toBe(false);
    expect(isRemovedSaleRow({})).toBe(false);
  });
});
