/**
 * Detaylı Satış Raporu — 20.10.2026 fişleri.
 *
 * Ekran genel toplamı miktar 5 ve 140.000 gösteriyordu: 0000003 BOYA iadesi
 * (1 × 10.000) artı yazılıp toplama ekleniyordu.
 *
 * Net ciro 120.000 = hizmet 110.000 + ürün satışı 20.000 − iade 10.000.
 * Net miktar 3 = −1 + 1 + 1 + 2.
 * 140.000 (iade eklenir), 130.000 (iade yok sayılır), 110.000 (ürün satışı
 * düşer veya iade iki kez düşülür) yanlış. Peşinat 20.000 bu rapora girmez.
 * Birim fiyat 10.000 satış fiyatıdır; maliyet 5.500 yazılmaz.
 */

import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../utils/formatNumber';
import { isDepositSale } from '../../utils/reportDepositFilter';
import {
  detailedSalesLineMoney,
  signDetailedSalesLine,
} from '../../utils/detailedSalesLineSign';

interface LineIn {
  product: string;
  qty: number;
  price: number;
  total: number;
}

interface FicheIn {
  invoiceNo: string;
  status?: string;
  total?: number;
  trcode?: number;
  ficheType?: string;
  isDeposit?: boolean;
  lines: LineIn[];
}

interface MoneyRow {
  invoiceNo: string;
  product: string;
  qty: number;
  price: number;
  total: number;
  isReturn: boolean;
  kind: string;
}

/** ReportsModule.buildErpDetailedSaleLines ile aynı para fonksiyonu. */
function rowsFromFiches(fiches: FicheIn[]): MoneyRow[] {
  const out: MoneyRow[] = [];
  for (const fiche of fiches) {
    if (fiche.isDeposit === true || isDepositSale({ isDeposit: fiche.isDeposit })) continue;
    for (const line of fiche.lines) {
      const money = detailedSalesLineMoney(fiche, {
        quantity: line.qty,
        total: line.total,
        price: line.price,
      });
      out.push({
        invoiceNo: fiche.invoiceNo,
        product: line.product,
        qty: money.qty,
        price: money.price,
        total: money.total,
        isReturn: money.isReturn,
        kind: money.isReturn ? 'İade' : 'Satış',
      });
    }
  }
  return out;
}

/** DevEx grup / dip toplamı: Number(tutar) || 0 — eksi tutar 0'a düşmez. */
function gridSum(rows: MoneyRow[], key: 'qty' | 'total'): number {
  return rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
}

function groupTotal(rows: MoneyRow[], invoiceNo: string): number {
  return gridSum(rows.filter((row) => row.invoiceNo === invoiceNo), 'total');
}

const screenshotFiches: FicheIn[] = [
  {
    invoiceNo: '0000003',
    status: 'return',
    total: -10_000,
    trcode: 3,
    lines: [{ product: 'BOYA', qty: 1, price: 10_000, total: 10_000 }],
  },
  {
    invoiceNo: 'BEA-2026-MVGYLBOM',
    status: 'completed',
    total: 110_000,
    lines: [
      { product: 'HAIR CUT', qty: 1, price: 50_000, total: 50_000 },
      { product: 'HAIR PINK COLOR', qty: 1, price: 60_000, total: 60_000 },
    ],
  },
  {
    invoiceNo: 'BEA-2026-MVGZEUWF',
    status: 'completed',
    total: 20_000,
    lines: [{ product: 'BOYA', qty: 2, price: 10_000, total: 20_000 }],
  },
  {
    invoiceNo: 'PESINAT-20',
    status: 'completed',
    total: 20_000,
    isDeposit: true,
    lines: [{ product: 'PEŞİNAT', qty: 1, price: 20_000, total: 20_000 }],
  },
];

describe('Detaylı Satış Raporu — 0000003 BOYA iadesi', () => {
  const rows = rowsFromFiches(screenshotFiches);
  const boyaReturn = rows.find((row) => row.invoiceNo === '0000003');
  const hairCut = rows.find((row) => row.product === 'HAIR CUT');
  const hairColor = rows.find((row) => row.product === 'HAIR PINK COLOR');
  const boyaSale = rows.find((row) => row.invoiceNo === 'BEA-2026-MVGZEUWF');

  it('genel toplam 120.000 ve net miktar 3', () => {
    const services = 110_000;
    const productSale = 20_000;
    const productReturn = 10_000;
    expect(services + productSale + productReturn).toBe(140_000);
    expect(services + productSale).toBe(130_000);
    expect(services).toBe(110_000);
    expect(services + (productSale - productReturn - productReturn)).toBe(110_000);

    expect(gridSum(rows, 'total')).toBe(services + productSale - productReturn);
    expect(gridSum(rows, 'total')).toBe(120_000);
    expect(gridSum(rows, 'qty')).toBe(3);
    expect(Number.isInteger(gridSum(rows, 'total'))).toBe(true);
    expect(Number.isInteger(gridSum(rows, 'qty'))).toBe(true);
  });

  it('iade satırı miktar −1, satır toplamı −10.000, birim fiyat 10.000, tür İade', () => {
    expect(boyaReturn).toBeDefined();
    expect(boyaReturn?.qty).toBe(-1);
    expect(boyaReturn?.total).toBe(-10_000);
    expect(boyaReturn?.price).toBe(10_000);
    expect(boyaReturn?.isReturn).toBe(true);
    expect(boyaReturn?.kind).toBe('İade');
    expect(formatNumber(boyaReturn?.qty ?? 0, 2, false)).toBe('-1');
    expect(formatNumber(boyaReturn?.total ?? 0, 2, false)).toBe('-10.000');
    expect(formatNumber(boyaReturn?.price ?? 0, 2, false)).toBe('10.000');
  });

  it('grup toplamları: iade −10.000, hizmet 110.000, ürün satışı 20.000', () => {
    expect(groupTotal(rows, '0000003')).toBe(-10_000);
    expect(groupTotal(rows, 'BEA-2026-MVGYLBOM')).toBe(110_000);
    expect(groupTotal(rows, 'BEA-2026-MVGZEUWF')).toBe(20_000);
    expect(hairCut?.total).toBe(50_000);
    expect(hairCut?.qty).toBe(1);
    expect(hairColor?.total).toBe(60_000);
    expect(hairColor?.qty).toBe(1);
    expect(boyaSale?.total).toBe(20_000);
    expect(boyaSale?.qty).toBe(2);
    expect(boyaSale?.price).toBe(10_000);
    expect(boyaSale?.isReturn).toBe(false);
  });

  it('peşinat 20.000 satırlara ve genel toplama girmez', () => {
    expect(rows.some((row) => row.product === 'PEŞİNAT' || row.invoiceNo === 'PESINAT-20')).toBe(false);
    expect(gridSum(rows, 'total')).toBe(120_000);
  });

  it('iade zaten eksiyse ikinci işaret 0 yapmaz', () => {
    const once = signDetailedSalesLine(true, 1, 10_000, 10_000);
    const twice = signDetailedSalesLine(true, once.qty, once.total, once.price);
    expect(once).toEqual({ qty: -1, price: 10_000, total: -10_000 });
    expect(twice).toEqual({ qty: -1, price: 10_000, total: -10_000 });
    const productNet = 20_000 + twice.total;
    expect(productNet).toBe(10_000);
    expect(110_000 + productNet).toBe(120_000);
    const doubleDeduct = 20_000 + twice.total + twice.total;
    expect(doubleDeduct).toBe(0);
    expect(110_000 + productNet).not.toBe(110_000 + doubleDeduct);
  });

  it('trcode 2 ve durum completed olsa da satır eksi; trcode 6 düşülmez', () => {
    const trcode2 = detailedSalesLineMoney(
      { status: 'completed', total: 10_000, trcode: 2 },
      { quantity: 1, total: 10_000, price: 10_000 },
    );
    expect(trcode2.isReturn).toBe(true);
    expect(trcode2.qty).toBe(-1);
    expect(trcode2.total).toBe(-10_000);
    expect(trcode2.price).toBe(10_000);

    const purchaseReturn = detailedSalesLineMoney(
      { status: 'return', total: 10_000, trcode: 6, ficheType: 'return_invoice' },
      { quantity: 1, total: 10_000, price: 5_500 },
    );
    expect(purchaseReturn.isReturn).toBe(false);
    expect(purchaseReturn.total).toBe(10_000);
    expect(purchaseReturn.price).toBe(10_000);
  });
});
