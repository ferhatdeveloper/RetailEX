/**
 * Günlük rapor Satış Detayları.
 * 6 fiş varken liste 6 satır döner. 5. ve 6. eklenince ilk 4 durur.
 * Dip toplam 6 satırın toplamıdır, son 4'ün değil.
 * İade bir kez eksidir. İndirim nete ikinci kez eklenmez.
 * Mahsup peşinat listede kalır ve nete ikinci kez yazılmaz.
 */
import { describe, expect, it } from 'vitest';
import { dailySalesDetailNetAmount } from '../../utils/dailySalesDetailNet';
import {
  assembleDailySalesDetailRows,
  filterDailySalesDetailRows,
  mergeUnmirroredPeriodFiches,
  passesDailySalesDetailList,
  sumListedDailySalesDetailFooter,
  type DailySalesDetailListRow,
} from '../../utils/dailySalesDetailRows';

interface Fiche extends DailySalesDetailListRow {
  id: string;
  receiptNumber: string;
  customerName: string;
  beforeDiscount: number;
  total: number;
  discount: number;
  isReturn?: boolean;
  isAvans?: boolean;
  isDeposit?: boolean;
  isForfeitedDeposit?: boolean;
  notes?: string;
}

function fiche(partial: Fiche): Fiche {
  return partial;
}

const firstFour: Fiche[] = [
  fiche({
    id: 'bea-2',
    receiptNumber: 'BEA-2026-00002',
    customerName: 'roza',
    beforeDiscount: 15_000,
    total: 15_000,
    discount: 0,
  }),
  fiche({
    id: 'bea-3',
    receiptNumber: 'BEA-2026-00003',
    customerName: 'FERHAT',
    beforeDiscount: 25_000,
    total: 25_000,
    discount: 5_000,
  }),
  fiche({
    id: 'avans-iptal',
    receiptNumber: 'AVANS-db01faa6',
    customerName: 'roza',
    beforeDiscount: 0,
    total: 5_000,
    discount: 0,
    isAvans: true,
    isForfeitedDeposit: true,
  }),
  fiche({
    id: 'iade-6',
    receiptNumber: '00006',
    customerName: 'roza',
    beforeDiscount: -15_000,
    total: -15_000,
    discount: 0,
    isReturn: true,
  }),
];

const fifth = fiche({
  id: 'bea-1',
  receiptNumber: 'BEA-2026-00001',
  customerName: 'roza',
  beforeDiscount: 10_000,
  total: 10_000,
  discount: 0,
});

const sixth = fiche({
  id: 'bea-4',
  receiptNumber: 'BEA-2026-00004',
  customerName: 'FERHAT',
  beforeDiscount: 8_000,
  total: 8_000,
  discount: 0,
});

const six = [...firstFour, fifth, sixth];

describe('günlük rapor satış detayları satır kaybı', () => {
  it('6 fiş 6 satır döner; 5. ve 6. eklenince ilk 4 durur', () => {
    const early = assembleDailySalesDetailRows(firstFour);
    const listed = assembleDailySalesDetailRows(six);
    expect(early).toHaveLength(4);
    expect(listed).toHaveLength(6);
    expect(listed.slice(0, 4).map((row) => row.id)).toEqual(early.map((row) => row.id));
    expect(listed.map((row) => row.receiptNumber)).toEqual([
      'BEA-2026-00002',
      'BEA-2026-00003',
      'AVANS-db01faa6',
      '00006',
      'BEA-2026-00001',
      'BEA-2026-00004',
    ]);
  });

  it('aynı müşteri ve yeni fiş numarası eski satırı ezmez', () => {
    const listed = assembleDailySalesDetailRows(six);
    const roza = listed.filter((row) => row.customerName === 'roza');
    expect(roza.map((row) => row.id)).toEqual(['bea-2', 'avans-iptal', 'iade-6', 'bea-1']);
  });

  it('aynı kimlik bir kez durur; sonraki kopya ilk tutarı değiştirmez', () => {
    const copy = { ...firstFour[0], total: 99_000, beforeDiscount: 99_000 };
    const listed = assembleDailySalesDetailRows([...firstFour, copy]);
    expect(listed).toHaveLength(4);
    expect(listed[0].total).toBe(15_000);
  });

  it('dip toplam 6 satırdır, son 4 değildir; iade bir kez eksi; indirim nete eklenmez', () => {
    const listed = filterDailySalesDetailRows(assembleDailySalesDetailRows(six), 'all');
    expect(listed).toHaveLength(6);
    const footer = sumListedDailySalesDetailFooter(listed);
    const lastFour = sumListedDailySalesDetailFooter(listed.slice(-4));
    expect(footer).not.toBe(lastFour);

    const serviceNet = dailySalesDetailNetAmount(listed[1]);
    expect(serviceNet).toBe(20_000);
    expect(dailySalesDetailNetAmount(listed[3])).toBe(-15_000);

    const withoutReturn = sumListedDailySalesDetailFooter(listed.filter((row) => row.id !== 'iade-6'));
    expect(footer).toBe(withoutReturn - 15_000);
    expect(footer).toBe(15_000 + 20_000 + 5_000 - 15_000 + 10_000 + 8_000);
    expect(footer).not.toBe(15_000 + 25_000 + 5_000 - 15_000 + 10_000 + 8_000);
    expect(footer).not.toBe(15_000 + 15_000 + 5_000 - 15_000 + 10_000 + 8_000);
  });

  it('mahsup peşinat listede kalır ve nete ikinci kez yazılmaz', () => {
    const settled = fiche({
      id: 'avans-uygulanan',
      receiptNumber: 'AVANS-eski',
      customerName: 'roza',
      beforeDiscount: 7_000,
      total: 7_000,
      discount: 0,
      isAvans: true,
    });
    const listed = filterDailySalesDetailRows(
      assembleDailySalesDetailRows([...six, settled]),
      'all',
    );
    expect(listed).toHaveLength(7);
    expect(listed.some((row) => row.id === 'avans-uygulanan')).toBe(true);
    expect(sumListedDailySalesDetailFooter(listed)).toBe(
      sumListedDailySalesDetailFooter(six),
    );
    expect(passesDailySalesDetailList(settled, 'service')).toBe(false);
    expect(passesDailySalesDetailList(settled, 'product')).toBe(false);
    expect(passesDailySalesDetailList(firstFour[2], 'all')).toBe(true);
  });

  it('aynı fişin güzellik kopyası ilk satırı ezmez; farklı fiş eklenir', () => {
    const mirror = {
      id: 'beauty-copy',
      receiptNumber: 'BEA-2026-00002',
      notes: 'beauty_sale_id:11111111-1111-1111-1111-111111111111',
      total: 1,
    };
    const fresh = {
      id: '22222222-2222-2222-2222-222222222222',
      receiptNumber: 'BEA-2026-00005',
      total: 4_000,
      beforeDiscount: 4_000,
      discount: 0,
    };
    const merged = mergeUnmirroredPeriodFiches(firstFour, [mirror, fresh]);
    expect(merged).toHaveLength(5);
    expect(merged[0].total).toBe(15_000);
    expect(merged.map((row) => row.id)).toContain('bea-2');
    expect(merged.map((row) => row.id)).toContain(fresh.id);
    expect(merged.map((row) => row.id)).not.toContain('beauty-copy');
  });
});
