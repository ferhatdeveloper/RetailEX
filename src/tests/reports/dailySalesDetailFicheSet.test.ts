/**
 * Günlük rapor Satış Detayları.
 * Aynı müşterinin bir fişi iptal olunca diğeri listede kalır.
 * İptal peşinatı yalnız iptal edilen faturanın tutarıdır.
 * 6 fiş 6 satırdır. 7. eklenince ilk 6 durur.
 * Dip toplam son 4'ün değil, bütün satırların toplamıdır.
 * Net = ciro + rezervasyon − iade − gider.
 * Kapanan peşinat satırı listede yoktur ve ciroya ikinci kez eklenmez.
 */
import { describe, expect, it } from 'vitest';
import {
  bindInvoiceCancellations,
  cancelledInvoiceDeposit,
  ficheIsCancelTarget,
  listDailyScreenFiches,
  summarizeDailyScreenFiches,
  type DailyScreenFiche,
} from '../../utils/dailySalesDetailFicheSet';

function fiche(partial: DailyScreenFiche): DailyScreenFiche {
  return partial;
}

const firstSix: DailyScreenFiche[] = [
  fiche({
    id: 'bea-1',
    receiptNumber: 'BEA-2026-00001',
    customerName: 'ROZA',
    revenue: 10_000,
  }),
  fiche({
    id: 'bea-2',
    receiptNumber: 'BEA-2026-00002',
    customerName: 'ROZA',
    revenue: 15_000,
  }),
  fiche({
    id: 'bea-3',
    receiptNumber: 'BEA-2026-00003',
    customerName: 'ferhat',
    revenue: 75_000,
  }),
  fiche({
    id: 'avans-acik',
    receiptNumber: 'AVANS-40c3d134',
    customerName: 'ROZA',
    depositAmount: 5_000,
    openDeposit: true,
  }),
  fiche({
    id: 'avans-iptal',
    receiptNumber: 'AVANS-02288e0f',
    customerName: 'ROZA',
    depositAmount: 5_000,
    ownCancelled: true,
  }),
  fiche({
    id: 'gider-kira',
    receiptNumber: 'KL-MVO4HRS-RWOC64',
    customerName: 'kira',
    expenseAmount: 30_000,
  }),
];

describe('günlük rapor fiş kümesi', () => {
  it('6 fiş 6 satırdır; 7. eklenince ilk 6 durur', () => {
    const early = listDailyScreenFiches(firstSix);
    const seventh = fiche({
      id: 'iade-1',
      receiptNumber: 'IADE-00007',
      customerName: 'ROZA',
      returnAmount: 10_000,
    });
    const listed = listDailyScreenFiches([...firstSix, seventh]);
    expect(early).toHaveLength(6);
    expect(listed).toHaveLength(7);
    expect(listed.slice(0, 6).map((row) => row.id)).toEqual(early.map((row) => row.id));
    expect(listed.map((row) => row.receiptNumber)).toContain('BEA-2026-00001');
    expect(listed.map((row) => row.receiptNumber)).toContain('BEA-2026-00003');
  });

  it('aynı kimlik bir kez durur; müşteri adı eski fişi ezmez', () => {
    const copy = { ...firstSix[0], revenue: 99_000 };
    const listed = listDailyScreenFiches([...firstSix, copy]);
    expect(listed).toHaveLength(6);
    expect(listed[0].revenue).toBe(10_000);
    const roza = listed.filter((row) => row.customerName === 'ROZA');
    expect(roza.map((row) => row.id)).toEqual(['bea-1', 'bea-2', 'avans-acik', 'avans-iptal']);
  });

  it('aynı müşterinin bir fişi iptal olunca diğeri düşmez', () => {
    const listed = bindInvoiceCancellations(firstSix, ['AVANS-02288e0f']);
    const open = listed.find((row) => row.id === 'avans-acik');
    const cancelled = listed.find((row) => row.id === 'avans-iptal');
    const older = listed.find((row) => row.id === 'bea-1');
    expect(listed).toHaveLength(6);
    expect(open?.ownCancelled).not.toBe(true);
    expect(open?.openDeposit).toBe(true);
    expect(cancelled?.ownCancelled).toBe(true);
    expect(older?.ownCancelled).not.toBe(true);
    expect(older?.revenue).toBe(10_000);
    expect(ficheIsCancelTarget(
      { id: 'avans-acik', receiptNumber: 'AVANS-40c3d134', customerName: 'ROZA' },
      ['ROZA'],
    )).toBe(false);
  });

  it('iptal peşinatı yalnız iptal edilen faturanın tutarıdır', () => {
    const listed = bindInvoiceCancellations(firstSix, ['avans-iptal']);
    expect(cancelledInvoiceDeposit(listed, 'avans-iptal')).toBe(5_000);
    expect(cancelledInvoiceDeposit(listed, 'AVANS-02288e0f')).toBe(5_000);
    expect(cancelledInvoiceDeposit(listed, 'avans-iptal')).not.toBe(10_000);
    expect(cancelledInvoiceDeposit(listed, 'ROZA')).toBe(0);
  });

  it('dip toplam son 4 değildir; net = ciro + rezervasyon − iade − gider', () => {
    const screen = summarizeDailyScreenFiches(firstSix, ['avans-iptal']);
    expect(screen.rows).toHaveLength(6);
    const lastFour = summarizeDailyScreenFiches(screen.rows.slice(-4), ['avans-iptal']);
    expect(screen.footer).not.toBe(lastFour.footer);
    expect(screen.revenue).toBe(100_000);
    expect(screen.reservation).toBe(10_000);
    expect(screen.returns).toBe(0);
    expect(screen.expenses).toBe(30_000);
    expect(screen.net).toBe(100_000 + 10_000 - 0 - 30_000);
    expect(screen.footer).toBe(screen.net);

    const withReturn = summarizeDailyScreenFiches([
      ...firstSix,
      fiche({
        id: 'iade-1',
        receiptNumber: 'IADE-00007',
        customerName: 'ROZA',
        returnAmount: 10_000,
      }),
    ], ['avans-iptal']);
    expect(withReturn.rows).toHaveLength(7);
    expect(withReturn.rows.slice(0, 6).map((row) => row.id)).toEqual(screen.rows.map((row) => row.id));
    expect(withReturn.net).toBe(100_000 + 10_000 - 10_000 - 30_000);
    expect(withReturn.net).not.toBe(100_000 + 10_000 - 10_000 - 10_000 - 30_000);
  });

  it('kapanan peşinat satırı listede yoktur ve ciroya ikinci kez eklenmez; açık peşinat kutuda kalır', () => {
    const closed = fiche({
      id: 'avans-kapali',
      receiptNumber: 'AVANS-KAPALI',
      customerName: 'ROZA',
      depositAmount: 5_000,
      closed: true,
    });
    const screen = summarizeDailyScreenFiches([...firstSix, closed], ['avans-iptal']);
    expect(screen.rows.map((row) => row.id)).not.toContain('avans-kapali');
    expect(screen.rows).toHaveLength(6);
    expect(screen.rows.map((row) => row.id)).toContain('bea-1');
    expect(screen.revenue).toBe(100_000);
    expect(screen.revenue).not.toBe(105_000);
    expect(screen.reservation).toBe(10_000);
    expect(screen.reservation).not.toBe(15_000);
    expect(cancelledInvoiceDeposit(screen.rows, 'avans-iptal')).toBe(5_000);
    expect(screen.net).toBe(80_000);
  });
});
