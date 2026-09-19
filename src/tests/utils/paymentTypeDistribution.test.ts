import { describe, expect, it } from 'vitest';
import {
  allocateSaleAmountsByFormCode,
  buildPaymentTypeDistribution,
  buildPaymentTypeMovements,
} from '../../utils/paymentTypeDistribution';

describe('paymentTypeDistribution', () => {
  it('yapıdaki tüm form kodlarını sıfır tutarla listeler', () => {
    const dist = buildPaymentTypeDistribution([], { includeZero: true });
    expect(dist.types.map((t) => t.code)).toEqual([
      'NAKIT',
      'KREDIKARTI',
      'ACIK_CARI',
      'HAVAL',
      'CEK',
      'SENET',
    ]);
    expect(dist.types.every((t) => t.amount === 0)).toBe(true);
  });

  it('tek ödeme yöntemini form koduna yazar', () => {
    const split = allocateSaleAmountsByFormCode(100_000, null, 'Nakit');
    expect(split.NAKIT).toBe(100_000);
    expect(split.KREDIKARTI).toBe(0);
  });

  it('çoklu ödemede çek / senet ayrı tipte görünür', () => {
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: '1',
          total: 150,
          paymentMethod: 'mixed',
          payments: [
            { method: 'NAKIT', amount: 50 },
            { method: 'CEK', amount: 40 },
            { method: 'SENET', amount: 60 },
          ],
          receiptNumber: 'F-1',
          date: '2024-09-19',
        },
      ],
      { includeZero: true },
    );
    expect(dist.byCode.NAKIT.amount).toBe(50);
    expect(dist.byCode.CEK.amount).toBe(40);
    expect(dist.byCode.SENET.amount).toBe(60);
  });

  it('tip hareket listesini filtreler', () => {
    const rows = buildPaymentTypeMovements(
      [
        {
          id: 'a',
          total: 10,
          paymentMethod: 'card',
          receiptNumber: 'R1',
          date: '2024-09-18',
        },
        {
          id: 'b',
          total: 20,
          paymentMethod: 'cash',
          receiptNumber: 'R2',
          date: '2024-09-19',
        },
      ],
      'NAKIT',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].receiptNumber).toBe('R2');
    expect(rows[0].amount).toBe(20);
  });
});
