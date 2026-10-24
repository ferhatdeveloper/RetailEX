/**
 * Kasa Durumu — rezervasyon nakdi günlük nakde dahildir, genel toplam çift saymaz.
 *
 * Ekran örneği: hizmet nakdi 35.000 + rezervasyon 15.000.
 * Günlük nakit 50.000, kapanış 50.000, nakit satırı 50.000, genel toplam 50.000.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeCashBalanceForRegister } from '../../utils/cashBalance';
import { istanbulTodayDateKey, istanbulYearStartDateKey } from '../../utils/localCalendarDate';
import {
  buildCashStatusRange,
  emptyCashStatusDate,
  resolveCashStatusQuery,
} from '../../utils/reportDatePresets';
import type { KasaIslemi } from '../../services/api/kasa';
import {
  cashRefundsFromSales,
  cashRegisterDistributionLines,
  cashRegisterDrawerLines,
  cashRegisterExpenseGaps,
  cashRegisterRemaining,
  cashRegisterStatusFromLedger,
  cashRegisterNetGrandTotal,
  cashStatusBlockTotals,
  cashStatusDistributionListRows,
  cashStatusMovementRows,
  cashStatusThreeBoxes,
  cashStatusWithVouchers,
  foldReservationIntoCashStatus,
  paymentDistributionVisibleRows,
  listCashRegisterStatus,
  mergeRegisterSeeds,
  paymentReportGrandTotal,
  seedsFromCashStatusSales,
  seedsFromRegisterCashLines,
  sumCashRegisterDistribution,
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

  it('kredi kartı ve havale liste satırı gizlenir; toplam formülü kart ve havaleyi saymaya devam eder', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 40000,
      reservationCash: 10000,
      cashOut: 0,
      expense: 5000,
      paymentTypes: [
        { code: 'NAKIT', amount: 40000 },
        { code: 'KREDIKARTI', amount: 0 },
        { code: 'ACIK_CARI', amount: 0 },
        { code: 'HAVAL', amount: 0 },
        { code: 'REZERVASYON_AVANS', amount: 10000 },
      ],
    });

    expect(folded.todayCash).toBe(50000);
    expect(folded.reservationDeposit).toBe(10000);
    expect(folded.paymentTypes.find((row) => row.code === 'NAKIT')?.amount).toBe(50000);
    expect(folded.paymentTypes.find((row) => row.code === 'REZERVASYON_AVANS')?.informational).toBe(true);
    expect(folded.paymentTypes.find((row) => row.code === 'GIDER')?.amount).toBe(5000);
    expect(folded.grandTotal).toBe(45000);
    expect(folded.grandTotal).not.toBe(55000);

    const visible = cashStatusDistributionListRows(folded.paymentTypes).map((row) => row.code);
    expect(visible).toEqual(['NAKIT', 'ACIK_CARI', 'REZERVASYON_AVANS', 'GIDER']);
    expect(folded.paymentTypes.some((row) => row.code === 'KREDIKARTI')).toBe(true);
    expect(folded.paymentTypes.some((row) => row.code === 'HAVAL')).toBe(true);

    expect(paymentReportGrandTotal({
      cash: 50000,
      card: 0,
      openAccount: 0,
      transfer: 0,
      reservation: 10000,
      expense: 5000,
    })).toBe(45000);
    expect(paymentReportGrandTotal({
      cash: 50000,
      card: 8000,
      openAccount: 0,
      transfer: 2000,
      reservation: 10000,
      expense: 5000,
    })).toBe(55000);
  });

  it('ödeme dağılımı kart ve listesinden kredi kartı ile havale düşer; genel toplam 45.000 kalır', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 40000,
      cardAmount: 0,
      transferAmount: 0,
      reservationCash: 10000,
      cashOut: 0,
      expense: 5000,
      expenseCount: 1,
      paymentTypes: [
        { code: 'NAKIT', amount: 40000, label: 'Nakit' },
        { code: 'KREDIKARTI', amount: 0, label: 'Kredi Kartı' },
        { code: 'ACIK_CARI', amount: 0, label: 'Açık Cari Hesap' },
        { code: 'HAVAL', amount: 0, label: 'Havale/EFT' },
        { code: 'REZERVASYON_AVANS', amount: 10000, label: 'Rezervasyon Avansı' },
      ],
    });

    const visible = paymentDistributionVisibleRows(folded.paymentTypes);
    expect(visible.map((row) => row.code)).toEqual([
      'NAKIT',
      'ACIK_CARI',
      'REZERVASYON_AVANS',
      'GIDER',
    ]);
    expect(visible.find((row) => row.code === 'NAKIT')?.amount).toBe(50000);
    expect(visible.find((row) => row.code === 'ACIK_CARI')?.amount).toBe(0);
    expect(visible.find((row) => row.code === 'REZERVASYON_AVANS')?.amount).toBe(10000);
    expect(visible.find((row) => row.code === 'REZERVASYON_AVANS')?.informational).toBe(true);
    expect(visible.find((row) => row.code === 'GIDER')?.amount).toBe(5000);
    expect(visible.find((row) => row.code === 'GIDER')?.deduction).toBe(true);
    expect(folded.grandTotal).toBe(45000);
    expect(folded.grandTotal).not.toBe(55000);
    expect(folded.grandTotal).not.toBe(40000);
    expect(folded.paymentTypes.some((row) => row.code === 'KREDIKARTI')).toBe(true);
    expect(folded.paymentTypes.some((row) => row.code === 'HAVAL')).toBe(true);

    const withCardAndTransfer = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 40000,
      cardAmount: 8000,
      transferAmount: 2000,
      reservationCash: 10000,
      cashOut: 0,
      expense: 5000,
      paymentTypes: [
        { code: 'NAKIT', amount: 40000 },
        { code: 'KREDIKARTI', amount: 8000 },
        { code: 'ACIK_CARI', amount: 0 },
        { code: 'HAVAL', amount: 2000 },
        { code: 'REZERVASYON_AVANS', amount: 10000 },
      ],
    });
    expect(paymentDistributionVisibleRows(withCardAndTransfer.paymentTypes).map((row) => row.code))
      .toEqual(['NAKIT', 'ACIK_CARI', 'REZERVASYON_AVANS', 'GIDER']);
    expect(withCardAndTransfer.grandTotal).toBe(55000);
  });
});

describe('gider bir kez — nakit 465.000, açık cari 30.000', () => {
  it('gider 50.000 → genel toplam 445.000; rezervasyon +30.000 eklenmez', () => {
    const grand = paymentReportGrandTotal({
      cash: 465_000,
      card: 0,
      openAccount: 30_000,
      transfer: 0,
      reservation: 30_000,
      expense: 50_000,
    });
    expect(grand).toBe(445_000);
    expect(grand).not.toBe(495_000);
    expect(grand).not.toBe(465_000 + 30_000 + 30_000 - 50_000);
  });

  it('gider 0 ise genel toplam 495.000', () => {
    expect(paymentReportGrandTotal({
      cash: 465_000,
      card: 0,
      openAccount: 30_000,
      transfer: 0,
      reservation: 30_000,
      expense: 0,
    })).toBe(495_000);
  });

  it('kasa net 415.000 + açık cari 30.000, gider bakiyede düşmüş → 445.000, ikinci kez düşülmez', () => {
    const fromRegister = cashRegisterNetGrandTotal({
      registerNet: 415_000,
      card: 0,
      openAccount: 30_000,
      transfer: 0,
      reservation: 30_000,
      expense: 50_000,
    });
    const fromGross = paymentReportGrandTotal({
      cash: 415_000 + 50_000,
      card: 0,
      openAccount: 30_000,
      transfer: 0,
      reservation: 30_000,
      expense: 50_000,
    });
    expect(fromRegister).toBe(445_000);
    expect(fromRegister).toBe(fromGross);
    expect(fromRegister).not.toBe(415_000 + 30_000 - 50_000);
    expect(fromRegister).not.toBe(415_000 + 30_000 + 30_000);
  });

  it('fold rezervasyonu bilgi bırakır, gideri bir kez düşer, pastaya yazmaz', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 435_000,
      reservationCash: 30_000,
      cashOut: 0,
      expense: 50_000,
      expenseCount: 1,
      paymentTypes: [
        { code: 'NAKIT', amount: 435_000, count: 8 },
        { code: 'KREDIKARTI', amount: 0, count: 0 },
        { code: 'ACIK_CARI', amount: 30_000, count: 2 },
        { code: 'HAVAL', amount: 0, count: 0 },
        { code: 'REZERVASYON_AVANS', amount: 30_000, count: 1 },
      ],
    });
    const nakit = folded.paymentTypes.find((row) => row.code === 'NAKIT');
    const rezervasyon = folded.paymentTypes.find((row) => row.code === 'REZERVASYON_AVANS');
    const gider = folded.paymentTypes.find((row) => row.code === 'GIDER');
    expect(folded.todayCash).toBe(465_000);
    expect(nakit?.amount).toBe(465_000);
    expect(rezervasyon?.informational).toBe(true);
    expect(rezervasyon?.amount).toBe(30_000);
    expect(rezervasyon?.percentage).toBe(0);
    expect(gider?.deduction).toBe(true);
    expect(gider?.amount).toBe(50_000);
    expect(gider?.percentage).toBe(0);
    expect(gider?.count).toBe(1);
    expect(folded.collectionTotal).toBe(495_000);
    expect(folded.grandTotal).toBe(445_000);
    expect(nakit?.percentage).toBeCloseTo((465_000 / 495_000) * 100, 5);
  });

  it('fold gider kaydı yoksa satır 0 ve genel toplam 495.000', () => {
    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: 435_000,
      reservationCash: 30_000,
      cashOut: 0,
      expense: 0,
      paymentTypes: [
        { code: 'NAKIT', amount: 435_000 },
        { code: 'ACIK_CARI', amount: 30_000 },
        { code: 'REZERVASYON_AVANS', amount: 30_000 },
      ],
    });
    expect(folded.paymentTypes.find((row) => row.code === 'GIDER')?.amount).toBe(0);
    expect(folded.paymentTypes.find((row) => row.code === 'GIDER')?.deduction).toBe(true);
    expect(folded.grandTotal).toBe(495_000);
    expect(folded.collectionTotal).toBe(495_000);
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

  it('iskonto 1.500 kasa tohumunda açık cariye yazılmaz, nakit 138.500 kalır', () => {
    const seeds = seedsFromCashStatusSales([
      {
        total: 140_000,
        discount: 1_500,
        paymentMethod: 'nakit',
        payments: [{ method: 'NAKIT', amount: 138_500, cash_register_id: 'k1' }],
        cashRegisterId: 'k1',
      },
    ]);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].serviceCash).toBe(138_500);
    expect(seeds[0].openAccount ?? 0).toBe(0);
  });

  it('ACIK_CARI satırındaki 1.500 iskonto kasa tohumunda açık cariye yazılmaz', () => {
    const seeds = seedsFromCashStatusSales([
      {
        total: 130_000,
        discount: 1_500,
        paymentMethod: 'nakit',
        payments: [
          { method: 'NAKIT', amount: 128_500, cash_register_id: 'k1' },
          { method: 'ACIK_CARI', amount: 1_500, cash_register_id: 'k1' },
        ],
        cashRegisterId: 'k1',
      },
    ]);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].serviceCash).toBe(128_500);
    expect(seeds[0].openAccount ?? 0).toBe(0);
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

describe('cashRegisterStatusFromLedger — kasa kartı nakit/kart', () => {
  const day = '2026-10-19';
  const merkez = [{ id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' }];

  function line(partial: {
    kasa_id?: string;
    islem_tipi?: string;
    tutar: number;
    payment_method?: string | null;
    ozel_kod?: string;
    islem_tarihi?: string;
    is_reservation_deposit?: boolean;
    islem_no?: string;
    islem_aciklamasi?: string;
  }) {
    return {
      kasa_id: partial.kasa_id ?? 'k1',
      islem_tipi: partial.islem_tipi ?? 'CH_TAHSILAT',
      tutar: partial.tutar,
      payment_method: partial.payment_method,
      ozel_kod: partial.ozel_kod,
      islem_tarihi: partial.islem_tarihi ?? day,
      is_reservation_deposit: partial.is_reservation_deposit,
      islem_no: partial.islem_no,
      islem_aciklamasi: partial.islem_aciklamasi,
    };
  }

  it('bakiye 50.000 nakit tahsilat → nakit 50.000, kart 0, kapanış 50.000', () => {
    const lines = [line({ tutar: 50000, payment_method: 'cash' })];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const balance = computeCashBalanceForRegister('k1', lines as unknown as KasaIslemi[]);

    expect(balance).toBe(50000);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('KASA.001');
    expect(rows[0].name).toBe('MERKEZ KASA');
    expect(rows[0].openingCash).toBe(0);
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].payCash).toBe(50000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].payCard).toBe(0);
    expect(rows[0].closingCash).toBe(50000);
    expect(rows[0].closingCash).toBe(balance);
    expect(rows[0].grandTotal).toBe(50000);
  });

  it('ödeme yöntemi boş kasa girişi de nakittir', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [line({ islem_tipi: 'KASA_GIRIS', tutar: 50000, payment_method: null })],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].closingCash).toBe(50000);
  });

  it('kart tahsilatı nakde yazılmaz', () => {
    const lines = [
      line({ tutar: 40000, payment_method: 'cash' }),
      line({ tutar: 10000, payment_method: 'card' }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const balance = computeCashBalanceForRegister('k1', lines as unknown as KasaIslemi[]);

    expect(rows[0].todayCash).toBe(40000);
    expect(rows[0].todayCard).toBe(10000);
    expect(rows[0].payCard).toBe(10000);
    expect(rows[0].todayCash).not.toBe(50000);
    expect(rows[0].closingCash).toBe(50000);
    expect(rows[0].closingCash).toBe(balance);
    expect(rows[0].grandTotal).toBe(50000);
  });

  it('yalnız kart satırı nakit alanını doldurmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [line({ tutar: 50000, payment_method: 'Kredi Kartı' })],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows[0].todayCash).toBe(0);
    expect(rows[0].todayCard).toBe(50000);
    expect(rows[0].payCash).toBe(0);
    expect(rows[0].closingCash).toBe(50000);
  });

  it('çıkış bakiyeden düşer, nakit tahsilatı brüt kalır', () => {
    const lines = [
      line({ tutar: 50000, payment_method: 'cash' }),
      line({ islem_tipi: 'CH_ODEME', tutar: 10000, payment_method: 'cash' }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const balance = computeCashBalanceForRegister('k1', lines as unknown as KasaIslemi[]);
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].closingCash).toBe(40000);
    expect(rows[0].closingCash).toBe(balance);
  });

  it('rezervasyon nakdi günlük nakde bir kez girer, genel toplam 65.000 olmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({ tutar: 35000, payment_method: 'cash' }),
        line({ tutar: 15000, payment_method: 'Nakit', ozel_kod: 'REZERVASYON' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].reservationDeposit).toBe(15000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].grandTotal).toBe(50000);
    expect(rows[0].grandTotal).not.toBe(65000);
    expect(rows[0].closingCash).toBe(50000);
  });

  it('iki kasa birbirinin hareketini almaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: [
        { id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' },
        { id: 'k2', code: 'KASA.002', name: 'ŞUBE KASA' },
      ],
      lines: [
        line({ kasa_id: 'k1', tutar: 50000, payment_method: 'cash' }),
        line({ kasa_id: 'k2', tutar: 8000, payment_method: 'card' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const a = rows.find((row) => row.id === 'k1');
    const b = rows.find((row) => row.id === 'k2');
    expect(a?.todayCash).toBe(50000);
    expect(a?.todayCard).toBe(0);
    expect(a?.closingCash).toBe(50000);
    expect(b?.todayCash).toBe(0);
    expect(b?.todayCard).toBe(8000);
    expect(b?.closingCash).toBe(8000);
  });

  it('kasaya bağlanmayan tutar tek kasaya yapışmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({ tutar: 50000, payment_method: 'cash' }),
        line({ kasa_id: '', tutar: 15000, payment_method: 'cash' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const merkezRow = rows.find((row) => row.id === 'k1');
    const loose = rows.find((row) => row.id === '__unassigned__');
    expect(merkezRow?.todayCash).toBe(50000);
    expect(merkezRow?.closingCash).toBe(50000);
    expect(loose?.todayCash).toBe(15000);
    expect(loose?.name).toBe('Kasaya bağlanmayan');
  });

  it('önceki gün bakiyesi açılıştır, bugünkü kart nakde karışmaz', () => {
    const lines = [
      line({ tutar: 20000, payment_method: 'cash', islem_tarihi: '2026-10-18' }),
      line({ tutar: 50000, payment_method: 'cash', islem_tarihi: day }),
      line({ tutar: 7000, payment_method: 'card', islem_tarihi: day }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const balance = computeCashBalanceForRegister('k1', lines as unknown as KasaIslemi[]);
    expect(rows[0].openingCash).toBe(20000);
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].todayCard).toBe(7000);
    expect(rows[0].closingCash).toBe(77000);
    expect(rows[0].closingCash).toBe(balance);
  });

  it('Date olarak gelen önceki gün bugünkü nakde katılmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({
          tutar: 20000,
          payment_method: 'cash',
          islem_tarihi: new Date(2026, 9, 18) as unknown as string,
        }),
        line({ tutar: 50000, payment_method: 'cash' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows[0].openingCash).toBe(20000);
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].closingCash).toBe(70000);
  });

  it('dağılım listesinde kasa 50.000, sekmede nakit 50.000 kart 0; rezervasyon toplama eklenmez', () => {
    const lines = [
      line({ tutar: 35000, payment_method: 'cash' }),
      line({ tutar: 15000, payment_method: 'Nakit', ozel_kod: 'REZERVASYON' }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const balance = computeCashBalanceForRegister('k1', lines as unknown as KasaIslemi[]);
    const listed = cashRegisterDistributionLines(rows);
    const drawer = cashRegisterDrawerLines(rows);

    expect(balance).toBe(50000);
    expect(listed).toHaveLength(1);
    expect(listed[0].label).toBe('KASA.001 — MERKEZ KASA');
    expect(listed[0].amount).toBe(50000);
    expect(listed[0].amount).toBe(balance);
    expect(sumCashRegisterDistribution(listed)).toBe(50000);
    expect(sumCashRegisterDistribution(listed)).not.toBe(65000);

    expect(drawer).toHaveLength(1);
    expect(drawer[0].cash).toBe(50000);
    expect(drawer[0].card).toBe(0);
    expect(drawer[0].reservation).toBe(15000);
    expect(drawer[0].balance).toBe(50000);
    expect(drawer[0].cash + drawer[0].card).toBe(50000);
    expect(drawer[0].cash + drawer[0].card + drawer[0].reservation).not.toBe(drawer[0].balance);

    const block = cashStatusBlockTotals(50000, rows);
    expect(block.grandTotal).toBe(50000);
    expect(block.registerTotal).toBe(50000);
    expect(block.grandTotal).not.toBe(65000);
    expect(block.grandTotal).not.toBe(block.registerTotal + 15000);
    expect(block.grandTotal).not.toBe(block.registerTotal + block.grandTotal);
  });

  it('ikinci kasanın kart tahsilatı birinci kasanın nakdine yazılmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: [
        { id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' },
        { id: 'k2', code: 'KASA.002', name: 'ŞUBE KASA' },
      ],
      lines: [
        line({ kasa_id: 'k1', tutar: 50000, payment_method: 'cash' }),
        line({ kasa_id: 'k2', tutar: 8000, payment_method: 'card' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const listed = cashRegisterDistributionLines(rows);
    const drawer = cashRegisterDrawerLines(rows);
    const merkezRow = drawer.find((row) => row.id === 'k1');
    const sube = drawer.find((row) => row.id === 'k2');
    const merkezLine = listed.find((row) => row.id === 'k1');
    const subeLine = listed.find((row) => row.id === 'k2');

    expect(merkezLine?.label).toBe('KASA.001 — MERKEZ KASA');
    expect(merkezLine?.amount).toBe(50000);
    expect(subeLine?.label).toBe('KASA.002 — ŞUBE KASA');
    expect(subeLine?.amount).toBe(8000);
    expect(merkezRow?.cash).toBe(50000);
    expect(merkezRow?.card).toBe(0);
    expect(sube?.cash).toBe(0);
    expect(sube?.card).toBe(8000);
    expect(sumCashRegisterDistribution(listed)).toBe(58000);
    expect(sumCashRegisterDistribution(listed)).not.toBe(50000 + 8000 + 8000);
  });

  it('kasaya bağlanmayan tutar dağılım listesinde ayrı satırdır', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({ tutar: 50000, payment_method: 'cash' }),
        line({ kasa_id: '', tutar: 12000, payment_method: 'cash' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const listed = cashRegisterDistributionLines(rows);
    expect(listed.find((row) => row.id === 'k1')?.amount).toBe(50000);
    expect(listed.find((row) => row.id === '__unassigned__')?.label).toBe('Kasaya bağlanmayan');
    expect(listed.find((row) => row.id === '__unassigned__')?.amount).toBe(12000);
  });

  it('kasa kartı ve hareket yoksa dağılım listesi ve sekme boştur', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: [],
      lines: [],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(cashRegisterDistributionLines(rows)).toEqual([]);
    expect(cashRegisterDrawerLines(rows)).toEqual([]);
    expect(sumCashRegisterDistribution([])).toBe(0);
  });

  it('çek tahsilatı sekmede nakit veya kart olmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({ tutar: 50000, payment_method: 'cash' }),
        line({ tutar: 8000, payment_method: 'cek' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const drawer = cashRegisterDrawerLines(rows);
    expect(drawer[0].cash).toBe(50000);
    expect(drawer[0].card).toBe(0);
    expect(drawer[0].openAccount).toBe(0);
    expect(drawer[0].transfer).toBe(0);
    expect('check' in drawer[0]).toBe(false);
  });

  it('çek tahsilatı nakit veya kart olmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({ tutar: 50000, payment_method: 'cash' }),
        line({ tutar: 8000, payment_method: 'cek' }),
      ],
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    expect(rows[0].todayCash).toBe(50000);
    expect(rows[0].todayCard).toBe(0);
    expect(rows[0].payCash).toBe(50000);
    expect(rows[0].payCard).toBe(0);
    expect(rows[0].grandTotal).toBe(50000);
  });

  it('brüt giriş 130.000 ve nakit iade 10.000 → nakit ve kalan 120.000, rezervasyon toplama eklenmez', () => {
    const lines = [
      line({ tutar: 90_000, payment_method: 'cash', islem_tipi: 'KASA_GIRIS' }),
      line({ tutar: 20_000, payment_method: 'cash', islem_tipi: 'KASA_GIRIS' }),
      line({
        tutar: 20_000,
        payment_method: 'Nakit',
        ozel_kod: 'REZERVASYON',
        islem_tipi: 'CH_TAHSILAT',
      }),
    ];
    const refunds = cashRefundsFromSales([
      { id: 'hizmet', receiptNumber: 'HZM-1', total: 90_000, paymentMethod: 'cash', status: 'completed', date: day },
      { id: 'urun', receiptNumber: 'URN-1', total: 20_000, paymentMethod: 'cash', status: 'completed', date: day },
      {
        id: 'pesinat',
        receiptNumber: 'PES-1',
        total: 20_000,
        paymentMethod: 'cash',
        status: 'completed',
        isDeposit: true,
        notes: 'deposit:1',
        date: day,
      },
      {
        id: 'iade',
        receiptNumber: '0000003',
        total: -10_000,
        paymentMethod: 'Nakit',
        status: 'return',
        date: day,
      },
    ]);
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
      cashRefunds: refunds,
    });
    const drawer = cashRegisterDrawerLines(rows);
    const listed = cashRegisterDistributionLines(rows);
    const block = cashStatusBlockTotals(120_000, rows);

    expect(refunds).toEqual([
      expect.objectContaining({ ficheNo: '0000003', amount: 10_000, method: 'cash' }),
    ]);
    expect(rows[0].payCash).toBe(120_000);
    expect(rows[0].todayCash).toBe(120_000);
    expect(rows[0].closingCash).toBe(120_000);
    expect(rows[0].reservationDeposit).toBe(20_000);
    expect(rows[0].grandTotal).toBe(120_000);
    expect(rows[0].grandTotal).not.toBe(140_000);
    expect(rows[0].grandTotal).not.toBe(130_000);
    expect(drawer[0].cash).toBe(120_000);
    expect(drawer[0].balance).toBe(120_000);
    expect(drawer[0].reservation).toBe(20_000);
    expect(drawer[0].balance).not.toBe(drawer[0].cash + drawer[0].reservation);
    expect(listed[0].label).toBe('KASA.001 — MERKEZ KASA');
    expect(listed[0].amount).toBe(120_000);
    expect(sumCashRegisterDistribution(listed)).toBe(120_000);
    expect(sumCashRegisterDistribution(listed)).not.toBe(130_000);
    expect(sumCashRegisterDistribution(listed)).not.toBe(140_000);
    expect(block.grandTotal).toBe(120_000);
    expect(block.registerTotal).toBe(120_000);
  });

  it('peşinat iade sanılmaz, veresiye iade kasadan çıkmaz', () => {
    expect(cashRefundsFromSales([
      {
        id: 'pesinat',
        receiptNumber: 'PES-1',
        total: 20_000,
        paymentMethod: 'cash',
        status: 'completed',
        isDeposit: true,
        notes: 'deposit:1',
      },
    ])).toEqual([]);
    expect(cashRefundsFromSales([
      {
        id: 'iade-veresiye',
        receiptNumber: '0000004',
        total: -10_000,
        paymentMethod: 'veresiye',
        status: 'return',
      },
    ])).toEqual([]);
  });

  it('defterdeki nakit iade çıkışı kalandan ikinci kez düşülmez', () => {
    const lines = [
      line({ tutar: 130_000, payment_method: 'cash', islem_tipi: 'KASA_GIRIS' }),
      line({
        tutar: 10_000,
        payment_method: 'cash',
        islem_tipi: 'KASA_CIKIS',
        islem_no: '0000003',
        islem_aciklamasi: 'Nakit iade — 0000003',
      }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
      cashRefunds: [{ ficheNo: '0000003', amount: 10_000, method: 'cash', date: day }],
    });
    const drawer = cashRegisterDrawerLines(rows);
    expect(drawer[0].cash).toBe(120_000);
    expect(drawer[0].expense).toBe(0);
    expect(drawer[0].balance).toBe(120_000);
    expect(drawer[0].balance).not.toBe(110_000);
    expect(rows[0].reservationDeposit).toBe(0);
  });

  it('nakit 465.000, rezervasyon 30.000, gider 50.000 → kalan 415.000; rezervasyon düşülmez', () => {
    const lines = [
      line({ tutar: 435_000, payment_method: 'cash', islem_tipi: 'KASA_GIRIS' }),
      line({
        tutar: 30_000,
        payment_method: 'Nakit',
        ozel_kod: 'REZERVASYON',
        islem_tipi: 'CH_TAHSILAT',
      }),
      line({ tutar: 50_000, payment_method: 'cash', islem_tipi: 'GIDER_PUSULASI' }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-24',
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const drawer = cashRegisterDrawerLines(rows);
    expect(drawer).toHaveLength(1);
    expect(drawer[0].label).toBe('KASA.001 — MERKEZ KASA');
    expect(drawer[0].cash).toBe(465_000);
    expect(drawer[0].card).toBe(0);
    expect(drawer[0].openAccount).toBe(0);
    expect(drawer[0].transfer).toBe(0);
    expect(drawer[0].reservation).toBe(30_000);
    expect(drawer[0].expense).toBe(50_000);
    expect(drawer[0].balance).toBe(415_000);
    expect(drawer[0].balance).toBe(drawer[0].cash - drawer[0].expense);
    expect(drawer[0].balance).not.toBe(drawer[0].cash - drawer[0].expense - drawer[0].reservation);
    expect(drawer[0].balance).not.toBe(365_000);
    expect(rows[0].grandTotal).toBe(465_000);
    expect(cashRegisterExpenseGaps(rows)).toEqual([]);
  });

  it('gider kaydı yok ve nakit zaten 415.000 ise kalan 415.000', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [line({ tutar: 415_000, payment_method: 'cash', islem_tipi: 'KASA_GIRIS' })],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-24',
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const drawer = cashRegisterDrawerLines(rows);
    expect(drawer[0].cash).toBe(415_000);
    expect(drawer[0].expense).toBe(0);
    expect(drawer[0].reservation).toBe(0);
    expect(drawer[0].balance).toBe(415_000);
    expect(cashRegisterExpenseGaps(rows)).toEqual([]);
  });

  it('138.500 tahsilat ve 38.500 açılış alacak kapanışı 100.000 bırakır', () => {
    const lines = [
      line({ tutar: 138_500, payment_method: 'cash', islem_tipi: 'KASA_GIRIS', islem_tarihi: '2026-10-10' }),
      line({ tutar: 38_500, payment_method: 'cash', islem_tipi: 'ACILIS_ALACAK', islem_tarihi: '2026-10-20' }),
    ];
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines,
      dateFrom: '2026-01-01',
      dateTo: '2026-10-24',
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const listed = cashRegisterDistributionLines(rows);
    expect(rows[0].openingCash).toBe(0);
    expect(rows[0].closingCash).toBe(100_000);
    expect(listed[0].amount).toBe(100_000);
    expect(sumCashRegisterDistribution(listed)).toBe(100_000);
  });

  it('gider fişi yoksa banka çıkışı 0 gider yazar, kalanı bozmaz, farkı banka olarak bildirir', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: merkez,
      lines: [
        line({ tutar: 465_000, payment_method: 'cash', islem_tipi: 'KASA_GIRIS' }),
        line({ tutar: 50_000, payment_method: 'cash', islem_tipi: 'BANKA_YATIRILAN' }),
      ],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-24',
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const drawer = cashRegisterDrawerLines(rows);
    expect(drawer[0].cash).toBe(465_000);
    expect(drawer[0].expense).toBe(0);
    expect(drawer[0].balance).toBe(415_000);
    expect(drawer[0].balance).not.toBe(465_000);
    const gaps = cashRegisterExpenseGaps(rows);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gap).toBe(50_000);
    expect(gaps[0].otherCashOuts).toEqual([{ code: 'BANKA_YATIRILAN', amount: 50_000 }]);
    expect(gaps[0].residual).toBe(0);
  });
});

describe('cashRegisterRemaining — kalan = nakit − gider', () => {
  it('465.000 nakit, 30.000 rezervasyon, 50.000 gider → 415.000; rezervasyon düşülmez', () => {
    const withReservation = cashRegisterRemaining({
      cash: 465_000,
      expense: 50_000,
      reservation: 30_000,
      ledgerBalance: 415_000,
    });
    const withoutReservation = cashRegisterRemaining({
      cash: 465_000,
      expense: 50_000,
      reservation: 0,
      ledgerBalance: 415_000,
    });
    expect(withReservation).toBe(415_000);
    expect(withoutReservation).toBe(415_000);
    expect(withReservation).not.toBe(465_000 - 50_000 - 30_000);
    expect(withReservation).not.toBe(365_000);
  });

  it('gider bakiyeye henüz yazılmamışsa bir kez düşülür', () => {
    expect(cashRegisterRemaining({
      cash: 465_000,
      expense: 50_000,
      reservation: 30_000,
      ledgerBalance: 465_000,
    })).toBe(415_000);
  });

  it('gider 0 ve nakit zaten 415.000 ise kalan 415.000', () => {
    expect(cashRegisterRemaining({
      cash: 415_000,
      expense: 0,
      reservation: 30_000,
      ledgerBalance: 415_000,
    })).toBe(415_000);
  });

  it('gider kaydı yokken kalan nakitten küçükse kalan bozulmaz', () => {
    expect(cashRegisterRemaining({
      cash: 465_000,
      expense: 0,
      reservation: 30_000,
      ledgerBalance: 415_000,
    })).toBe(415_000);
  });
});

describe('kasa fişleri — açılış alacak rapora bir kez girer', () => {
  const range = { dateFrom: '2026-01-01', dateTo: '2026-10-24' };

  it('138.500 tahsilat + 38.500 ACILIS_ALACAK → nakit, kapanış ve genel toplam 100.000', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      reservation: 10_000,
      discount: 1_500,
      openAccount: 0,
      saleReceiptKeys: ['fis-138'],
      customerCollectionsInSalesCash: true,
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 138_500,
          islem_no: 'FIS-138',
          islem_tarihi: '2026-10-10',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          tutar: 10_000,
          ozel_kod: 'REZERVASYON',
          islem_tarihi: '2026-10-11',
          payment_method: 'Nakit',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'ACILIS_ALACAK',
          tutar: 38_500,
          islem_tarihi: '2026-10-20',
          payment_method: 'cash',
        },
      ],
      ...range,
    });

    expect(result.openingCash).toBe(0);
    expect(result.todayCash).toBe(100_000);
    expect(result.closingCash).toBe(100_000);
    expect(result.grandTotal).toBe(100_000);
    expect(result.openAccount).toBe(0);
    expect(result.reservation).toBe(10_000);
    expect(result.cashDelta).toBe(-38_500);
    expect(result.todayCash).not.toBe(138_500);
    expect(result.todayCash).not.toBe(110_000);
    expect(result.grandTotal).not.toBe(148_500);
  });

  it('aralık içindeki açılış alacak açılışa gizlenmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'ACILIS_ALACAK',
        tutar: 38_500,
        islem_tarihi: '2026-06-15',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(result.openingCash).toBe(0);
    expect(result.todayCash).toBe(100_000);
    expect(result.closingCash).toBe(100_000);
  });

  it('aralıktan önceki açılış alacak açılış bakiyesidir', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'ACILIS_ALACAK',
        tutar: 38_500,
        islem_tarihi: '2025-12-31',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(result.openingCash).toBe(-38_500);
    expect(result.todayCash).toBe(138_500);
    expect(result.closingCash).toBe(100_000);
  });

  it('ACILIS_BORC nakde bir kez eklenir', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'ACILIS_BORC',
        tutar: 10_000,
        islem_tarihi: '2026-03-01',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(result.openingCash).toBe(0);
    expect(result.todayCash).toBe(148_500);
    expect(result.grandTotal).toBe(148_500);
    expect(result.cashDelta).toBe(10_000);
  });

  it('virman genel toplamı değiştirmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 100_000,
      lines: [{
        kasa_id: 'merkez',
        target_register_id: 'qicard',
        islem_tipi: 'VIRMAN',
        tutar: 20_000,
        sign: -1,
        islem_no: 'VRM-1',
        islem_tarihi: '2026-10-01',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(result.cashDelta).toBe(0);
    expect(result.todayCash).toBe(100_000);
    expect(result.grandTotal).toBe(100_000);
    expect(result.expense).toBe(0);
  });

  it('peşinat nakde tekrar eklenmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      reservation: 10_000,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'CH_TAHSILAT',
        ozel_kod: 'REZERVASYON',
        tutar: 10_000,
        islem_tarihi: '2026-02-01',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(result.todayCash).toBe(138_500);
    expect(result.grandTotal).toBe(138_500);
    expect(result.reservation).toBe(10_000);
  });

  it('indirim açık cari değildir ve toplama eklenmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      discount: 1_500,
      openAccount: 0,
      ...range,
    });
    expect(result.openAccount).toBe(0);
    expect(result.todayCash).toBe(138_500);
    expect(result.grandTotal).toBe(138_500);
  });

  it('gider bir kez düşülür', () => {
    const doubled = cashStatusWithVouchers({
      salesCash: 138_500,
      expense: 5_000,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'GIDER_PUSULASI',
        tutar: 5_000,
        islem_tarihi: '2026-04-01',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(doubled.expense).toBe(5_000);
    expect(doubled.todayCash).toBe(138_500);
    expect(doubled.grandTotal).toBe(133_500);
    expect(doubled.closingCash).toBe(133_500);
    expect(doubled.grandTotal).not.toBe(128_500);

    const fromLine = cashStatusWithVouchers({
      salesCash: 138_500,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'KASA_CIKIS',
        tutar: 4_000,
        islem_tarihi: '2026-04-02',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(fromLine.expense).toBe(4_000);
    expect(fromLine.todayCash).toBe(138_500);
    expect(fromLine.grandTotal).toBe(134_500);
    expect(fromLine.grandTotal).not.toBe(130_500);
  });

  it('manuel kasa girişi, banka ve cari tahsilat kendi işaretleriyle girer; satış fişi eklenmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      saleReceiptKeys: ['fis-138'],
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 138_500,
          islem_no: 'FIS-138',
          islem_tarihi: '2026-01-15',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 8_000,
          islem_no: 'MANUEL-1',
          islem_tarihi: '2026-02-01',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'BANKA_YATIRILAN',
          tutar: 3_000,
          islem_tarihi: '2026-02-02',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'BANKADAN_CEKILEN',
          tutar: 1_000,
          islem_tarihi: '2026-02-03',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          tutar: 2_000,
          islem_no: 'TAH-1',
          islem_tarihi: '2026-02-04',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_ODEME',
          tutar: 500,
          islem_tarihi: '2026-02-05',
          payment_method: 'cash',
        },
      ],
      ...range,
    });
    expect(result.todayCash).toBe(146_500);
    expect(result.expense).toBe(500);
    expect(result.grandTotal).toBe(146_000);
    expect(result.todayCash).not.toBe(138_500 + 138_500);
  });

  it('sayılmış gider ikinci kez düşülmez, sayılmamış cari ödeme bir kez düşülür', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      expense: 5_000,
      countedExpenseKeys: ['gider-1'],
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'GIDER_PUSULASI',
          tutar: 5_000,
          islem_no: 'GIDER-1',
          islem_tarihi: '2026-04-01',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_ODEME',
          tutar: 2_000,
          islem_no: 'ODE-1',
          islem_tarihi: '2026-04-02',
          payment_method: 'cash',
        },
      ],
      ...range,
    });
    expect(result.expense).toBe(7_000);
    expect(result.todayCash).toBe(138_500);
    expect(result.grandTotal).toBe(131_500);
    expect(result.grandTotal).not.toBe(126_500);
  });

  it('satıştaki cari tahsilat ikinci kez eklenmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      customerCollectionsInSalesCash: true,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'CH_TAHSILAT',
        tutar: 2_000,
        islem_no: 'TAH-1',
        islem_tarihi: '2026-02-04',
        payment_method: 'cash',
      }],
      ...range,
    });
    expect(result.todayCash).toBe(138_500);
    expect(result.cashDelta).toBe(0);
  });

  it('ACILIS_ALACAK kasa çıkış tohumu, ACILIS_BORC giriş tohumudur', () => {
    const seeds = seedsFromRegisterCashLines([
      { kasa_id: 'k1', islem_tipi: 'ACILIS_ALACAK', tutar: 38_500 },
      { kasa_id: 'k1', islem_tipi: 'ACILIS_BORC', tutar: 10_000 },
    ]);
    expect(seeds).toHaveLength(1);
    expect(seeds[0].cashOut).toBe(38_500);
    expect(seeds[0].serviceCash).toBe(10_000);
  });
});

describe('Kasa Durumu — 138.500 nakit, 15.000 gider, kapanış 85.000', () => {
  const day = '2026-10-24';
  const range = { dateFrom: day, dateTo: day };
  const merkez = [{ id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' }];
  const qicard = { id: 'k2', code: 'KASA.002', name: 'QICARD' };

  const lines = [
    {
      kasa_id: 'k1',
      islem_tipi: 'ACILIS_ALACAK',
      tutar: 38_500,
      islem_tarihi: '2026-10-01',
      payment_method: 'cash',
      islem_no: 'ACILIS-1',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 128_500,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'BEA-2026-00001',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'CH_TAHSILAT',
      tutar: 10_000,
      ozel_kod: 'REZERVASYON',
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'RSV-10',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 75_000,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'INV-DOUBLE',
      islem_aciklamasi: 'Satış faturası — INV-DOUBLE',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_CIKIS',
      tutar: 5_000,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'GDR-1',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'MAAS_ODEME',
      tutar: 10_000,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'MAAS-1',
    },
  ];

  it('fatura aynası nakde eklenmez, gider bir kez düşer, peşinat ve indirim eklenmez', () => {
    const result = cashStatusWithVouchers({
      salesCash: 138_500,
      reservation: 10_000,
      discount: 1_500,
      openAccount: 0,
      expense: 0,
      countedExpenseKeys: ['GDR-1', 'MAAS-1'],
      saleReceiptKeys: ['BEA-2026-00001'],
      customerCollectionsInSalesCash: true,
      lines,
      ...range,
    });

    expect(result.openingCash).toBe(-38_500);
    expect(result.todayCash).toBe(138_500);
    expect(result.todayCash).not.toBe(213_500);
    expect(result.expense).toBe(15_000);
    expect(result.expense).not.toBe(30_000);
    expect(result.closingCash).toBe(85_000);
    expect(result.closingCash).not.toBe(175_000);
    expect(result.reservation).toBe(10_000);
    expect(result.openAccount).toBe(0);
    expect(result.cashDelta).toBe(0);
    expect(result.todayCash).not.toBe(138_500 + 10_000);
    expect(result.closingCash).toBe(result.openingCash + result.todayCash - result.expense);
  });

  it('kasa listesi kapanışla aynı 85.000, fatura aynası ikinci kez yazılmaz', () => {
    const rows = cashRegisterStatusFromLedger({
      registers: [...merkez, qicard],
      lines,
      dateFrom: day,
      dateTo: day,
      unassignedLabel: 'Kasaya bağlanmayan',
      saleReceiptKeys: ['BEA-2026-00001'],
    });
    const listed = cashRegisterDistributionLines(rows);
    const merkezRow = listed.find((row) => row.id === 'k1');
    const qicardRow = listed.find((row) => row.id === 'k2');
    expect(merkezRow?.amount).toBe(85_000);
    expect(merkezRow?.amount).not.toBe(175_000);
    expect(qicardRow?.amount).toBe(0);
    expect(sumCashRegisterDistribution(listed)).toBe(85_000);
    expect(rows.find((row) => row.id === 'k1')?.expense).toBe(15_000);
  });
});

describe('Kasa Durumu üç kutu — giren, çıkan, bakiye', () => {
  const today = '2026-10-24';
  const registers = [
    { id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' },
    { id: 'k2', code: 'KASA.002', name: 'QICARD' },
  ];

  it('263.500 giren ve −38.500 önceki bakiye, gider 0 ise bakiye 225.000 ve kasalar toplamıdır', () => {
    const lines = [
      {
        kasa_id: 'k1',
        islem_tipi: 'ACILIS_ALACAK',
        tutar: 38_500,
        islem_tarihi: '2026-10-01',
        payment_method: 'cash',
        islem_no: 'ACILIS-1',
      },
      {
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 263_500,
        islem_tarihi: today,
        payment_method: 'cash',
        islem_no: 'FIS-263',
        islem_aciklamasi: 'Satış faturası — FIS-263',
      },
    ];
    const rows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: today,
      dateTo: today,
      unassignedLabel: 'Kasaya bağlanmayan',
      saleReceiptKeys: ['FIS-263'],
    });
    const listed = cashRegisterDistributionLines(rows);
    const registerTotal = sumCashRegisterDistribution(listed);
    expect(registerTotal).toBe(225_000);
    expect(listed.find((row) => row.id === 'k1')?.amount).toBe(225_000);
    expect(listed.find((row) => row.id === 'k2')?.amount).toBe(0);

    const boxes = cashStatusThreeBoxes({
      salesCash: 263_500,
      reservation: 10_000,
      discount: 1_500,
      expense: 0,
      lines,
      dateFrom: today,
      dateTo: today,
      saleReceiptKeys: ['FIS-263'],
      customerCollectionsInSalesCash: true,
      registerTotal,
      rangeEndsToday: true,
    });

    expect(boxes.totalIn).toBe(263_500);
    expect(boxes.totalIn).not.toBe(273_500);
    expect(boxes.totalOut).toBe(0);
    expect(boxes.priorBalance).toBe(-38_500);
    expect(boxes.priorBalance + boxes.totalIn - boxes.totalOut).toBe(225_000);
    expect(boxes.balance).toBe(registerTotal);
    expect(boxes.balance).toBe(225_000);
  });

  it('aralık içindeki açılış alacak çıkandır, açılış borç girendir', () => {
    const boxes = cashStatusThreeBoxes({
      salesCash: 263_500,
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'ACILIS_ALACAK',
          tutar: 38_500,
          islem_tarihi: '2026-10-20',
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'ACILIS_BORC',
          tutar: 10_000,
          islem_tarihi: '2026-10-21',
          payment_method: 'cash',
        },
      ],
      dateFrom: '2026-10-01',
      dateTo: '2026-10-24',
    });
    expect(boxes.priorBalance).toBe(0);
    expect(boxes.totalIn).toBe(273_500);
    expect(boxes.totalOut).toBe(38_500);
    expect(boxes.balance).toBe(235_000);
    expect(boxes.balance).toBe(boxes.priorBalance + boxes.totalIn - boxes.totalOut);
  });

  it('geçmiş aralıkta bakiye önceki + giren − çıkandır; sonraki gün kasaya yazılmaz', () => {
    const lines = [
      {
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 100_000,
        islem_tarihi: '2026-09-01',
        payment_method: 'cash',
        islem_no: 'ONCE',
      },
      {
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 50_000,
        islem_tarihi: '2026-10-05',
        payment_method: 'cash',
        islem_no: 'ARALIK',
      },
      {
        kasa_id: 'k1',
        islem_tipi: 'BANKA_YATIRILAN',
        tutar: 20_000,
        islem_tarihi: '2026-10-06',
        payment_method: 'cash',
        islem_no: 'BANKA',
      },
      {
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 99_000,
        islem_tarihi: '2026-10-20',
        payment_method: 'cash',
        islem_no: 'SONRA',
      },
    ];
    const boxes = cashStatusThreeBoxes({
      salesCash: 0,
      lines,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-10',
      rangeEndsToday: false,
      registerTotal: 999_999,
    });
    expect(boxes.priorBalance).toBe(100_000);
    expect(boxes.totalIn).toBe(50_000);
    expect(boxes.totalOut).toBe(20_000);
    expect(boxes.balance).toBe(130_000);
    expect(boxes.balance).toBe(boxes.priorBalance + boxes.totalIn - boxes.totalOut);
    expect(boxes.balance).not.toBe(229_000);

    const rows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-10',
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const listed = cashRegisterDistributionLines(rows);
    expect(listed.find((row) => row.id === 'k1')?.amount).toBe(130_000);
    expect(sumCashRegisterDistribution(listed)).toBe(boxes.balance);
  });

  it('peşinat ikinci kez girene eklenmez, satış fişi ikinci kez giren olmaz', () => {
    const boxes = cashStatusThreeBoxes({
      salesCash: 263_500,
      reservation: 10_000,
      saleReceiptKeys: ['FIS-263'],
      customerCollectionsInSalesCash: true,
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          tutar: 10_000,
          ozel_kod: 'REZERVASYON',
          islem_tarihi: today,
          payment_method: 'cash',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 263_500,
          islem_no: 'FIS-263',
          islem_tarihi: today,
          payment_method: 'cash',
          islem_aciklamasi: 'Satış faturası — FIS-263',
        },
      ],
      dateFrom: today,
      dateTo: today,
    });
    expect(boxes.totalIn).toBe(263_500);
    expect(boxes.totalIn).not.toBe(273_500);
    expect(boxes.totalIn).not.toBe(527_000);
    expect(boxes.totalOut).toBe(0);
  });

  it('indirim ve açık cari girene veya çıkana eklenmez', () => {
    const boxes = cashStatusThreeBoxes({
      salesCash: 263_500,
      discount: 1_500,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 5_000,
        islem_tarihi: today,
        payment_method: 'ACIK_CARI',
        islem_no: 'VERESIYE',
      }],
      dateFrom: today,
      dateTo: today,
    });
    expect(boxes.totalIn).toBe(263_500);
    expect(boxes.totalOut).toBe(0);
    expect(boxes.balance).toBe(263_500);
  });

  it('gider, cari ödeme ve bankaya yatan bir kez çıkana girer', () => {
    const boxes = cashStatusThreeBoxes({
      salesCash: 263_500,
      expense: 15_000,
      countedExpenseKeys: ['GDR-1', 'ODE-1'],
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_CIKIS',
          tutar: 5_000,
          islem_tarihi: today,
          payment_method: 'cash',
          islem_no: 'GDR-1',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_ODEME',
          tutar: 10_000,
          islem_tarihi: today,
          payment_method: 'cash',
          islem_no: 'ODE-1',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'BANKA_YATIRILAN',
          tutar: 3_000,
          islem_tarihi: today,
          payment_method: 'cash',
          islem_no: 'BANKA-1',
        },
      ],
      dateFrom: today,
      dateTo: today,
    });
    expect(boxes.totalOut).toBe(18_000);
    expect(boxes.totalOut).not.toBe(33_000);
    expect(boxes.totalIn).toBe(263_500);
    expect(boxes.balance).toBe(245_500);
  });

  it('virman şirket bakiyesini değiştirmez', () => {
    const without = cashStatusThreeBoxes({
      salesCash: 225_000,
      lines: [],
      dateFrom: '2026-10-01',
      dateTo: today,
    });
    const withVirman = cashStatusThreeBoxes({
      salesCash: 225_000,
      lines: [{
        kasa_id: 'k1',
        target_register_id: 'k2',
        islem_tipi: 'VIRMAN',
        tutar: 20_000,
        sign: -1,
        islem_no: 'VRM-1',
        islem_tarihi: '2026-10-10',
        payment_method: 'cash',
      }],
      dateFrom: '2026-10-01',
      dateTo: today,
    });
    expect(withVirman.totalIn).toBe(without.totalIn);
    expect(withVirman.totalOut).toBe(without.totalOut);
    expect(withVirman.balance).toBe(without.balance);
    expect(withVirman.balance).toBe(225_000);

    const baseLines = [{
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 225_000,
      islem_tarihi: '2026-10-02',
      payment_method: 'cash',
      islem_no: 'GIRIS',
    }];
    const movedLines = [
      ...baseLines,
      {
        kasa_id: 'k1',
        target_register_id: 'k2',
        islem_tipi: 'VIRMAN',
        tutar: 20_000,
        sign: -1,
        islem_no: 'VRM-1',
        islem_tarihi: '2026-10-10',
        payment_method: 'cash',
      },
    ];
    const beforeRows = cashRegisterStatusFromLedger({
      registers,
      lines: baseLines,
      dateFrom: '2026-10-01',
      dateTo: today,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const afterRows = cashRegisterStatusFromLedger({
      registers,
      lines: movedLines,
      dateFrom: '2026-10-01',
      dateTo: today,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const beforeTotal = sumCashRegisterDistribution(cashRegisterDistributionLines(beforeRows));
    const afterListed = cashRegisterDistributionLines(afterRows);
    const afterTotal = sumCashRegisterDistribution(afterListed);
    expect(afterTotal).toBe(beforeTotal);
    expect(afterListed.find((row) => row.id === 'k1')?.amount).toBe(205_000);
    expect(afterListed.find((row) => row.id === 'k2')?.amount).toBe(20_000);
  });
});

describe('Kasa Durumu filtresi — yılbaşı ve seçilen aralık', () => {
  const noon = new Date('2026-10-24T09:00:00.000Z');
  const registers = [
    { id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' },
    { id: 'k2', code: 'KASA.002', name: 'QICARD' },
  ];
  const lines = [
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 100_000,
      islem_tarihi: '2025-12-20',
      payment_method: 'cash',
      islem_no: 'ONCEKI-YIL',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'ACILIS_ALACAK',
      tutar: 8_000,
      islem_tarihi: '2026-02-01',
      payment_method: 'cash',
      islem_no: 'ACILIS-ALACAK',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'ACILIS_BORC',
      tutar: 12_000,
      islem_tarihi: '2026-02-02',
      payment_method: 'cash',
      islem_no: 'ACILIS-BORC',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 50_000,
      islem_tarihi: '2026-03-01',
      payment_method: 'cash',
      islem_no: 'MART',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_CIKIS',
      tutar: 10_000,
      islem_tarihi: '2026-06-01',
      payment_method: 'cash',
      islem_no: 'GDR-YIL',
    },
    {
      kasa_id: 'k1',
      target_register_id: 'k2',
      islem_tipi: 'VIRMAN',
      tutar: 20_000,
      sign: -1,
      islem_no: 'VRM-YIL',
      islem_tarihi: '2026-04-10',
      payment_method: 'cash',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 5_000,
      islem_tarihi: '2026-10-24',
      payment_method: 'cash',
      islem_no: 'BUGUN',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'CH_TAHSILAT',
      tutar: 10_000,
      ozel_kod: 'REZERVASYON',
      islem_tarihi: '2026-10-24',
      payment_method: 'cash',
      islem_no: 'PESINAT',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 40_000,
      islem_tarihi: '2026-10-24',
      payment_method: 'cash',
      islem_no: 'FIS-40',
      islem_aciklamasi: 'Satış faturası — FIS-40',
    },
  ];

  it('filtresiz preset bugün değildir; giren ve çıkan 1 Ocak–bugün, bakiye kasalar toplamıdır', () => {
    const empty = emptyCashStatusDate();
    expect(empty.preset).toBe('none');
    expect(empty.preset).not.toBe('today');
    expect(empty.from).toBe('');
    expect(empty.to).toBe('');

    const open = resolveCashStatusQuery(empty, noon);
    expect(open.from).toBe('2026-01-01');
    expect(open.to).toBe('2026-10-24');
    expect(open.filtered).toBe(false);
    expect(open.balanceFromRegisters).toBe(true);
    expect(istanbulYearStartDateKey(noon)).toBe('2026-01-01');
    expect(istanbulTodayDateKey(noon)).toBe('2026-10-24');

    const lateUtc = new Date('2026-10-24T21:30:00.000Z');
    expect(istanbulTodayDateKey(lateUtc)).toBe('2026-10-25');
    expect(resolveCashStatusQuery(empty, lateUtc).from).toBe('2026-01-01');
    expect(resolveCashStatusQuery(empty, lateUtc).to).toBe('2026-10-25');

    const boxes = cashStatusThreeBoxes({
      salesCash: 40_000,
      reservation: 10_000,
      discount: 1_500,
      expense: 10_000,
      countedExpenseKeys: ['GDR-YIL'],
      lines,
      dateFrom: open.from,
      dateTo: open.to,
      saleReceiptKeys: ['FIS-40'],
      customerCollectionsInSalesCash: true,
      registerTotal: 195_000,
      balanceFromRegisters: true,
    });

    expect(boxes.totalIn).toBe(107_000);
    expect(boxes.totalIn).not.toBe(117_000);
    expect(boxes.totalIn).not.toBe(147_000);
    expect(boxes.totalOut).toBe(18_000);
    expect(boxes.totalOut).not.toBe(28_000);
    expect(boxes.priorBalance).toBe(100_000);
    const yearFormula = boxes.priorBalance + boxes.totalIn - boxes.totalOut;
    expect(yearFormula).toBe(189_000);
    expect(yearFormula).not.toBe(195_000);
    expect(boxes.balance).toBe(195_000);
  });

  it('Bugün seçilince yalnız bugünün hareketi ve bugün biten bakiye hesaplanır', () => {
    const picked = buildCashStatusRange('today', 0, '', '', noon);
    expect(picked.preset).toBe('today');
    expect(picked.from).toBe('2026-10-24');
    expect(picked.to).toBe('2026-10-24');
    const query = resolveCashStatusQuery(picked, noon);
    expect(query.filtered).toBe(true);
    expect(query.balanceFromRegisters).toBe(false);

    const boxes = cashStatusThreeBoxes({
      salesCash: 40_000,
      reservation: 10_000,
      discount: 1_500,
      expense: 0,
      lines,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['FIS-40'],
      customerCollectionsInSalesCash: true,
      registerTotal: 999_999,
      balanceFromRegisters: false,
    });
    expect(boxes.totalIn).toBe(45_000);
    expect(boxes.totalIn).not.toBe(55_000);
    expect(boxes.totalIn).not.toBe(85_000);
    expect(boxes.totalOut).toBe(0);
    expect(boxes.priorBalance).toBe(144_000);
    expect(boxes.balance).toBe(boxes.priorBalance + boxes.totalIn - boxes.totalOut);
    expect(boxes.balance).toBe(189_000);
    expect(boxes.balance).not.toBe(195_000);
    expect(boxes.balance).not.toBe(999_999);

    const rows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: query.from,
      dateTo: query.to,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const listed = cashRegisterDistributionLines(rows);
    expect(listed.find((row) => row.id === 'k2')?.amount).toBe(20_000);
    expect(sumCashRegisterDistribution(listed)).toBe(
      (listed.find((row) => row.id === 'k1')?.amount || 0) + 20_000,
    );
    const withoutMove = cashRegisterStatusFromLedger({
      registers,
      lines: lines.filter((line) => line.islem_no !== 'VRM-YIL'),
      dateFrom: query.from,
      dateTo: query.to,
      unassignedLabel: 'Kasaya bağlanmayan',
    });
    const moved = sumCashRegisterDistribution(listed);
    const still = sumCashRegisterDistribution(cashRegisterDistributionLines(withoutMove));
    expect(moved).toBe(still);
  });

  it('filtre kalkınca yine yılbaşı–bugün ve kasalar toplamına döner', () => {
    const picked = buildCashStatusRange('today', 0, '', '', noon);
    expect(resolveCashStatusQuery(picked, noon).filtered).toBe(true);
    const cleared = emptyCashStatusDate();
    const again = resolveCashStatusQuery(cleared, noon);
    expect(again.filtered).toBe(false);
    expect(again.from).toBe('2026-01-01');
    expect(again.to).toBe('2026-10-24');
    expect(again.balanceFromRegisters).toBe(true);
  });

  it('saatli fiş UTC gününe kaymaz; takvim günü olduğu gibi kalır', () => {
    const timed = cashStatusThreeBoxes({
      salesCash: 0,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 7,
        islem_tarihi: '2026-10-24T21:30:00.000Z',
        payment_method: 'cash',
      }],
      dateFrom: '2026-10-25',
      dateTo: '2026-10-25',
    });
    expect(timed.totalIn).toBe(7);
    const utcDay = cashStatusThreeBoxes({
      salesCash: 0,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 7,
        islem_tarihi: '2026-10-24T21:30:00.000Z',
        payment_method: 'cash',
      }],
      dateFrom: '2026-10-24',
      dateTo: '2026-10-24',
    });
    expect(utcDay.totalIn).toBe(0);
    const plain = cashStatusThreeBoxes({
      salesCash: 0,
      lines: [{
        kasa_id: 'k1',
        islem_tipi: 'KASA_GIRIS',
        tutar: 7,
        islem_tarihi: '2026-10-24',
        payment_method: 'cash',
      }],
      dateFrom: '2026-10-24',
      dateTo: '2026-10-24',
    });
    expect(plain.totalIn).toBe(7);
  });

  it('Kasa Durumu açılışı günlük raporun bugün aralığına bağlı değildir', () => {
    const moduleSource = readFileSync(resolve('src/components/reports/ReportsModule.tsx'), 'utf8');
    expect(moduleSource).toContain('emptyCashStatusDate()');
    expect(moduleSource).toContain('balanceFromRegisters');
    const marker = "selectedTab === 'cash-status' &&";
    const cashBlock = moduleSource.slice(moduleSource.indexOf(marker));
    const nextTab = cashBlock.indexOf("selectedTab === 'payment-distribution'");
    const summary = nextTab > 0 ? cashBlock.slice(0, nextTab) : cashBlock;
    expect(summary).toContain('cashStatusDate');
    expect(summary).toContain('formulaBalance');
    expect(summary).not.toContain('dailyReportDateRange');
    expect(summary).toContain('allowEmpty');
  });
});

describe('Kasa Durumu hareket listesi', () => {
  const noon = new Date('2026-10-24T09:00:00.000Z');
  const lines = [
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 100_000,
      islem_tarihi: '2025-12-20',
      payment_method: 'cash',
      islem_no: 'ONCEKI-YIL',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'ACILIS_ALACAK',
      tutar: 8_000,
      islem_tarihi: '2026-02-01',
      payment_method: 'cash',
      islem_no: 'ACILIS-ALACAK',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'ACILIS_BORC',
      tutar: 12_000,
      islem_tarihi: '2026-02-02',
      payment_method: 'cash',
      islem_no: 'ACILIS-BORC',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 50_000,
      islem_tarihi: '2026-03-01',
      payment_method: 'cash',
      islem_no: 'MART',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_CIKIS',
      tutar: 10_000,
      islem_tarihi: '2026-06-01',
      payment_method: 'cash',
      islem_no: 'GDR-YIL',
    },
    {
      kasa_id: 'k1',
      target_register_id: 'k2',
      islem_tipi: 'VIRMAN',
      tutar: 20_000,
      sign: -1,
      islem_no: 'VRM-YIL',
      islem_tarihi: '2026-04-10',
      payment_method: 'cash',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 5_000,
      islem_tarihi: '2026-10-24',
      payment_method: 'cash',
      islem_no: 'BUGUN',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'CH_TAHSILAT',
      tutar: 10_000,
      ozel_kod: 'REZERVASYON',
      islem_tarihi: '2026-10-24',
      payment_method: 'cash',
      islem_no: 'PESINAT',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 40_000,
      islem_tarihi: '2026-10-24',
      payment_method: 'cash',
      islem_no: 'FIS-40',
      islem_aciklamasi: 'Satış faturası — FIS-40',
    },
    {
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 7,
      islem_tarihi: '2026-10-24T21:30:00.000Z',
      payment_method: 'cash',
      islem_no: 'UTC-GECE',
    },
  ];

  it('filtresiz liste 1 Ocak–bugündür; açılış işareti doğru, virman iki bacaktır ve kutulara yazılmaz', () => {
    const open = resolveCashStatusQuery(emptyCashStatusDate(), noon);
    expect(open.from).toBe('2026-01-01');
    expect(open.to).toBe('2026-10-24');
    expect(open.filtered).toBe(false);

    const rows = cashStatusMovementRows({
      salesCash: 40_000,
      reservation: 10_000,
      discount: 1_500,
      expense: 10_000,
      countedExpenseKeys: ['GDR-YIL'],
      lines,
      dateFrom: open.from,
      dateTo: open.to,
      saleReceiptKeys: ['FIS-40'],
      customerCollectionsInSalesCash: true,
      registerNames: { k1: 'MERKEZ KASA', k2: 'QICARD' },
    });

    expect(rows.every((row) => row.date >= '2026-01-01' && row.date <= '2026-10-24')).toBe(true);
    expect(rows.some((row) => row.ficheNo === 'ONCEKI-YIL')).toBe(false);
    expect(rows.some((row) => row.ficheNo === 'UTC-GECE')).toBe(false);
    expect(rows.filter((row) => row.ficheNo === 'PESINAT')).toHaveLength(1);
    expect(rows.find((row) => row.ficheNo === 'PESINAT')?.amount).toBe(10_000);
    expect(rows.filter((row) => row.ficheNo === 'FIS-40')).toHaveLength(1);
    expect(rows.filter((row) => row.ficheNo === 'GDR-YIL')).toHaveLength(1);
    expect(rows.find((row) => row.ficheNo === 'GDR-YIL')?.amount).toBe(-10_000);
    expect(rows.find((row) => row.ficheNo === 'GDR-YIL')?.flow).toBe('gider');

    const alacak = rows.find((row) => row.ficheNo === 'ACILIS-ALACAK');
    const borc = rows.find((row) => row.ficheNo === 'ACILIS-BORC');
    expect(alacak?.flow).toBe('gider');
    expect(alacak?.amount).toBe(-8_000);
    expect(borc?.flow).toBe('gelir');
    expect(borc?.amount).toBe(12_000);

    const legs = rows.filter((row) => row.categoryCode === 'virman');
    expect(legs).toHaveLength(2);
    expect(legs.map((row) => row.amount).sort((a, b) => a - b)).toEqual([-20_000, 20_000]);
    expect(legs.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
    expect(legs.find((row) => row.amount < 0)?.registerId).toBe('k1');
    expect(legs.find((row) => row.amount > 0)?.registerId).toBe('k2');
    expect(legs.find((row) => row.amount > 0)?.party).toBe('QICARD');

    const shared = {
      salesCash: 40_000,
      expense: 10_000,
      countedExpenseKeys: ['GDR-YIL'],
      dateFrom: open.from,
      dateTo: open.to,
      saleReceiptKeys: ['FIS-40'],
      customerCollectionsInSalesCash: true,
    };
    const withVirman = cashStatusThreeBoxes({ ...shared, lines });
    const withoutVirman = cashStatusThreeBoxes({
      ...shared,
      lines: lines.filter((line) => line.islem_tipi !== 'VIRMAN'),
    });
    expect(withVirman.totalIn).toBe(withoutVirman.totalIn);
    expect(withVirman.totalOut).toBe(withoutVirman.totalOut);
    expect(withVirman.balance).toBe(withoutVirman.balance);
  });

  it('Bugün seçilince yalnız bugünün fişleri kalır', () => {
    const picked = buildCashStatusRange('today', 0, '', '', noon);
    const query = resolveCashStatusQuery(picked, noon);
    expect(query.from).toBe('2026-10-24');
    expect(query.to).toBe('2026-10-24');
    expect(query.filtered).toBe(true);

    const rows = cashStatusMovementRows({
      salesCash: 40_000,
      reservation: 10_000,
      lines,
      dateFrom: query.from,
      dateTo: query.to,
      saleReceiptKeys: ['FIS-40'],
      customerCollectionsInSalesCash: true,
    });

    expect(rows.every((row) => row.date === '2026-10-24')).toBe(true);
    expect(rows.map((row) => row.ficheNo).sort()).toEqual(['BUGUN', 'FIS-40', 'PESINAT']);
    expect(rows.some((row) => row.ficheNo === 'MART' || row.ficheNo === 'GDR-YIL')).toBe(false);
    expect(rows.some((row) => row.categoryCode === 'virman')).toBe(false);
    expect(rows.some((row) => row.ficheNo === 'ONCEKI-YIL' || row.ficheNo === 'UTC-GECE')).toBe(false);
    expect(rows.find((row) => row.ficheNo === 'BUGUN')?.method).toBe('nakit');
    expect(rows.find((row) => row.ficheNo === 'BUGUN')?.amount).toBe(5_000);
    expect(rows.find((row) => row.ficheNo === 'BUGUN')?.flow).toBe('gelir');
  });

  it('peşinat bir kez listelenir; aynı satış fişi ikinci satır olmaz', () => {
    const rows = cashStatusMovementRows({
      salesCash: 263_500,
      reservation: 10_000,
      discount: 1_500,
      customerCollectionsInSalesCash: true,
      saleReceiptKeys: ['FIS-263'],
      dateFrom: '2026-10-24',
      dateTo: '2026-10-24',
      lines: [
        {
          id: 'pesinat-1',
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          tutar: 10_000,
          ozel_kod: 'REZERVASYON',
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_no: 'PESINAT',
          cari_hesap_unvani: 'Ayşe Demir',
        },
        {
          id: 'pesinat-2',
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          tutar: 10_000,
          ozel_kod: 'REZERVASYON',
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_no: 'PESINAT',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 263_500,
          islem_no: 'FIS-263',
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_aciklamasi: 'Satış faturası — FIS-263',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'SATIS_FATURASI',
          tutar: 263_500,
          islem_no: 'FIS-263',
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_aciklamasi: 'Satış faturası — FIS-263',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_TAHSILAT',
          tutar: 10_000,
          ozel_kod: 'REZERVASYON',
          islem_no: 'FIS-263',
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_aciklamasi: 'Peşinat — FIS-263',
        },
      ],
    });

    const deposit = rows.filter((row) => row.ficheNo === 'PESINAT');
    expect(deposit).toHaveLength(1);
    expect(deposit[0]?.flow).toBe('gelir');
    expect(deposit[0]?.amount).toBe(10_000);
    expect(deposit[0]?.categoryCode).toBe('deposit');
    expect(deposit[0]?.party).toBe('Ayşe Demir');

    const sale = rows.filter((row) => row.ficheNo === 'FIS-263');
    expect(sale).toHaveLength(1);
    expect(sale[0]?.flow).toBe('gelir');
    expect(sale[0]?.amount).toBe(263_500);
    expect(sale[0]?.typeCode).toBe('KASA_GIRIS');
    expect(rows).toHaveLength(2);
  });

  it('gider eksi ve bir kezdir; indirim ile açık cari satır açılmaz', () => {
    const rows = cashStatusMovementRows({
      salesCash: 263_500,
      expense: 15_000,
      discount: 1_500,
      countedExpenseKeys: ['GDR-1', 'ODE-1'],
      dateFrom: '2026-10-24',
      dateTo: '2026-10-24',
      lines: [
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_CIKIS',
          tutar: 5_000,
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_no: 'GDR-1',
          category: 'Reklam',
          islem_aciklamasi: 'Instagram reklam',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'GIDER_PUSULASI',
          tutar: 5_000,
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_no: 'GDR-1',
          islem_aciklamasi: 'Instagram reklam',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'CH_ODEME',
          tutar: 10_000,
          islem_tarihi: '2026-10-24',
          payment_method: 'cash',
          islem_no: 'ODE-1',
          cari_hesap_unvani: 'Tedarikçi',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 5_000,
          islem_tarihi: '2026-10-24',
          payment_method: 'ACIK_CARI',
          islem_no: 'VERESIYE',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 1_500,
          islem_tarihi: '2026-10-24',
          payment_method: 'indirim',
          islem_no: 'IND-1',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 2_000,
          islem_tarihi: '2026-10-24',
          payment_method: 'card',
          islem_no: 'KART-1',
        },
        {
          kasa_id: 'k1',
          islem_tipi: 'KASA_GIRIS',
          tutar: 3_000,
          islem_tarihi: '2026-10-24',
          payment_method: 'havale',
          islem_no: 'HAV-1',
        },
      ],
    });

    const expense = rows.filter((row) => row.ficheNo === 'GDR-1');
    expect(expense).toHaveLength(1);
    expect(expense[0]?.flow).toBe('gider');
    expect(expense[0]?.amount).toBe(-5_000);
    expect(expense[0]?.party).toBe('Reklam');
    const payment = rows.find((row) => row.ficheNo === 'ODE-1');
    expect(payment?.flow).toBe('gider');
    expect(payment?.amount).toBe(-10_000);
    expect(rows.some((row) => row.ficheNo === 'VERESIYE' || row.ficheNo === 'IND-1')).toBe(false);
    expect(rows.find((row) => row.ficheNo === 'KART-1')?.method).toBe('kart');
    expect(rows.find((row) => row.ficheNo === 'KART-1')?.amount).toBe(2_000);
    expect(rows.find((row) => row.ficheNo === 'HAV-1')?.method).toBe('havale');
    const giderSum = rows
      .filter((row) => row.ficheNo === 'GDR-1' || row.ficheNo === 'ODE-1')
      .reduce((sum, row) => sum + row.amount, 0);
    expect(giderSum).toBe(-15_000);
    expect(giderSum).not.toBe(-30_000);
  });
});
