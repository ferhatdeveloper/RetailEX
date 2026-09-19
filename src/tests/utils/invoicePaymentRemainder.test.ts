import { describe, expect, it } from 'vitest';
import {
  appendRemainingOpenAccountRow,
  buildPrepaidAndRemainderPayments,
  resolvePrimaryInvoicePaymentMethod,
} from '../../components/trading/invoices/InvoicePaymentInfoModal';

describe('appendRemainingOpenAccountRow', () => {
  it('50 nakit sonrası kalan 50 açık cariye yazılır', () => {
    const rows = appendRemainingOpenAccountRow(
      [{ method: 'NAKIT', amount: 50, currency: 'IQD', cashRegisterId: 'k1' }],
      100,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ method: 'ACIK_CARI', amount: 50, cashRegisterId: null });
  });

  it('tam ödenmiş belgede cari satırı eklenmez', () => {
    const rows = appendRemainingOpenAccountRow(
      [{ method: 'NAKIT', amount: 100, currency: 'IQD', cashRegisterId: null }],
      100,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('buildPrepaidAndRemainderPayments', () => {
  it('yarısı nakit yarısı cari — birincil yöntem açık cari', () => {
    const rows = buildPrepaidAndRemainderPayments({
      method: 'NAKIT',
      collected: 40,
      invoiceTotal: 100,
      cashRegisterId: 'kasa-1',
    });
    expect(rows).toEqual([
      expect.objectContaining({ method: 'NAKIT', amount: 40, cashRegisterId: 'kasa-1' }),
      expect.objectContaining({ method: 'ACIK_CARI', amount: 60, cashRegisterId: null }),
    ]);
    expect(resolvePrimaryInvoicePaymentMethod(rows, 'NAKIT')).toBe('ACIK_CARI');
  });

  it('tam tahsilatta yalnızca peşin satır kalır', () => {
    const rows = buildPrepaidAndRemainderPayments({
      method: 'KREDIKARTI',
      collected: 80,
      invoiceTotal: 80,
      cashRegisterId: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe('KREDIKARTI');
    expect(resolvePrimaryInvoicePaymentMethod(rows, 'KREDIKARTI')).toBe('KREDIKARTI');
  });
});
