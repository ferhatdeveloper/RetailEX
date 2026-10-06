/**
 * compute*BalanceFromLedger: ledger her zaman öncelikli.
 *
 * Kök neden: eski "limit aşımı koruması" (DB ile ledger > %10 farklıysa
 * DB'ye güven) kasap DB senaryosunda ledger'ı eziyordu:
 *   DB: +9.973.363 IQD, ledger: +7.666.363 IQD → %23 fark
 *   Eski kod: DB döner (yanlış).
 *   Yeni kod: ledger döner (doğru).
 *
 * Bu test, ledger ile DB farklı olduğunda BİLE ledger'ın kazandığını
 * garanti eder. Orphan koruma yalnızca hareket yoksa (txnCount=0 veya
 * hasSupplierActivity=false) DB'ye düşer.
 */
import { describe, expect, it } from 'vitest';
import {
  computeCustomerBalanceFromLedger,
  computeSupplierBalanceFromLedger,
} from '../../services/api/accountBalance';

describe('compute*BalanceFromLedger — ledger her zaman öncelikli (koruma kaldırıldı)', () => {
  const supplierSales = [
    {
      customer_id: 'sup-1',
      customer_name: 'KASAP TEDARIKCI A.Ş.',
      net_amount: 7_666_363,
      fiche_type: 'purchase_invoice',
      is_cancelled: false,
      payment_method: 'veresiye',
    },
  ];

  const supplierCash = []; // kasa hareketi yok

  it('tedarikçi: DB 9.973.363 vs ledger 7.666.363 → ledger kazanır (7.666.363 A)', () => {
    // DB balance: 9.973.363 (yanlış/eskı). Ledger: 7.666.363 (doğru).
    // Eski kod %10 koruma ile DB'yi döndürüyordu; yeni kod ledger'ı seçer.
    const result = computeSupplierBalanceFromLedger(
      'sup-1',
      'KASAP TEDARIKCI A.Ş.',
      supplierSales,
      supplierCash,
      9_973_363, // _storedBalance = DB'deki eski değer
    );
    expect(result).toBe(7_666_363);
  });

  it('tedarikçi: hareket yoksa DB (0 değilse) yedek olarak kullanılır (orphan koruma)', () => {
    // Hareket yok (boş dizi), DB'de 9.973.363 var → orphan koruma devreye girer,
    // DB döner. Bu davranış kasap tarafından fatura silindikten sonra
    // saçma −40k değer görmemek için tutulur.
    const result = computeSupplierBalanceFromLedger(
      'sup-1',
      'KASAP TEDARIKCI A.Ş.',
      [],
      [],
      9_973_363,
    );
    expect(result).toBe(9_973_363);
  });

  it('tedarikçi: hareket var ama ledger 0 ise (sıfırlama), DB döner (sıfır değilse)', () => {
    // Hareket var (return_invoice ile tam iade) ama net 0; DB'de farklı değer var.
    // hasSupplierActivity: sumSupplierSalesLedger === 0 ve cashLines boş → false
    // → orphan koruma devrede, DB döner.
    const cancelReturn = [
      {
        customer_id: 'sup-1',
        customer_name: 'KASAP TEDARIKCI A.Ş.',
        net_amount: 5_000_000,
        fiche_type: 'purchase_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
      {
        customer_id: 'sup-1',
        customer_name: 'KASAP TEDARIKCI A.Ş.',
        net_amount: 5_000_000,
        fiche_type: 'return_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
    ];
    const result = computeSupplierBalanceFromLedger(
      'sup-1',
      'KASAP TEDARIKCI A.Ş.',
      cancelReturn,
      [],
      9_973_363, // DB yanlış ama hareket net 0; orphan koruma → DB
    );
    expect(result).toBe(9_973_363);
  });

  it('müşteri: DB yanlış vs ledger doğru → ledger kazanır', () => {
    const customerSales = [
      {
        customer_id: 'cust-1',
        customer_name: 'ÖRNEK MÜŞTERİ',
        net_amount: 5_000_000,
        fiche_type: 'sales_invoice',
        is_cancelled: false,
        payment_method: 'veresiye',
      },
    ];
    const result = computeCustomerBalanceFromLedger(
      'cust-1',
      'ÖRNEK MÜŞTERİ',
      customerSales,
      [],
      9_000_000, // DB yanlış
    );
    expect(result).toBe(5_000_000);
  });
});
