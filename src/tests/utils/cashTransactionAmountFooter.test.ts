/**
 * MERKEZ KASA işlem listesi — Tutar dip toplamı.
 * Mutlak toplam 350.000 yanlıştır. Net 200.000, kasa kartıyla aynı yöndedir.
 */
import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@tanstack/react-table';
import { buildDataGridExportAoa } from '../../utils/gridExcelExport';
import {
  cashTransactionAmountFooterColumn,
  cashTransactionAmountIsInflow,
  cashTransactionFooterNet,
  cashTransactionFooterSignedAmount,
  type CashTransactionFooterLine,
} from '../../utils/cashTransactionAmountFooter';

const MERKEZ: CashTransactionFooterLine[] = [
  { islem_no: '00002', islem_tipi: 'ALIS_FATURASI', tutar: 25_000, islem_aciklamasi: 'Alış faturası' },
  { islem_no: '00001', islem_tipi: 'ALIS_FATURASI', tutar: 50_000, islem_aciklamasi: 'Alış faturası' },
  { islem_no: 'BEA-2026-00003', islem_tipi: 'SATIS_FATURASI', tutar: 50_000, islem_aciklamasi: 'Satış faturası' },
  { islem_no: 'BEA-2026-00002', islem_tipi: 'SATIS_FATURASI', tutar: 85_000, islem_aciklamasi: 'Satış faturası' },
  { islem_no: 'BEA-2026-00001', islem_tipi: 'SATIS_FATURASI', tutar: 100_000, islem_aciklamasi: 'Satış faturası' },
  {
    islem_no: 'KL-PES-1',
    islem_tipi: 'KASA_GIRIS',
    tutar: 15_000,
    is_reservation_deposit: true,
    islem_aciklamasi: 'Rezervasyon peşinatı',
  },
  {
    islem_no: 'KL-PES-2',
    islem_tipi: 'SATIS_FATURASI',
    tutar: 25_000,
    is_reservation_deposit: true,
    islem_aciklamasi: 'Rezervasyon peşinatı',
  },
];

function absoluteSum(lines: readonly CashTransactionFooterLine[]): number {
  return lines.reduce((sum, line) => sum + Math.abs(Number(line.tutar) || 0), 0);
}

/** DevEx dip toplamı: `Number(getValue) || 0`. Eksi tutar 0'a düşmemeli. */
function gridFooterSum(lines: readonly CashTransactionFooterLine[]): number {
  const getValue = cashTransactionAmountFooterColumn<CashTransactionFooterLine>().getValue;
  return lines.reduce((acc, row) => acc + (Number(getValue(row)) || 0), 0);
}

describe('kasa işlem tutar dip toplamı', () => {
  it('yedi satırın dip toplamı 200000; mutlak toplam 350000 dip toplam olmaz', () => {
    expect(absoluteSum(MERKEZ)).toBe(350_000);
    expect(cashTransactionFooterNet(MERKEZ)).toBe(200_000);
    expect(gridFooterSum(MERKEZ)).toBe(200_000);
    expect(gridFooterSum(MERKEZ)).not.toBe(350_000);
  });

  it('satır tutarı hareket olarak kalır; yalnız çıkışlar negatif etki yapar', () => {
    expect(MERKEZ[0]?.tutar).toBe(25_000);
    expect(cashTransactionAmountIsInflow(MERKEZ[0])).toBe(false);
    expect(cashTransactionFooterSignedAmount(MERKEZ[0])).toBe(-25_000);
    expect(cashTransactionFooterSignedAmount(MERKEZ[1])).toBe(-50_000);
    expect(cashTransactionAmountIsInflow(MERKEZ[2])).toBe(true);
    expect(cashTransactionFooterSignedAmount(MERKEZ[2])).toBe(50_000);
    expect(cashTransactionFooterSignedAmount(MERKEZ[3])).toBe(85_000);
    expect(cashTransactionFooterSignedAmount(MERKEZ[4])).toBe(100_000);
    const negatives = MERKEZ.filter((line) => cashTransactionFooterSignedAmount(line) < 0);
    expect(negatives).toHaveLength(2);
    expect(negatives.every((line) => !cashTransactionAmountIsInflow(line))).toBe(true);
  });

  it('giriş 275000, çıkış 75000, net 200000', () => {
    const inflow = MERKEZ.filter((line) => cashTransactionAmountIsInflow(line));
    const outflow = MERKEZ.filter((line) => !cashTransactionAmountIsInflow(line));
    expect(cashTransactionFooterNet(inflow)).toBe(275_000);
    expect(cashTransactionFooterNet(outflow)).toBe(-75_000);
    expect(cashTransactionFooterNet(inflow) + cashTransactionFooterNet(outflow)).toBe(200_000);
  });

  it('filtre dip toplamı süzülmüş satırların netidir', () => {
    const purchases = MERKEZ.filter((line) => line.islem_tipi === 'ALIS_FATURASI');
    expect(cashTransactionFooterNet(purchases)).toBe(-75_000);
    expect(cashTransactionFooterNet(purchases)).not.toBe(75_000);
  });

  it('boş liste dip toplamı 0', () => {
    expect(cashTransactionFooterNet([])).toBe(0);
    expect(cashTransactionFooterNet(null)).toBe(0);
    expect(cashTransactionFooterSignedAmount(null)).toBe(0);
  });

  it('kasa fişi KASA_CIKIS ve KASA_GIRIS olarak durunca da net 200000', () => {
    const posted: CashTransactionFooterLine[] = [
      { islem_no: '00002', islem_tipi: 'KASA_CIKIS', tutar: 25_000, sign: -1, islem_aciklamasi: 'Alış faturası — 00002' },
      { islem_no: '00001', islem_tipi: 'KASA_CIKIS', tutar: 50_000, sign: -1, islem_aciklamasi: 'Alış faturası — 00001' },
      { islem_no: 'BEA-2026-00003', islem_tipi: 'KASA_GIRIS', tutar: 50_000, sign: 1 },
      { islem_no: 'BEA-2026-00002', islem_tipi: 'KASA_GIRIS', tutar: 85_000, sign: 1 },
      { islem_no: 'BEA-2026-00001', islem_tipi: 'KASA_GIRIS', tutar: 100_000, sign: 1 },
      { islem_no: 'KL-PES-1', islem_tipi: 'KASA_GIRIS', tutar: 15_000, sign: 1, is_reservation_deposit: true },
      { islem_no: 'KL-PES-2', islem_tipi: 'KASA_GIRIS', tutar: 25_000, sign: 1, is_reservation_deposit: true },
    ];
    expect(absoluteSum(posted)).toBe(350_000);
    expect(cashTransactionFooterNet(posted)).toBe(200_000);
  });

  it('rezervasyon peşinatı bir kez eklenir', () => {
    const deposit = MERKEZ[5]!;
    expect(cashTransactionFooterSignedAmount(deposit)).toBe(15_000);
    expect(cashTransactionFooterNet([deposit, deposit])).toBe(30_000);
    const withSale = [MERKEZ[2]!, deposit];
    expect(cashTransactionFooterNet(withSale)).toBe(65_000);
  });

  it('gider çıkıştır ve bir kez düşülür', () => {
    const expense: CashTransactionFooterLine = {
      islem_no: 'GID-1',
      islem_tipi: 'GIDER_PUSULASI',
      tutar: 10_000,
    };
    expect(cashTransactionFooterSignedAmount(expense)).toBe(-10_000);
    expect(cashTransactionFooterNet([expense, MERKEZ[2]!])).toBe(40_000);
  });

  it('virman bu kasanın kendi yönünü uygular; şirket nakdini sıfırlamaz', () => {
    const out: CashTransactionFooterLine = {
      islem_no: 'VRM-1',
      islem_tipi: 'VIRMAN',
      tutar: 10_000,
      sign: -1,
      kasa_id: 'merkez',
    };
    const into: CashTransactionFooterLine = {
      islem_no: 'VRM-1-VRM',
      islem_tipi: 'VIRMAN',
      tutar: 10_000,
      sign: 1,
      kasa_id: 'merkez',
    };
    expect(cashTransactionFooterSignedAmount(out)).toBe(-10_000);
    expect(cashTransactionAmountIsInflow(out)).toBe(false);
    expect(cashTransactionFooterSignedAmount(into)).toBe(10_000);
    expect(cashTransactionAmountIsInflow(into)).toBe(true);
    expect(cashTransactionFooterNet([out])).toBe(-10_000);
    expect(cashTransactionFooterNet([into])).toBe(10_000);
  });

  it('excel dip toplamı aynı neti yazar; satır tutarı mutlak kalır', () => {
    const columns: ColumnDef<CashTransactionFooterLine, unknown>[] = [
      { id: 'islem_no', accessorKey: 'islem_no', header: 'Fiş No' },
      { id: 'tutar', accessorKey: 'tutar', header: 'Tutar' },
    ];
    const footer = cashTransactionAmountFooterColumn<CashTransactionFooterLine>();
    const { aoa } = buildDataGridExportAoa(MERKEZ, columns, {
      footerLabel: 'TOPLAM',
      footerSumColumns: [footer],
    });
    const purchaseCell = aoa[1]?.[1];
    const footerRow = aoa[aoa.length - 1];
    expect(purchaseCell).toBe('25.000');
    expect(footerRow?.[1]).toBe('200.000');
    expect(footerRow?.[1]).not.toBe('350.000');

    const onlyOut = buildDataGridExportAoa(
      MERKEZ.filter((line) => line.islem_tipi === 'ALIS_FATURASI'),
      columns,
      { footerLabel: 'TOPLAM', footerSumColumns: [footer] },
    );
    expect(onlyOut.aoa[onlyOut.aoa.length - 1]?.[1]).toBe('-75.000');

    const empty = buildDataGridExportAoa([], columns, {
      footerLabel: 'TOPLAM',
      footerSumColumns: [footer],
    });
    expect(empty.aoa).toHaveLength(1);
    expect(cashTransactionFooterNet([])).toBe(0);
  });
});
