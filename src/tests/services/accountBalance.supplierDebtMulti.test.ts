/**
 * Tedarikçi Brüt Borç — kök neden düzeltme regression testleri.
 *
 * MEGAL COMPANY (TED-006) gerçek verisinde Brüt Borç 5x (88M → 417M)
 * çıkmıştı. Kök neden: SQL CTE `sqlSupplierAccountBalancesCte`'deki
 * name fallback INNER JOIN'i `firm_nr` filtresi olmadan tüm firmalardaki
 * tedarikçi kartlarına eşleşiyordu. Aynı MEGAL COMPANY ünvanı 5 ayrı
 * firmada kayıtlıysa, aynı sales satırı name JOIN'de 5 kez katlanıyordu.
 *
 * Bu test seti:
 *   1) Helper'ın tek bir `accountId` ile çift firma sayımı yapmadığını
 *      doğrular (id öncelikli, name fallback yalnız id yoksa).
 *   2) PDF satır toplamı ile ekran Brüt Borç değerinin uyumlu olduğunu
 *      doğrular (88M civarı).
 *   3) Hem purchase_invoice (cash=NULL ise dahil) hem return_invoice
 *      ABS brüt olarak sayılır.
 *   4) Ödenen = 0 doğru (PDF'te hiç ödeme yok).
 *
 * SQL CTE düzeltmesi `accountBalance.ts:sqlSupplierAccountBalancesCte`
 * içinde — `firmNrBind` parametresi + `sqlFirmScopedCardMatch` ile
 * name JOIN firma kapsamına alındı.
 */

import { describe, expect, it } from 'vitest';
import {
  computeSupplierDebtTotalFromSales,
  computeSupplierPaidAmountFromCashLines,
  type LedgerSaleRow,
  type LedgerCashRow,
} from '../../services/api/accountBalance';

describe('accountBalance.supplierDebtMulti — 5x katlama regression', () => {
  // PDF'teki MEGAL COMPANY purchase satırları (24 purchase + 3 return)
  // PDF purchase-only brüt = 89.886.060 IQD
  // PDF iadeler (ABS) = 290.400 + 196.000 + 484.500 = 970.900 IQD
  // PDF brüt toplam (purchase + iade ABS) = 90.856.960 IQD
  const PDF_PURCHASE_TOTAL = 89886060;
  const PDF_RETURN_TOTAL = 970900;
  const PDF_BRUT_GROSS = PDF_PURCHASE_TOTAL + PDF_RETURN_TOTAL;

  it('PDF purchase satırları → Brüt Borç ≈ 90.8M IQD (5x katlama yok)', () => {
    // 24 purchase_invoice satırı (PDF purchase-only toplamı 89.886.060 IQD) + 3 return_invoice
    // 24 satırın eşit dağılımı: 24 × 3.745.252 + 12 tail = 89.886.060 (tam)
    const purchaseCount = 24;
    const partAmt = Math.floor(PDF_PURCHASE_TOTAL / purchaseCount); // 3.745.252
    const tail = PDF_PURCHASE_TOTAL - partAmt * purchaseCount; // 12
    const rows: LedgerSaleRow[] = [
      ...Array.from({ length: purchaseCount }, (_, i) => ({
        customer_id: 'card-MEGAL',
        customer_name: 'MEGAL COMPANY',
        net_amount: i === 0 ? partAmt + tail : partAmt, // ilk satır tail dahil
        fiche_type: 'purchase_invoice' as const,
        is_cancelled: false,
        payment_method: null, // ← NULL: cash değil → borca dahil (görge)
      })),
      { customer_id: 'card-MEGAL', customer_name: 'MEGAL COMPANY', net_amount: 290400, fiche_type: 'return_invoice' as const, is_cancelled: false },
      { customer_id: 'card-MEGAL', customer_name: 'MEGAL COMPANY', net_amount: 196000, fiche_type: 'return_invoice' as const, is_cancelled: false },
      { customer_id: 'card-MEGAL', customer_name: 'MEGAL COMPANY', net_amount: 484500, fiche_type: 'return_invoice' as const, is_cancelled: false },
    ];

    const sum = computeSupplierDebtTotalFromSales('card-MEGAL', 'MEGAL COMPANY', rows);
    // Toplam = 89.886.060 (purchase) + 970.900 (return ABS) = 90.856.960
    expect(sum).toBe(PDF_BRUT_GROSS);
    // 5x (yaklaşık 450M) değil, gerçek brüt (90M civarı) olduğunu doğrula
    expect(sum).toBeLessThan(PDF_BRUT_GROSS * 2);
  });

  it('aynı fiziksel satır yalnız bir kez sayılır (id + name çift eşleşme yok)', () => {
    const rows: LedgerSaleRow[] = [
      { customer_id: 'card-X', customer_name: 'TED-006 MEGAL COMPANY', net_amount: 5000000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: null },
    ];
    const sum = computeSupplierDebtTotalFromSales('card-X', 'TED-006 MEGAL COMPANY', rows);
    expect(sum).toBe(5000000);
  });

  it('id yok, name fallback ile tek sefer sayılır (pasif/legacy card)', () => {
    const rows: LedgerSaleRow[] = [
      { customer_id: null, customer_name: 'MEGAL COMPANY', net_amount: 2000000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: null },
    ];
    const sum = computeSupplierDebtTotalFromSales('card-Y', 'MEGAL COMPANY', rows);
    expect(sum).toBe(2000000);
  });

  it('iptal edilmiş satırlar dışlanır', () => {
    const rows: LedgerSaleRow[] = [
      { customer_id: 'card-Z', customer_name: 'A', net_amount: 1000000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: null },
      { customer_id: 'card-Z', customer_name: 'A', net_amount: 9999999, fiche_type: 'purchase_invoice', is_cancelled: true, payment_method: null },
    ];
    const sum = computeSupplierDebtTotalFromSales('card-Z', 'A', rows);
    expect(sum).toBe(1000000);
  });

  it('peşin alış (cash/nakit) → borca dahil edilmez', () => {
    const rows: LedgerSaleRow[] = [
      { customer_id: 'card-P', customer_name: 'P', net_amount: 5000000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: 'cash' },
      { customer_id: 'card-P', customer_name: 'P', net_amount: 3000000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: 'nakit' },
      { customer_id: 'card-P', customer_name: 'P', net_amount: 2000000, fiche_type: 'purchase_invoice', is_cancelled: false, payment_method: null }, // veresiye/boş → dahil
    ];
    const sum = computeSupplierDebtTotalFromSales('card-P', 'P', rows);
    expect(sum).toBe(2000000);
  });

  it('Ödenen = 0 doğru (PDF senaryosu: hiç ödeme kaydı yok)', () => {
    const cash: LedgerCashRow[] = [
      // PDF'te hiç CH_TAHSILAT satırı yok; diğer hareketler filtre dışı
      { customer_id: 'card-MEGAL', amount: 500000, transaction_type: 'VIRMAN' },
      { customer_id: 'card-MEGAL', amount: 200000, transaction_type: 'CH_ODEME' },
      { customer_id: 'card-OTHER', amount: 999, transaction_type: 'CH_TAHSILAT' },
    ];
    const paid = computeSupplierPaidAmountFromCashLines('card-MEGAL', cash);
    expect(paid).toBe(0);
  });
});