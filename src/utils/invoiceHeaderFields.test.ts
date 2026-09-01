/**
 * invoiceHeaderFields.test.ts
 *
 * 2026-09-01 — Çoklu ödeme (Market POS pattern) desteği eklendikten
 * sonra buildInvoiceHeaderFieldsFromForm'un:
 *   - cash_register_id / name / code alanlarını yazdığını
 *   - payments array'ini normalize edip her satırda cash_register_id
 *     alanlarını koruduğunu
 *   - boş/null değerleri atladığını
 *   - eski davranışla uyumlu kaldığını
 * doğrular.
 */

import { describe, it, expect } from 'vitest';
import { buildInvoiceHeaderFieldsFromForm } from './invoiceHeaderFields';

describe('buildInvoiceHeaderFieldsFromForm', () => {
  it('temel alanları (documentNo, time, vb.) yazar', () => {
    const out = buildInvoiceHeaderFieldsFromForm({
      documentNo: 'DOC-1',
      time: '20:45:29',
      footerDiscountMode: 'percentage',
      footerDiscountPercent: 5,
      footerDiscountAmount: 0,
    });
    expect(out.documentNo).toBe('DOC-1');
    expect(out.time).toBe('20:45:29');
    expect(out.footerDiscountMode).toBe('percentage');
    expect(out.footerDiscountPercent).toBe('5');
    expect(out.footerDiscountAmount).toBeUndefined();
  });

  it('cash_register_id/name/code alanlarını cashRegister objesinden yazar', () => {
    const out = buildInvoiceHeaderFieldsFromForm({
      cashRegister: {
        id: '9a031bdb-a03e-4db9-9d4f-5c80c7e043ef',
        name: 'MERKEZ KASA',
        code: 'MK01',
      },
    });
    expect(out.cash_register_id).toBe('9a031bdb-a03e-4db9-9d4f-5c80c7e043ef');
    expect(out.cash_register_name).toBe('MERKEZ KASA');
    expect(out.cash_register_code).toBe('MK01');
  });

  it('cashRegister null değerler içeriyorsa alanları yazmaz', () => {
    const out = buildInvoiceHeaderFieldsFromForm({
      cashRegister: { id: '', name: '', code: '' },
    });
    expect(out.cash_register_id).toBeUndefined();
    expect(out.cash_register_name).toBeUndefined();
    expect(out.cash_register_code).toBeUndefined();
  });

  it('payments array\'i normalize edip yazar', () => {
    const out = buildInvoiceHeaderFieldsFromForm({
      payments: [
        {
          method: 'NAKIT',
          amount: 100000,
          currency: 'IQD',
          cash_register_id: 'reg-1',
          cash_register_name: 'MERKEZ KASA',
          cash_register_code: 'MK01',
        },
        {
          method: 'KREDIKARTI',
          amount: 50000,
          currency: 'IQD',
          cash_register_id: 'reg-2',
          cash_register_name: 'KART KASA',
          cash_register_code: 'KK01',
        },
      ],
    });
    expect(Array.isArray(out.payments)).toBe(true);
    expect(out.payments?.length).toBe(2);
    expect(out.payments?.[0].method).toBe('NAKIT');
    expect(out.payments?.[0].amount).toBe(100000);
    expect(out.payments?.[0].currency).toBe('IQD');
    expect(out.payments?.[0].cash_register_id).toBe('reg-1');
    expect(out.payments?.[1].method).toBe('KREDIKARTI');
    expect(out.payments?.[1].amount).toBe(50000);
    expect(out.payments?.[1].cash_register_name).toBe('KART KASA');
  });

  it('boş payments array yazmaz', () => {
    const out = buildInvoiceHeaderFieldsFromForm({ payments: [] });
    expect(out.payments).toBeUndefined();
  });

  it('payments içindeki amount sayı değilse 0 yazılır', () => {
    const out = buildInvoiceHeaderFieldsFromForm({
      payments: [
        { method: 'NAKIT', amount: 'abc' as any, currency: 'IQD', cash_register_id: null },
      ],
    });
    expect(out.payments?.[0].amount).toBe(0);
  });

  it('geriye dönük uyumluluk: cashRegister ve payments birlikte verilebilir', () => {
    const out = buildInvoiceHeaderFieldsFromForm({
      documentNo: 'DOC-9',
      cashRegister: {
        id: 'reg-1',
        name: 'MERKEZ KASA',
        code: 'MK01',
      },
      payments: [
        { method: 'NAKIT', amount: 100, currency: 'IQD', cash_register_id: 'reg-1' },
      ],
    });
    expect(out.documentNo).toBe('DOC-9');
    expect(out.cash_register_id).toBe('reg-1');
    expect(out.cash_register_name).toBe('MERKEZ KASA');
    expect(out.payments?.length).toBe(1);
    expect(out.payments?.[0].amount).toBe(100);
  });
});
