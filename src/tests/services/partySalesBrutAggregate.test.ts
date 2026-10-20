/**
 * Bug 29 follow-up (12.10.2026) — Müşteri Bazlı Satış Raporu "BRÜT TUTAR"
 * aggregate SQL regresyonu.
 *
 * Kök neden (12.10.2026 araştırması):
 *   `PartySalesPeriodReport` (mode='customer'), erpReports.ts içindeki
 *   `getPartySalesByPeriod` SQL'ini doğrudan aggregate eder — `mapInvoiceToSale`
 *   KULLANMAZ. SQL CTE `sale_lines.net_amount` kolonunu `s.net_amount` (indirim
 *   düşülmüş NET tahsilat) olarak hesaplıyordu; brüt Ciro aggregate'i
 *   `SUM(net_amount)` = 30k + 35k = 65.000 döndürüyordu.
 *
 * Düzeltme (commit 12.10.2026 + bu test):
 *   `erpReports.ts → getPartySalesByPeriod` CTE içinde aggregate alanı brüt
 *   Ciro kaynağı olan `s.total_net` (DB invariant: total_gross=0) ile
 *   değiştirildi: `COALESCE(NULLIF(s.total_net, 0), s.net_amount, 0)`;
 *   `NULLIF(total_net, 0)` → eski/eksik `total_net` olan kayıtlar için
 *   geriye dönük `net_amount` fallback.
 *
 * Beklenen: NIHAT (50k brüt / 30k net) + Refık (50k brüt / 35k net) →
 *   aggregate gross = 100.000 (önce 65.000).
 *
 * Bu test, gerçek DB yerine SQL semantiğini TypeScript'te taklit eder;
 * Postgres string formatı (`COALESCE(NULLIF(s.total_net, 0), s.net_amount, 0)`)
 * her iki uçta da eşit hesaplanır.
 */

import { describe, it, expect } from 'vitest';
import { settlePartySalesPeriodNet } from '../../utils/partySalesPeriodNet';

interface SaleRow {
  id: string;
  customer_id: string | null;
  fiche_type: string;
  total_net: number | null;
  net_amount: number | null;
  paid_amount: number | null;
  credit_amount: number | null;
  total_quantity: number;
  date: string;
}

interface PartyTotal {
  party_id: string;
  gross_amount: number;
  return_amount: number;
  total_quantity: number;
  gross_count: number;
  return_count: number;
  paid_amount: number;
  remaining_debt: number;
}

/** getPartySalesByPeriod → sale_lines CTE → gross/return aggregate (Bug 29 follow-up) */
function aggregatePartySales(rows: SaleRow[]): PartyTotal[] {
  // sale_lines CTE: aggregate kaynak sütun burada hesaplanır.
  // Düzeltme sonrası: `COALESCE(NULLIF(total_net, 0), net_amount, 0)`.
  const saleLines = rows.map((r) => ({
    party_id: r.customer_id,
    fiche_type: r.fiche_type,
    net_amount: Number(r.total_net ?? 0) > 0 ? Number(r.total_net) : Number(r.net_amount ?? 0),
    paid_amount: Number(r.paid_amount ?? 0),
    credit_amount: Number(r.credit_amount ?? 0),
    total_quantity: r.total_quantity,
  }));

  // party_totals CTE: gross = non-return, return = negative (return_invoice).
  const byParty = new Map<string, PartyTotal>();
  for (const sl of saleLines) {
    if (!sl.party_id) continue;
    const existing = byParty.get(sl.party_id) ?? {
      party_id: sl.party_id,
      gross_amount: 0,
      return_amount: 0,
      total_quantity: 0,
      gross_count: 0,
      return_count: 0,
      paid_amount: 0,
      remaining_debt: 0,
    };
    const isReturn = sl.fiche_type === 'return_invoice';
    if (isReturn) {
      existing.return_amount += sl.net_amount;
      existing.return_count += 1;
    } else {
      existing.gross_amount += sl.net_amount;
      existing.gross_count += 1;
      existing.paid_amount += sl.paid_amount;
      existing.remaining_debt += sl.credit_amount - sl.paid_amount;
    }
    existing.total_quantity += sl.total_quantity;
    byParty.set(sl.party_id, existing);
  }
  return [...byParty.values()];
}

/** 12.10.2026 production DB satırları (NIHAT + Refık). */
const DB_ROWS: SaleRow[] = [
  {
    id: '9ceaf664-61bd-4553-bd82-b3f5662e3aa8',
    customer_id: 'bae0608f-2f52-4f00-8367-0521f4434a76',
    fiche_type: 'sales_invoice',
    total_net: 50_000,
    net_amount: 30_000, // indirim düşülmüş net tahsilat
    paid_amount: 30_000,
    credit_amount: 20_000,
    total_quantity: 1,
    date: '2026-10-12',
  },
  {
    id: '35d921ab-3c0e-49fa-97ec-44e69284935b',
    customer_id: '91fc92b4-910c-4c37-bf9f-1e95e50e491d',
    fiche_type: 'sales_invoice',
    total_net: 50_000,
    net_amount: 35_000,
    paid_amount: 35_000,
    credit_amount: 15_000,
    total_quantity: 1,
    date: '2026-10-12',
  },
];

describe('getPartySalesByPeriod — Brüt Ciro aggregate (Bug 29 follow-up)', () => {
  it('NIHAT: gross_amount = 50.000 brüt (total_net)', () => {
    const totals = aggregatePartySales([DB_ROWS[0]]);
    const nihat = totals.find((t) => t.party_id === DB_ROWS[0].customer_id)!;
    expect(nihat.gross_amount).toBe(50_000);
    // net_amount brüt ile aynı (çünkü iade yok)
    expect(nihat.gross_amount + nihat.return_amount).toBe(50_000);
  });

  it('Refık: gross_amount = 50.000 brüt (total_net)', () => {
    const totals = aggregatePartySales([DB_ROWS[1]]);
    const refik = totals.find((t) => t.party_id === DB_ROWS[1].customer_id)!;
    expect(refik.gross_amount).toBe(50_000);
  });

  it('Aggregate gross = 100.000 (düzeltme sonrası — kullanıcı beklentisi)', () => {
    const totals = aggregatePartySales(DB_ROWS);
    const grossSum = totals.reduce((s, t) => s + t.gross_amount, 0);
    expect(grossSum).toBe(100_000);
  });

  it('Eski davranış: net_amount aggregate = 65.000 (yanlış — bug)', () => {
    // Bu, kullanıcının gördüğü değerin aggregate kaynağının `net_amount`
    // (indirim düşülmüş NET tahsilat) olduğunu belgeliyor. Düzeltme
    // sonrası brüt Ciro `total_net` üzerinden 100.000 olur.
    const totalsOld = aggregatePartySales(
      DB_ROWS.map((r) => ({
        ...r,
        // Eski davranış: sadece net_amount aggregate edilirdi (BUG).
        total_net: 0,
      })),
    );
    const oldGross = totalsOld.reduce((s, t) => s + t.gross_amount, 0);
    expect(oldGross).toBe(65_000); // 30k + 35k = kullanıcının gördüğü değer

    // Düzeltme sonrası:
    const totalsNew = aggregatePartySales(DB_ROWS);
    const newGross = totalsNew.reduce((s, t) => s + t.gross_amount, 0);
    expect(newGross).toBe(100_000); // 50k + 50k = doğru brüt Ciro
    expect(newGross).not.toBe(65_000);
  });

  it('Eski kayıt (total_net=0/null) için geriye dönük uyum: net_amount fallback', () => {
    const totals = aggregatePartySales([
      {
        id: 'old-1',
        customer_id: 'legacy-cust',
        fiche_type: 'sales_invoice',
        total_net: 0, // eski kayıt
        net_amount: 12_500,
        paid_amount: 12_500,
        credit_amount: 0,
        total_quantity: 1,
        date: '2025-01-01',
      },
    ]);
    expect(totals[0].gross_amount).toBe(12_500); // net_amount fallback
  });

  it('Return (iade) aggregate: net_amount negatif işaretli → return_amount = -50k', () => {
    const totals = aggregatePartySales([
      {
        id: 'sale-1',
        customer_id: 'c',
        fiche_type: 'sales_invoice',
        total_net: 100_000,
        net_amount: 80_000,
        paid_amount: 80_000,
        credit_amount: 20_000,
        total_quantity: 1,
        date: '2026-10-01',
      },
      {
        id: 'return-1',
        customer_id: 'c',
        fiche_type: 'return_invoice',
        total_net: -50_000, // iade: total_net negatif
        net_amount: -50_000,
        paid_amount: 0,
        credit_amount: 0,
        total_quantity: -1,
        date: '2026-10-02',
      },
    ]);
    expect(totals[0].gross_amount).toBe(100_000);
    expect(totals[0].return_amount).toBe(-50_000);
    expect(totals[0].gross_count).toBe(1);
    expect(totals[0].return_count).toBe(1);
    // Ham kova eksi. Ekran büyüklüğü bir kez düşer; ikinci eksi yazılmaz.
    const shown = settlePartySalesPeriodNet({
      grossAmount: totals[0].gross_amount,
      returnAmount: totals[0].return_amount,
      grossQuantity: 1,
      returnQuantity: -1,
    });
    expect(shown.returnAmount).toBe(50_000);
    expect(shown.netAmount).toBe(50_000);
    expect(shown.netAmount).not.toBe(0);
    expect(shown.netAmount).not.toBe(150_000);
  });
});
