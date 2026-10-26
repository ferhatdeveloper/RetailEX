/**
 * Kayıtlı nakit alış / satış faturasının kasa satırı.
 * Düzenlenince düz kasa çıkış veya giriş formu açılmaz.
 * Açıklamadaki fiş numarası tam fatura belgesine gider.
 * Tutar aynı fişe ikinci kez yazılmaz.
 */
import { describe, expect, it } from 'vitest';
import {
  applyInvoiceToCashDrawers,
  emptyCashDrawerState,
  planInvoiceCashPosting,
} from '../../utils/invoiceCashRegisterPosting';
import {
  buildCashDocumentInvoiceLaunch,
  buildSavedCashInvoiceLaunch,
  cashPrefillInvoiceCode,
  cashPrefillInvoiceLookup,
  cashRowEditSurface,
  resolveSavedCashInvoiceOpen,
} from '../../utils/cashDocumentInvoiceLaunch';
import { isCashReturnMenuType } from '../../utils/cashReturnInvoiceLaunch';

const KASA = '11111111-1111-4111-8111-111111111111';

describe('kayıtlı nakit fatura kasa satırı', () => {
  it('nakit alış kasa satırı alış fatura formunu açar, kasa çıkış formunu açmaz', () => {
    const plan = planInvoiceCashPosting({
      category: 'Alis',
      trcode: 1,
      paymentMethod: 'NAKIT',
      netAmount: 25000,
      cashRegisterId: KASA,
      ficheNo: '00002',
    });
    const description = `${plan.descriptionPrefix} — 00002`;
    expect(plan.lines[0].transactionType).toBe('KASA_CIKIS');
    expect(plan.lines[0].sign).toBe(-1);
    expect(description).toBe('Alış faturası — 00002');

    const row = {
      transactionType: 'KASA_CIKIS',
      description,
      ficheNo: '00002',
    };
    expect(cashRowEditSurface(row)).toBe('purchase-invoice');
    const open = resolveSavedCashInvoiceOpen(row);
    expect(open?.screen).toBe('purchaseinvoice');
    expect(open?.trcode).toBe(1);
    expect(open?.category).toBe('Alis');
    expect(open?.ficheNo).toBe('00002');

    const launch = buildSavedCashInvoiceLaunch({
      kind: 'purchase',
      ficheNo: open!.ficheNo,
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    expect(launch.screen).toBe('purchaseinvoice');
    expect(launch.posSalesReturn.openForm).toBe(true);
    expect(launch.posSalesReturn.openFicheNo).toBe('00002');
    expect(launch.posSalesReturn.editData.invoice_no).toBe('00002');
    expect(cashPrefillInvoiceCode({
      defaultCategory: 'Alis',
      prefill: launch.posSalesReturn,
    })).toBe(1);
    expect(cashPrefillInvoiceLookup(1)).toEqual({ invoiceCategory: 'Alis', invoiceType: 0 });
  });

  it('nakit satış kasa satırı satış fatura formunu açar', () => {
    const plan = planInvoiceCashPosting({
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'NAKIT',
      netAmount: 25000,
      cashRegisterId: KASA,
      ficheNo: 'SF-10',
    });
    const description = `${plan.descriptionPrefix} — SF-10`;
    expect(plan.lines[0].transactionType).toBe('KASA_GIRIS');
    expect(plan.lines[0].sign).toBe(1);
    expect(cashRowEditSurface({
      transactionType: plan.lines[0].transactionType,
      description,
    })).toBe('sales-invoice');
    const launch = buildSavedCashInvoiceLaunch({
      kind: 'sale',
      ficheNo: 'SF-10',
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    expect(launch.screen).toBe('salesinvoice');
    expect(launch.posSalesReturn.openFicheNo).toBe('SF-10');
    expect(cashPrefillInvoiceCode({
      defaultCategory: 'Satis',
      defaultInvoiceTypeFilter: 'all',
      prefill: launch.posSalesReturn,
    })).toBe(8);
    expect(cashPrefillInvoiceLookup(8)).toEqual({ invoiceCategory: 'Satis', invoiceType: 0 });
  });

  it('fiş numarasındaki tireyi ve çoklu ödeme ekini koparmaz', () => {
    expect(resolveSavedCashInvoiceOpen({
      transactionType: 'KASA_GIRIS',
      description: 'Satış faturası — BEA-2026-MUS34222',
    })?.ficheNo).toBe('BEA-2026-MUS34222');
    expect(resolveSavedCashInvoiceOpen({
      transactionType: 'KASA_CIKIS',
      description: 'Alış faturası — 00002 — Ödeme 1/2',
      ficheNo: '00002-1',
    })?.ficheNo).toBe('00002');
    expect(resolveSavedCashInvoiceOpen({
      transactionType: 'KASA_CIKIS',
      description: 'Alış faturası - 00002',
    })?.ficheNo).toBe('00002');
  });

  it('faturasız kasa çıkışı, cari, iade, hizmet, banka ve gider kasa formunda kalır', () => {
    expect(cashRowEditSurface({
      transactionType: 'KASA_CIKIS',
      description: 'Ofis kirası',
      ficheNo: 'K-44',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'KASA_GIRIS',
      description: 'Kasa giriş',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'CH_TAHSILAT',
      description: 'Alış faturası — 00002 — kısmi tahsilat',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'CH_ODEME',
      description: 'Cari ödeme',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'VIRMAN',
      description: 'Kasa virmanı',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'BANKA_YATIRILAN',
      description: 'Bankaya yatırılan',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'GIDER_PUSULASI',
      description: 'Gider pusulası',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'KASA_CIKIS',
      description: 'Alınan hizmet faturası — 00009',
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'SATIS_IADE_FATURASI',
      description: 'Satış iade — 00004',
    })).toBe('cash-form');
    expect(isCashReturnMenuType('SATIS_IADE_FATURASI')).toBe(true);
    expect(cashRowEditSurface({
      transactionType: 'KASA_GIRIS',
      description: 'Satış faturası — BEA-2026-DEP1',
      isReservationDeposit: true,
    })).toBe('cash-form');
    expect(cashRowEditSurface({
      transactionType: 'KASA_GIRIS',
      description: 'Alış faturası — 00002',
    })).toBe('cash-form');
  });

  it('menüden yeni fatura hâlâ fişsiz taslak açar', () => {
    const sales = buildCashDocumentInvoiceLaunch({
      type: 'SATIS_FATURASI',
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    expect(sales.posSalesReturn.openFicheNo).toBeUndefined();
    expect(sales.screen).toBe('salesinvoice');
    const purchase = buildCashDocumentInvoiceLaunch({
      type: 'ALIS_FATURASI',
      registerId: KASA,
    });
    expect(purchase.posSalesReturn.openFicheNo).toBeUndefined();
    expect(purchase.screen).toBe('purchaseinvoice');
  });

  it('nakit tutarı aynı fişe bir kez yazılır', () => {
    const purchaseInput = {
      category: 'Alis',
      trcode: 1,
      paymentMethod: 'NAKIT',
      netAmount: 25000,
      cashRegisterId: KASA,
      ficheNo: '00002',
    };
    const once = applyInvoiceToCashDrawers(emptyCashDrawerState(), purchaseInput);
    const twice = applyInvoiceToCashDrawers(once, purchaseInput);
    expect(once.registers[KASA]).toBe(-25000);
    expect(twice.registers[KASA]).toBe(-25000);
    expect(twice.lines).toHaveLength(1);
    expect(twice.netCash).toBe(-25000);
    expect(planInvoiceCashPosting({ ...purchaseInput, alreadyPosted: 25000 }).lines).toHaveLength(0);

    const salesInput = {
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'NAKIT',
      netAmount: 25000,
      cashRegisterId: KASA,
      ficheNo: 'SF-10',
    };
    const saleOnce = applyInvoiceToCashDrawers(emptyCashDrawerState(), salesInput);
    const saleTwice = applyInvoiceToCashDrawers(saleOnce, salesInput);
    expect(saleOnce.registers[KASA]).toBe(25000);
    expect(saleTwice.registers[KASA]).toBe(25000);
    expect(saleTwice.lines).toHaveLength(1);
    expect(saleTwice.netCash).toBe(25000);
    expect(saleTwice.lines[0].transactionType).toBe('KASA_GIRIS');
    expect(twice.lines[0].transactionType).toBe('KASA_CIKIS');
  });

  it('iade araması kendi kategorisinde kalır', () => {
    expect(cashPrefillInvoiceLookup(3)).toEqual({ invoiceCategory: 'Iade', invoiceType: 3 });
    expect(cashPrefillInvoiceLookup(6)).toEqual({ invoiceCategory: 'Iade', invoiceType: 6 });
  });
});
