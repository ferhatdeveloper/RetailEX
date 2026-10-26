/**
 * Kasa İşlem Oluştur → satış ve alış faturası tam belge açar.
 * Mevcut fiş tahsilatı bu iki kartın varsayılanı değildir.
 * Nakit, menüdeki kasaya yazılır. Açık cari kasaya yazılmaz.
 */
import { describe, expect, it } from 'vitest';
import {
  applyInvoiceToCashDrawers,
  emptyCashDrawerState,
  planInvoiceCashPosting,
} from '../../utils/invoiceCashRegisterPosting';
import {
  applyKasaPinToPayment,
  buildCashDocumentInvoiceLaunch,
  cashMenuOpensExistingInvoiceSlip,
  cashPrefillInvoiceCode,
  isCashDocumentMenuType,
} from '../../utils/cashDocumentInvoiceLaunch';
import { isCashReturnMenuType } from '../../utils/cashReturnInvoiceLaunch';

const KASA = '11111111-1111-4111-8111-111111111111';
const DIGER = '22222222-2222-4222-8222-222222222222';

describe('kasa menüsü satış ve alış faturası', () => {
  it('satış kartı tam satış formunu seçili kasa ile açar', () => {
    expect(isCashDocumentMenuType('SATIS_FATURASI')).toBe(true);
    expect(cashMenuOpensExistingInvoiceSlip('SATIS_FATURASI')).toBe(false);
    const sales = buildCashDocumentInvoiceLaunch({
      type: 'SATIS_FATURASI',
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    expect(sales.screen).toBe('salesinvoice');
    expect(sales.posSalesReturn.openForm).toBe(true);
    expect(sales.posSalesReturn.editData.trcode).toBe(8);
    expect(sales.posSalesReturn.editData.invoice_type).toBe(8);
    expect(sales.posSalesReturn.editData.payment_method).toBe('NAKIT');
    expect(sales.posSalesReturn.editData.cash_register_id).toBe(KASA);
    expect(sales.posSalesReturn.editData.cash_register_code).toBe('KASA.001');
    expect(sales.posSalesReturn.editData.source).toBe('kasa');
    expect(cashPrefillInvoiceCode({
      defaultCategory: 'Satis',
      defaultInvoiceTypeFilter: 'all',
      prefill: sales.posSalesReturn,
    })).toBe(8);
  });

  it('alış kartı tam alış formunu seçili kasa ile açar', () => {
    expect(cashMenuOpensExistingInvoiceSlip('ALIS_FATURASI')).toBe(false);
    const purchase = buildCashDocumentInvoiceLaunch({
      type: 'ALIS_FATURASI',
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    expect(purchase.screen).toBe('purchaseinvoice');
    expect(purchase.posSalesReturn.editData.trcode).toBe(1);
    expect(purchase.posSalesReturn.editData.cash_register_id).toBe(KASA);
    expect(cashPrefillInvoiceCode({
      defaultCategory: 'Alis',
      prefill: purchase.posSalesReturn,
    })).toBe(1);
  });

  it('hizmet, cari ve iade kartları bu yolu kullanmaz', () => {
    expect(isCashDocumentMenuType('HIZMET_FATURASI')).toBe(false);
    expect(isCashDocumentMenuType('CH_TAHSILAT')).toBe(false);
    expect(isCashDocumentMenuType('SATIS_IADE_FATURASI')).toBe(false);
    expect(cashMenuOpensExistingInvoiceSlip('HIZMET_FATURASI')).toBe(true);
    expect(cashMenuOpensExistingInvoiceSlip('SATIS_FATURASI')).toBe(false);
    expect(isCashReturnMenuType('SATIS_IADE_FATURASI')).toBe(true);
    expect(cashPrefillInvoiceCode({
      defaultCategory: 'Iade',
      defaultInvoiceTypeFilter: '3',
      prefill: {
        openForm: true,
        editData: { trcode: 3, source: 'kasa' },
      },
    })).toBe(3);
    expect(cashPrefillInvoiceCode({
      defaultCategory: 'Hizmet',
      prefill: {
        openForm: true,
        editData: { trcode: 9, source: 'kasa', cash_register_id: KASA },
      },
    })).toBeNull();
  });

  it('nakit satış seçilen kasaya girer, başka kasaya düşmez', () => {
    const sales = buildCashDocumentInvoiceLaunch({
      type: 'SATIS_FATURASI',
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    const pinned = applyKasaPinToPayment({
      editData: sales.posSalesReturn.editData,
      paymentMethod: 'NAKIT',
      rows: [{ method: 'NAKIT', amount: 1000, cashRegisterId: DIGER }],
    });
    expect(pinned.pinned).toBe(true);
    expect(pinned.registerId).toBe(KASA);
    expect(pinned.rows[0].cashRegisterId).toBe(KASA);
    const plan = planInvoiceCashPosting({
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'NAKIT',
      netAmount: 1000,
      cashRegisterId: pinned.registerId,
      payments: pinned.rows,
      ficheNo: 'SF-1',
    });
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].registerId).toBe(KASA);
    expect(plan.lines[0].sign).toBe(1);
    expect(plan.lines[0].transactionType).toBe('KASA_GIRIS');
    const drawer = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'NAKIT',
      netAmount: 1000,
      cashRegisterId: pinned.registerId,
      payments: pinned.rows,
      ficheNo: 'SF-1',
    });
    expect(drawer.registers[KASA]).toBe(1000);
    expect(drawer.registers[DIGER]).toBeUndefined();
  });

  it('nakit alış seçilen kasadan çıkar', () => {
    const purchase = buildCashDocumentInvoiceLaunch({
      type: 'ALIS_FATURASI',
      registerId: KASA,
      registerName: 'MERKEZ KASA',
    });
    const plan = planInvoiceCashPosting({
      category: 'Alis',
      trcode: Number(purchase.posSalesReturn.editData.trcode),
      paymentMethod: 'NAKIT',
      netAmount: 400,
      cashRegisterId: String(purchase.posSalesReturn.editData.cash_register_id),
      ficheNo: 'AF-1',
    });
    expect(plan.lines[0].registerId).toBe(KASA);
    expect(plan.lines[0].sign).toBe(-1);
    expect(plan.lines[0].transactionType).toBe('KASA_CIKIS');
    const drawer = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Alis',
      trcode: 1,
      paymentMethod: 'NAKIT',
      netAmount: 400,
      cashRegisterId: KASA,
      ficheNo: 'AF-1',
    });
    expect(drawer.registers[KASA]).toBe(-400);
  });

  it('açık cari kasaya yazılmaz, cariye kalır', () => {
    const sales = buildCashDocumentInvoiceLaunch({
      type: 'SATIS_FATURASI',
      registerId: KASA,
      registerName: 'MERKEZ KASA',
    });
    const pinned = applyKasaPinToPayment({
      editData: sales.posSalesReturn.editData,
      paymentMethod: 'ACIK_CARI',
      rows: [{ method: 'ACIK_CARI', amount: 1000, cashRegisterId: KASA }],
    });
    expect(pinned.registerId).toBe('');
    expect(pinned.rows[0].cashRegisterId).toBeNull();
    const drawer = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'ACIK_CARI',
      netAmount: 1000,
      cashRegisterId: pinned.registerId || null,
      ficheNo: 'SF-ACIK',
    });
    expect(drawer.registers[KASA]).toBeUndefined();
    expect(drawer.netCash).toBe(0);
    expect(drawer.customerBalance).toBe(1000);
  });
});
