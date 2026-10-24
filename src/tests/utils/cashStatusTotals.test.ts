/**
 * Kasa Durumu — rezervasyon nakdi günlük nakde dahildir, genel toplam çift saymaz.
 *
 * Ekran örneği: hizmet nakdi 35.000 + rezervasyon 15.000.
 * Günlük nakit 50.000, kapanış 50.000, nakit satırı 50.000, genel toplam 50.000.
 */
import { describe, expect, it } from 'vitest';
import { computeCashBalanceForRegister } from '../../utils/cashBalance';
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
