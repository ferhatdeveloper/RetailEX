/**
 * Merkez 10 USD, QiCard'a 4 USD virman.
 * Merkez 6, QiCard 4, nakit toplam 10.
 * Virman gider kolonuna yazılmaz. Rezervasyon toplama eklenmez.
 * IQD toplamı değişmez.
 */
import { describe, expect, it } from 'vitest';
import { computeKasaIslemiSign } from '../../services/api/kasa';
import {
  cashFlowVirmanColumns,
  cashTotalsByCurrency,
  cashVirmanDirection,
  withCashVirmanLines,
} from '../../utils/cashVirman';
import {
  cashRegisterDistributionLines,
  cashRegisterDrawerLines,
  cashRegisterStatusFromLedger,
  sumCashRegisterDistribution,
} from '../../utils/cashStatusTotals';

const DAY = '2026-10-24';

describe('kasalar arası virman — nakit toplamı dağılır, düşmez', () => {
  const registers = [
    { id: 'merkez', code: 'KASA.001', name: 'MERKEZ KASA' },
    { id: 'qicard', code: 'KASA.002', name: 'QiCard' },
    { id: 'iqd', code: 'KASA.003', name: 'IQD KASA' },
  ];

  function usdLines(extra: Array<Record<string, unknown>> = []) {
    return [
      {
        id: 'giris-usd',
        kasa_id: 'merkez',
        islem_tipi: 'KASA_GIRIS',
        tutar: 10,
        doviz_kodu: 'USD',
        payment_method: 'cash',
        islem_tarihi: DAY,
        islem_no: 'GIRIS-USD',
      },
      {
        id: 'virman-usd',
        kasa_id: 'merkez',
        target_register_id: 'qicard',
        islem_tipi: 'VIRMAN',
        tutar: 4,
        sign: -1,
        doviz_kodu: 'USD',
        payment_method: 'cash',
        islem_tarihi: DAY,
        islem_no: 'VRM-USD-1',
      },
      {
        id: 'giris-iqd',
        kasa_id: 'iqd',
        islem_tipi: 'KASA_GIRIS',
        tutar: 100,
        doviz_kodu: 'IQD',
        payment_method: 'cash',
        islem_tarihi: DAY,
        islem_no: 'GIRIS-IQD',
      },
      {
        id: 'rez-iqd',
        kasa_id: 'iqd',
        islem_tipi: 'CH_TAHSILAT',
        tutar: 15,
        ozel_kod: 'REZERVASYON',
        doviz_kodu: 'IQD',
        payment_method: 'cash',
        islem_tarihi: DAY,
        islem_no: 'REZ-IQD',
      },
      ...extra,
    ];
  }

  it('hedef satırı yokken Merkez 6, QiCard 4, toplam 10; gider ve rezervasyon eklenmez', () => {
    const lines = usdLines();
    const rows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: DAY,
      dateTo: DAY,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const merkez = rows.find((row) => row.id === 'merkez');
    const qicard = rows.find((row) => row.id === 'qicard');
    const iqd = rows.find((row) => row.id === 'iqd');
    const drawer = cashRegisterDrawerLines(rows);
    const listed = cashRegisterDistributionLines(rows);

    expect(merkez?.closingCash).toBe(6);
    expect(qicard?.closingCash).toBe(4);
    expect(merkez?.payCash).toBe(6);
    expect(qicard?.payCash).toBe(4);
    expect(merkez?.expense).toBe(0);
    expect(qicard?.expense).toBe(0);
    expect(merkez?.reservationDeposit).toBe(0);
    expect(qicard?.reservationDeposit).toBe(0);
    expect((merkez?.closingCash || 0) + (qicard?.closingCash || 0)).toBe(10);
    expect((merkez?.payCash || 0) + (qicard?.payCash || 0)).toBe(10);

    expect(drawer.find((row) => row.id === 'merkez')?.balance).toBe(6);
    expect(drawer.find((row) => row.id === 'qicard')?.balance).toBe(4);
    expect(drawer.find((row) => row.id === 'merkez')?.expense).toBe(0);
    expect(drawer.find((row) => row.id === 'qicard')?.cash).toBe(4);
    expect(
      (drawer.find((row) => row.id === 'merkez')?.balance || 0)
      + (drawer.find((row) => row.id === 'qicard')?.balance || 0),
    ).toBe(10);

    const usdListed = listed.filter((row) => row.id === 'merkez' || row.id === 'qicard');
    expect(sumCashRegisterDistribution(usdListed)).toBe(10);

    expect(iqd?.closingCash).toBe(115);
    expect(iqd?.reservationDeposit).toBe(15);
    expect(iqd?.grandTotal).toBe(115);
    expect(iqd?.grandTotal).not.toBe(130);
    expect(iqd?.expense).toBe(0);

    const byCurrency = cashTotalsByCurrency(lines, (line) => computeKasaIslemiSign(String(line.islem_tipi || '')));
    expect(byCurrency.find((row) => row.currency === 'USD')?.total).toBe(10);
    expect(byCurrency.find((row) => row.currency === 'USD')?.registers).toEqual([
      { registerId: 'merkez', balance: 6 },
      { registerId: 'qicard', balance: 4 },
    ]);
    expect(byCurrency.find((row) => row.currency === 'IQD')?.total).toBe(115);
    expect(byCurrency.find((row) => row.currency === 'IQD')?.total).not.toBe(10);
    expect(byCurrency.find((row) => row.currency === 'IQD')?.total).not.toBe(115 + 4);
  });

  it('gider kolonu virmanı ikinci kez düşmez', () => {
    const lines = usdLines([
      {
        id: 'gider-usd',
        kasa_id: 'merkez',
        islem_tipi: 'GIDER_PUSULASI',
        tutar: 2,
        doviz_kodu: 'USD',
        payment_method: 'cash',
        islem_tarihi: DAY,
        islem_no: 'GDR-USD',
      },
    ]);
    const rows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: DAY,
      dateTo: DAY,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const merkez = rows.find((row) => row.id === 'merkez');
    const qicard = rows.find((row) => row.id === 'qicard');
    expect(merkez?.expense).toBe(2);
    expect(merkez?.expense).not.toBe(6);
    expect(qicard?.expense).toBe(0);
    expect(merkez?.closingCash).toBe(4);
    expect(qicard?.closingCash).toBe(4);
    expect((merkez?.closingCash || 0) + (qicard?.closingCash || 0)).toBe(8);
    const usd = cashTotalsByCurrency(lines, (line) => computeKasaIslemiSign(String(line.islem_tipi || '')))
      .find((row) => row.currency === 'USD');
    expect(usd?.total).toBe(8);
    expect(usd?.total).not.toBe(6);
  });

  it('hedef satırı ve eski çift hedef satırı tek giriş sayılır', () => {
    const lines = [
      {
        id: 'giris',
        kasa_id: 'merkez',
        islem_tipi: 'KASA_GIRIS',
        tutar: 10,
        doviz_kodu: 'USD',
        islem_tarihi: DAY,
        islem_no: 'GIRIS',
      },
      {
        id: 'kaynak',
        kasa_id: 'merkez',
        target_register_id: 'qicard',
        islem_tipi: 'VIRMAN',
        tutar: 4,
        sign: -1,
        doviz_kodu: 'USD',
        islem_tarihi: DAY,
        islem_no: 'VRM-1',
      },
      {
        id: 'hedef',
        kasa_id: 'qicard',
        target_register_id: 'merkez',
        islem_tipi: 'VIRMAN',
        tutar: 4,
        sign: 1,
        doviz_kodu: 'USD',
        islem_tarihi: DAY,
        islem_no: 'VRM-1-VRM',
      },
      {
        id: 'hedef-eski',
        kasa_id: 'qicard',
        target_register_id: 'merkez',
        islem_tipi: 'VIRMAN_TARGET',
        tutar: 4,
        sign: 1,
        doviz_kodu: 'USD',
        islem_tarihi: DAY,
        islem_no: 'VRM-1-VRM',
      },
    ];
    const rows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: DAY,
      dateTo: DAY,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows.find((row) => row.id === 'merkez')?.closingCash).toBe(6);
    expect(rows.find((row) => row.id === 'qicard')?.closingCash).toBe(4);
    expect(rows.find((row) => row.id === 'qicard')?.closingCash).not.toBe(8);
    expect(rows.find((row) => row.id === 'qicard')?.closingCash).not.toBe(-4);
  });
});

describe('nakit akış virman — hedef giriş, kaynak çıkış', () => {
  it('eksik hedef satırını giriş yazar, aynı virmanı iki çıkış saymaz', () => {
    const prepared = withCashVirmanLines([
      {
        id: 'iqd-giris',
        registerId: 'iqd',
        transactionType: 'KASA_GIRIS',
        ficheNo: 'IQD-1',
        amount: 100,
        sign: 1,
        currency: 'IQD',
        date: DAY,
      },
      {
        id: 'kaynak',
        registerId: 'merkez',
        registerName: 'MERKEZ KASA',
        targetRegisterId: 'qicard',
        targetRegisterName: 'QiCard',
        transactionType: 'VIRMAN',
        ficheNo: 'VRM-USD-1',
        amount: 4,
        sign: -1,
        currency: 'USD',
        date: DAY,
      },
    ]);
    const merkez = prepared.find((row) => row.registerId === 'merkez');
    const qicard = prepared.find((row) => row.registerId === 'qicard');
    expect(cashVirmanDirection(merkez)).toBe(-1);
    expect(cashVirmanDirection(qicard)).toBe(1);
    expect(cashFlowVirmanColumns(merkez)).toEqual({ inflow: 0, outflow: 4, net: -4 });
    expect(cashFlowVirmanColumns(qicard)).toEqual({ inflow: 4, outflow: 0, net: 4 });
    expect(qicard?.registerName).toBe('QiCard');

    const virman = prepared.filter((row) => String(row.transactionType || '').includes('VIRMAN') || row.islem_tipi === 'VIRMAN_TARGET' || row.transactionType === 'VIRMAN_TARGET');
    const columns = virman.map((row) => cashFlowVirmanColumns(row));
    const inflow = columns.reduce((sum, row) => sum + (row?.inflow || 0), 0);
    const outflow = columns.reduce((sum, row) => sum + (row?.outflow || 0), 0);
    expect(inflow).toBe(4);
    expect(outflow).toBe(4);
    expect(inflow - outflow).toBe(0);
    expect(outflow).not.toBe(8);

    const totals = cashTotalsByCurrency(prepared, (line) => (Number(line.sign) < 0 ? -1 : 1));
    expect(totals.find((row) => row.currency === 'IQD')?.total).toBe(100);
    expect(totals.find((row) => row.currency === 'USD')?.total).toBe(0);
  });
});
