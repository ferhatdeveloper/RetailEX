/**
 * Nakit satış iadesi kasadan bir kez çıkar; ekstre borç ve alacak birlikte yazılır.
 * Nakit alış iadesi kasaya bir kez girer. Peşinat alacak bırakmaz.
 */
import { describe, expect, it } from 'vitest';
import { buildEkstreRows } from '../../utils/cariAccountStatement';
import {
  applyInvoiceToCashDrawers,
  emptyCashDrawerState,
} from '../../utils/invoiceCashRegisterPosting';
import {
  buildCashReturnInvoiceLaunch,
  isCashReturnMenuType,
} from '../../utils/cashReturnInvoiceLaunch';

const KASA = '00000000-0000-0000-0000-000000000001';

describe('nakit iade ekstresi ve kasa', () => {
  it('nakit satış iadesi 15.000 kasa çıkışı, ekstre borç ve alacak 15.000, cari net artmaz', () => {
    const sold = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Satis',
      trcode: 8,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: KASA,
      ficheNo: 'BEA-2026-00002',
    });
    const returned = applyInvoiceToCashDrawers(sold, {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: KASA,
      ficheNo: '00005',
    });
    expect(returned.registers[KASA]).toBe(0);
    expect(returned.lines.find((line) => line.ficheNo === '00005')?.sign).toBe(-1);
    expect(returned.lines.find((line) => line.ficheNo === '00005')?.amount).toBe(15000);
    expect(returned.customerBalance).toBe(0);

    const rows = buildEkstreRows(
      [
        {
          date: '2026-10-25',
          fiche_no: 'KL-1',
          fiche_type: 'CH_TAHSILAT',
          special_code: 'REZERVASYON',
          notes: 'Rezervasyon tahsilatı',
          total_amount: 5000,
          payment_method: 'Nakit',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00001',
          fiche_type: 'sales_invoice',
          total_amount: 20000,
          payment_method: 'cash',
        },
        {
          date: '2026-10-25',
          fiche_no: 'BEA-2026-00002',
          fiche_type: 'sales_invoice',
          total_amount: 15000,
          payment_method: 'Nakit',
        },
        {
          date: '2026-10-25',
          fiche_no: '00005',
          fiche_type: 'return_invoice',
          trcode: 3,
          total_amount: 15000,
          payment_method: 'cash',
        },
      ],
      'customer',
    );
    const iade = rows[3];
    expect(iade.borcAmount).toBe(15000);
    expect(iade.alacakAmount).toBe(15000);
    expect(iade.balance).toBe(0);
    const borc = rows.reduce((sum, row) => sum + row.borcAmount, 0);
    const alacak = rows.reduce((sum, row) => sum + row.alacakAmount, 0);
    expect(borc).toBe(55000);
    expect(alacak).toBe(55000);
  });

  it('nakit alış iadesi 15.000 kasa girişi, ekstre iki taraf eşit', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Iade',
      trcode: 6,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: KASA,
      ficheNo: 'AI-15',
    });
    expect(state.registers[KASA]).toBe(15000);
    expect(state.lines[0]?.sign).toBe(1);
    expect(state.supplierBalance).toBe(0);
    expect(state.revenue).toBe(0);

    const rows = buildEkstreRows(
      [
        {
          fiche_type: 'purchase_invoice',
          payment_method: 'Veresiye',
          total_amount: 15000,
          trcode: 1,
        },
        {
          fiche_type: 'return_invoice',
          payment_method: 'Nakit',
          total_amount: 15000,
          trcode: 6,
        },
      ],
      'supplier',
    );
    expect(rows[1].borcAmount).toBe(15000);
    expect(rows[1].alacakAmount).toBe(15000);
    expect(rows[1].balance).toBe(15000);
  });

  it('aynı iade ikinci kez kasayı düşürmez', () => {
    const once = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: KASA,
      ficheNo: '00005',
    });
    const twice = applyInvoiceToCashDrawers(once, {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Nakit',
      netAmount: 15000,
      cashRegisterId: KASA,
      ficheNo: '00005',
      alreadyPosted: 15000,
    });
    expect(twice.registers[KASA]).toBe(-15000);
    expect(twice.lines).toHaveLength(1);
    expect(twice.customerBalance).toBe(0);
  });

  it('açık cari iade kasaya yazılmaz ve yalnız alacak kalır', () => {
    const state = applyInvoiceToCashDrawers(emptyCashDrawerState(), {
      category: 'Iade',
      trcode: 3,
      paymentMethod: 'Açık Cari Hesap',
      netAmount: 15000,
      cashRegisterId: KASA,
      ficheNo: 'ACIK-IADE',
    });
    expect(state.lines).toHaveLength(0);
    expect(state.customerBalance).toBe(-15000);

    const rows = buildEkstreRows(
      [
        {
          fiche_type: 'sales_invoice',
          payment_method: 'Veresiye',
          total_amount: 15000,
          trcode: 8,
        },
        {
          fiche_type: 'return_invoice',
          payment_method: 'Açık Cari Hesap',
          total_amount: 15000,
          trcode: 3,
        },
      ],
      'customer',
    );
    expect(rows[1].borcAmount).toBe(0);
    expect(rows[1].alacakAmount).toBe(15000);
    expect(rows[1].balance).toBe(0);
  });

  it('peşinat alacak olmaz', () => {
    const rows = buildEkstreRows(
      [
        {
          fiche_type: 'CH_TAHSILAT',
          special_code: 'REZERVASYON',
          notes: 'Rezervasyon tahsilatı',
          total_amount: 5000,
        },
      ],
      'customer',
    );
    expect(rows[0].borcAmount).toBe(5000);
    expect(rows[0].alacakAmount).toBe(5000);
    expect(rows[0].balance).toBe(0);
  });

  it('kasa menüsü tam iade belgesini açar, sade fiş hedefi değildir', () => {
    expect(isCashReturnMenuType('SATIS_IADE_FATURASI')).toBe(true);
    expect(isCashReturnMenuType('KASA_CIKIS')).toBe(false);
    const sales = buildCashReturnInvoiceLaunch({
      type: 'SATIS_IADE_FATURASI',
      registerId: KASA,
      registerCode: 'KASA.001',
      registerName: 'MERKEZ KASA',
    });
    expect(sales.screen).toBe('sales-invoice-return');
    expect(sales.posSalesReturn.openForm).toBe(true);
    expect(sales.posSalesReturn.openFicheNo).toBeUndefined();
    expect(sales.posSalesReturn.editData.payment_method).toBe('NAKIT');
    expect(sales.posSalesReturn.editData.cash_register_id).toBe(KASA);
    expect(sales.posSalesReturn.editData.trcode).toBe(3);

    const purchase = buildCashReturnInvoiceLaunch({
      type: 'ALIS_IADE_FATURASI',
      registerId: KASA,
      ficheNo: '00009',
    });
    expect(purchase.screen).toBe('purchase-invoice-return');
    expect(purchase.posSalesReturn.editData.trcode).toBe(6);
    expect(purchase.posSalesReturn.openFicheNo).toBe('00009');
  });
});
