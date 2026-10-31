import { describe, expect, it } from 'vitest';
import {
  cashRegisterDistributionLines,
  cashRegisterStatusFromLedger,
  cashStatusMovementRows,
  cashStatusThreeBoxes,
  sumCashRegisterDistribution,
} from '../../utils/cashStatusTotals';
import { isClosedReservationAvansHidden } from '../../utils/cancelledReservationBox';

/**
 * Kasa Durumu ile Kasa İşlemleri aynı nakit satırlarını gösterir.
 * Kapanmış randevunun peşinatı ciro listesinde gizlenir, kasa hareketinde durur.
 */
describe('kasa durumu — kapanmış randevu peşinatı hareket listesinde', () => {
  const day = '2026-10-31';
  const registers = [{ id: 'k1', code: 'KASA.001', name: 'MERKEZ KASA' }];
  const lines = [
    {
      id: 'sale-arz',
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 50_000,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'BEA-2026-00004',
      islem_aciklamasi: 'Satış faturası — BEA-2026-00004',
      cari_hesap_unvani: 'ARZ',
    },
    {
      id: 'dep-arz',
      kasa_id: 'k1',
      islem_tipi: 'CH_TAHSILAT',
      tutar: 25_000,
      ozel_kod: 'REZERVASYON',
      is_reservation_deposit: true,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'BEA-2026-00004',
      islem_aciklamasi: 'Rezervasyon tahsilatı — BEA-2026-00004',
      cari_hesap_unvani: 'ARZ',
    },
    {
      id: 'sale-berken',
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 22_000,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'BEA-2026-00003',
      islem_aciklamasi: 'Satış faturası — BEA-2026-00003',
      cari_hesap_unvani: 'BERKEN',
    },
    {
      id: 'dep-berken',
      kasa_id: 'k1',
      islem_tipi: 'CH_TAHSILAT',
      tutar: 3_000,
      ozel_kod: 'REZERVASYON',
      is_reservation_deposit: true,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'KL-BERKEN',
      islem_aciklamasi: 'Rezervasyon tahsilatı — BEA-2026-00003',
      cari_hesap_unvani: 'BERKEN',
    },
    {
      id: 'sale-roza',
      kasa_id: 'k1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 20_000,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'BEA-2026-00002',
      islem_aciklamasi: 'Satış faturası — BEA-2026-00002',
      cari_hesap_unvani: 'ROZA',
    },
    {
      id: 'dep-roza',
      kasa_id: 'k1',
      islem_tipi: 'CH_TAHSILAT',
      tutar: 5_000,
      ozel_kod: 'REZERVASYON',
      is_reservation_deposit: true,
      islem_tarihi: day,
      payment_method: 'cash',
      islem_no: 'BEA-2026-00001',
      islem_aciklamasi: 'Rezervasyon tahsilatı — BEA-2026-00001',
      cari_hesap_unvani: 'ROZA',
    },
  ];
  const saleReceiptKeys = ['BEA-2026-00004', 'BEA-2026-00003', 'BEA-2026-00002'];

  it('altı kasa satırı listelenir ve bakiye 125.000 olur', () => {
    const movements = cashStatusMovementRows({
      lines,
      dateFrom: day,
      dateTo: '2026-11-07',
      saleReceiptKeys,
      customerCollectionsInSalesCash: true,
      registerNames: { k1: 'MERKEZ KASA' },
    });
    expect(movements).toHaveLength(6);
    expect(movements.reduce((sum, row) => sum + row.amount, 0)).toBe(125_000);
    const deposits = movements.filter((row) => row.categoryCode === 'deposit');
    expect(deposits.map((row) => row.amount).sort((a, b) => a - b)).toEqual([3_000, 5_000, 25_000]);
    expect(deposits.every((row) => row.flow === 'gelir')).toBe(true);

    const boxes = cashStatusThreeBoxes({
      salesCash: 92_000,
      reservation: 33_000,
      lines,
      dateFrom: day,
      dateTo: '2026-11-07',
      saleReceiptKeys,
      customerCollectionsInSalesCash: true,
      countLedgerInflows: true,
      balanceFromRegisters: false,
    });
    expect(boxes.totalIn).toBe(125_000);
    expect(boxes.totalOut).toBe(0);
    expect(boxes.balance).toBe(125_000);

    const registersRows = cashRegisterStatusFromLedger({
      registers,
      lines,
      dateFrom: day,
      dateTo: '2026-11-07',
      unassignedLabel: 'Kasaya bağlanmayan',
      saleReceiptKeys,
    });
    const listed = cashRegisterDistributionLines(registersRows);
    expect(sumCashRegisterDistribution(listed)).toBe(125_000);
    expect(boxes.balance).toBe(sumCashRegisterDistribution(listed));
    expect(boxes.totalIn).toBe(movements.reduce((sum, row) => sum + row.amount, 0));
  });

  it('kapanmış peşinat ciro listesinde gizlenir, kasa hareketinde durur', () => {
    expect(isClosedReservationAvansHidden({
      amount: 25_000,
      status: 'open',
      appointmentStatus: 'completed',
    })).toBe(true);
    expect(isClosedReservationAvansHidden({
      amount: 5_000,
      status: 'open',
      appointmentStatus: 'scheduled',
    })).toBe(false);
    const movements = cashStatusMovementRows({
      lines,
      dateFrom: day,
      dateTo: day,
      saleReceiptKeys,
      customerCollectionsInSalesCash: true,
    });
    expect(movements.some((row) => row.party === 'ARZ' && row.categoryCode === 'deposit' && row.amount === 25_000)).toBe(true);
  });
});
