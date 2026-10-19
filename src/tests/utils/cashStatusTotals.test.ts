/**
 * Kasa Durumu — rezervasyon nakdi günlük nakde dahildir, genel toplam çift saymaz.
 *
 * Ekran örneği: hizmet nakdi 35.000 + rezervasyon 15.000.
 * Günlük nakit 50.000, kapanış 50.000, nakit satırı 50.000, genel toplam 50.000.
 */
import { describe, expect, it } from 'vitest';
import {
  foldReservationIntoCashStatus,
  listCashRegisterStatus,
  mergeRegisterSeeds,
  seedsFromCashStatusSales,
  seedsFromRegisterCashLines,
} from '../../utils/cashStatusTotals';

const SCREEN_TYPES = [
  { code: 'NAKIT', amount: 35000 },
  { code: 'KREDIKARTI', amount: 0 },
  { code: 'ACIK_CARI', amount: 0 },
  { code: 'HAVAL', amount: 0 },
  { code: 'REZERVASYON_AVANS', amount: 15000 },
];

describe('foldReservationIntoCashStatus', () => {
  it('35.000 hizmet + 15.000 rezervasyon → nakit ve kapanış 50.000, genel toplam 50.000', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 35000,
      reservationCash: 15000,
      cashOut: 0,
      paymentTypes: SCREEN_TYPES,
    });

    expect(folded.todayCash).toBe(50000);
    expect(folded.closingCash).toBe(50000);
    expect(folded.reservationDeposit).toBe(15000);
    expect(folded.paymentTypes.find((row) => row.code === 'NAKIT')?.amount).toBe(50000);
    expect(folded.paymentTypes.find((row) => row.code === 'REZERVASYON_AVANS')?.informational).toBe(true);
    expect(folded.paymentTypes.find((row) => row.code === 'REZERVASYON_AVANS')?.amount).toBe(15000);
    expect(folded.grandTotal).toBe(50000);
    expect(folded.grandTotal).not.toBe(65000);
  });

  it('açılış ve nakit çıkış kapanışa yansır, rezervasyon yine bir kez sayılır', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 10000,
      serviceCash: 35000,
      reservationCash: 15000,
      cashOut: 5000,
      paymentTypes: SCREEN_TYPES,
    });
    expect(folded.todayCash).toBe(50000);
    expect(folded.closingCash).toBe(55000);
    expect(folded.grandTotal).toBe(50000);
  });

  it('kart + nakit + rezervasyon genel toplamı rezervasyonu ikinci kez eklemez', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 35000,
      cardAmount: 10000,
      reservationCash: 15000,
      cashOut: 0,
      paymentTypes: [
        { code: 'NAKIT', amount: 35000 },
        { code: 'KREDIKARTI', amount: 10000 },
        { code: 'REZERVASYON_AVANS', amount: 15000 },
      ],
    });
    expect(folded.todayCash).toBe(50000);
    expect(folded.grandTotal).toBe(60000);
    expect(folded.grandTotal).not.toBe(75000);
  });

  it('yalnız rezervasyon nakdi hem günlük nakittir hem genel toplamdır', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 0,
      reservationCash: 15000,
      cashOut: 0,
      paymentTypes: [
        { code: 'NAKIT', amount: 0 },
        { code: 'REZERVASYON_AVANS', amount: 15000 },
      ],
    });
    expect(folded.todayCash).toBe(15000);
    expect(folded.closingCash).toBe(15000);
    expect(folded.grandTotal).toBe(15000);
    expect(folded.grandTotal).not.toBe(30000);
    expect(folded.grandTotal).not.toBe(0);
  });

  it('çek ve senet genel toplama girmez', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 35000,
      reservationCash: 0,
      cashOut: 0,
      paymentTypes: [
        { code: 'NAKIT', amount: 35000 },
        { code: 'CEK', amount: 8000 },
        { code: 'SENET', amount: 2000 },
      ],
    });
    expect(folded.grandTotal).toBe(35000);
    expect(folded.paymentTypes.find((row) => row.code === 'CEK')?.informational).toBe(true);
  });
});

describe('listCashRegisterStatus', () => {
  it('tek kasada 35.000 satış + 15.000 rezervasyon özetle aynıdır', () => {
    const sales = seedsFromCashStatusSales([
      {
        total: 35000,
        paymentMethod: 'cash',
        payments: [{ method: 'cash', amount: 35000, cash_register_id: 'k1' }],
        cashRegisterId: 'k1',
      },
    ]);
    const lines = seedsFromRegisterCashLines([
      {
        id: 'av-1',
        kasa_id: 'k1',
        islem_tipi: 'CH_TAHSILAT',
        ozel_kod: 'REZERVASYON',
        tutar: 15000,
      },
    ]);
    const rows = listCashRegisterStatus({
      registers: [{ id: 'k1', code: 'K1', name: 'Merkez Kasa' }],
      seeds: mergeRegisterSeeds([sales, lines]),
      company: {
        openingCash: 0,
        serviceCash: 35000,
        card: 0,
        transfer: 0,
        openAccount: 0,
        reservationCash: 15000,
        cashOut: 0,
      },
      unassignedLabel: 'Kasaya bağlanmayan',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Merkez Kasa');
    expect(rows[0].openingCash).toBe(0);
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].reservationDeposit).toBe(15000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].closingCash).toBe(50000);
    expect(rows[0].payCash).toBe(50000);
    expect(rows[0].grandTotal).toBe(50000);
    expect(rows[0].grandTotal).not.toBe(65000);
  });

  it('fişte kasa yoksa tek kasaya şirket toplamı yazılır', () => {
    const rows = listCashRegisterStatus({
      registers: [{ id: 'k1', code: 'K1', name: 'Ana Kasa' }],
      seeds: [],
      company: {
        openingCash: 0,
        serviceCash: 35000,
        card: 0,
        transfer: 0,
        openAccount: 0,
        reservationCash: 15000,
        cashOut: 0,
      },
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].grandTotal).toBe(50000);
    expect(rows[0].reservationDeposit).toBe(15000);
  });

  it('iki kasada rezervasyon kendi kasasında kalır, bağlanmayan satış ayrı satırdır', () => {
    const rows = listCashRegisterStatus({
      registers: [
        { id: 'k1', code: 'K1', name: 'Kasa A' },
        { id: 'k2', code: 'K2', name: 'Kasa B' },
      ],
      seeds: seedsFromRegisterCashLines([
        {
          id: 'av-1',
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          ozel_kod: 'REZERVASYON',
          tutar: 15000,
        },
      ]),
      company: {
        openingCash: 0,
        serviceCash: 35000,
        card: 0,
        transfer: 0,
        openAccount: 0,
        reservationCash: 15000,
        cashOut: 0,
      },
      unassignedLabel: 'Kasaya bağlanmayan',
    });

    const a = rows.find((row) => row.id === 'k1');
    const loose = rows.find((row) => row.id === '__unassigned__');
    expect(a?.todayCash).toBe(15000);
    expect(a?.reservationDeposit).toBe(15000);
    expect(a?.grandTotal).toBe(15000);
    expect(loose?.todayCash).toBe(35000);
    expect(loose?.reservationDeposit).toBe(0);
    expect(loose?.grandTotal).toBe(35000);
    const grand = rows.reduce((sum, row) => sum + row.grandTotal, 0);
    expect(grand).toBe(50000);
    expect(grand).not.toBe(65000);
  });

  it('kasa ve hareket yoksa boş liste', () => {
    const rows = listCashRegisterStatus({
      registers: [],
      seeds: [],
      company: {
        openingCash: 0,
        serviceCash: 0,
        card: 0,
        transfer: 0,
        openAccount: 0,
        reservationCash: 0,
        cashOut: 0,
      },
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows).toEqual([]);
  });

  it('çek tahsilatı kasa tohumuna yazılmaz', () => {
    const seeds = seedsFromCashStatusSales([
      {
        total: 10000,
        paymentMethod: 'cek',
        payments: [{ method: 'cek', amount: 10000, cash_register_id: 'k1' }],
      },
    ]);
    expect(seeds).toEqual([]);
  });
});
