/**
 * Aylık Özet ↔ Kasa Durumu mutabakat regression testi.
 *
 * Kullanıcı şikâyeti:
 *   "aylık ozetı dogru degıl kasa durum raporu ıle aynı degıl"
 *
 * Senaryo: 1 aylık veri
 *   - 10 × 50.000 IQD nakit satış → Ciro = 500.000
 *   - 2 × 15.000 IQD rezervasyon avansı (cash_lines CH_TAHSILAT + REZERVASYON)
 *     → Avans = 30.000 (Ciro Hariç — Kasa Durumu ile aynı semantik)
 *   - 3 × 10.000 IQD nakit gider → Gider = 30.000
 *   - Kart / Havale = 0
 *
 * Beklenen (iki rapor için AYNI):
 *   Ciro (Aylık Özet revenue)        = 500.000
 *   Ciro (Kasa Durumu todayTotal)    = 500.000   ← Senaryo A: rezervasyon hariç
 *   Avans (Rezervasyon ayrı kalem)  = 30.000
 *   Gider                            = 30.000
 *   Net Kalan (Aylık Özet netRemaining) = 470.000  ← Ciro − Gider − Alış
 *   Kasa (kapıya giren nakit)        = 470.000   ← açılış 0 + nakit tahsilat 500 − gider 30
 *
 * Mevcut düzeltmeler korunur:
 *   b212c576 (hasPeriodActivity), c18aa372 (Günlük Rapor avans),
 *   94d8a7f5 (Kasa Durumu TOPLAM rezervasyon Hariç), 4e687eb2 (Klinik TAHŞİLAT).
 */
import { describe, expect, it } from 'vitest';
import {
  computeMonthlyCashSummary,
  computePeriodSummaryBucket,
  computeRangeKapanis,
  MOCK_SYNC_SCENARIO,
  type MonthlyCashSummaryInput,
} from '../../utils/monthlyCashStatusSync';
import type { Expense } from '../../services/api/expenses';
import type { Invoice } from '../../core/types/models';
import type { KasaIslemi } from '../../services/api/kasa';
import type { Sale } from '../../core/types';

const ts = (n: number): string =>
  `${n.toString().padStart(2, '0')}`;
const day = (yyyyMmDd: string, h: number, m: number): string =>
  `${yyyyMmDd}T${ts(h)}:${ts(m)}:00`;

function makeSale(args: {
  id: string;
  receipt: string;
  total: number;
  method: 'cash' | 'card' | 'transfer' | 'credit';
  date?: string;
  isDeposit?: boolean;
}): Sale {
  const date = args.date ?? '2026-10-01T10:00:00';
  const base: Partial<Sale> = {
    id: args.id,
    receiptNumber: args.receipt,
    total: args.total,
    paymentMethod: args.method,
    date: date as unknown as Date,
    status: 'completed',
    isDeposit: args.isDeposit ?? false,
    payments: [
      {
        method: args.method,
        amount: args.total,
        currency: 'IQD',
      },
    ],
  };
  return base as Sale;
}

function buildScenario(): MonthlyCashSummaryInput {
  // 10 × 50.000 nakit satış
  const sales: Sale[] = [];
  for (let i = 0; i < MOCK_SYNC_SCENARIO.saleCount; i++) {
    const d = String(i + 1).padStart(2, '0');
    sales.push(
      makeSale({
        id: `sale-${i}`,
        receipt: `BEA-2026-MOCK-${d}`,
        total: MOCK_SYNC_SCENARIO.saleAmountEach,
        method: 'cash',
        date: day(`2026-10-${d}`, 10, 0),
      }),
    );
  }

  // 2 × 15.000 rezervasyon avansı (cash_lines CH_TAHSILAT + REZERVASYON)
  const cashLines: KasaIslemi[] = [];
  for (let i = 0; i < MOCK_SYNC_SCENARIO.reservationDepositCount; i++) {
    const d = String(5 + i).padStart(2, '0');
    cashLines.push({
      id: `kasa-res-${i}`,
      islem_no: `KL-2026-MOCK-${d}`,
      islem_tipi: 'CH_TAHSILAT',
      ozel_kod: 'REZERVASYON',
      tutar: MOCK_SYNC_SCENARIO.reservationDepositAmountEach,
      islem_tarihi: day(`2026-10-${d}`, 9, 0),
    } as KasaIslemi);
  }

  // 3 × 10.000 nakit gider (Expense kartı)
  const expenses: Expense[] = [];
  for (let i = 0; i < MOCK_SYNC_SCENARIO.expenseCount; i++) {
    const d = String(15 + i).padStart(2, '0');
    expenses.push({
      id: `exp-${i}`,
      amount: MOCK_SYNC_SCENARIO.expenseAmountEach,
      expense_date: `2026-10-${d}`,
      payment_method: 'cash',
      category: 'İşletme Gideri',
      description: `Mock gider #${i + 1}`,
      document_number: `GDR-${d}`,
      store_id: '',
      notes: '',
      created_by: '',
      firm_nr: '001',
      cash_line_id: null,
      cost_center_name: '',
    } as Expense);
  }

  return {
    sales,
    rezervasyonAvansi:
      MOCK_SYNC_SCENARIO.reservationDepositCount *
      MOCK_SYNC_SCENARIO.reservationDepositAmountEach,
    expenses,
    cashLines,
    purchases: [] as Invoice[],
    acilis: 0,
  };
}

describe('Aylık Özet ↔ Kasa Durumu senkronizasyonu', () => {
  const input = buildScenario();

  it('Ciro (Aylık Özet revenue) = 500.000', () => {
    const m = computeMonthlyCashSummary(input);
    expect(m.ciro).toBe(MOCK_SYNC_SCENARIO.expectedRevenue);
  });

  it('Rezervasyon avansı Ciro\'ya katılmaz (Kasa Durumu senaryosu A)', () => {
    const m = computeMonthlyCashSummary(input);
    expect(m.rezervasyonAvansi).toBe(MOCK_SYNC_SCENARIO.expectedReservationDeposit);
    expect(m.kasaDurumuToplam).toBe(MOCK_SYNC_SCENARIO.expectedRevenue);
    expect(m.kasaDurumuToplam + m.rezervasyonAvansi).toBe(
      MOCK_SYNC_SCENARIO.expectedRevenue + MOCK_SYNC_SCENARIO.expectedReservationDeposit,
    );
  });

  it('Gider = 30.000', () => {
    const m = computeMonthlyCashSummary(input);
    expect(m.gider).toBe(MOCK_SYNC_SCENARIO.expectedExpenses);
  });

  it('Net Kalan (Aylık Özet) = Ciro − Gider − Alış = 470.000', () => {
    const m = computeMonthlyCashSummary(input);
    expect(m.netKalan).toBe(MOCK_SYNC_SCENARIO.expectedKapanisFromCash);
  });

  it('Kapanış Nakit (Kasa Durumu) = açılış + nakit tahsilat − nakit gider = 470.000', () => {
    const kapanis = computeRangeKapanis(input);
    expect(kapanis.todayCash).toBe(MOCK_SYNC_SCENARIO.expectedRevenue);
    expect(kapanis.expenses).toBe(MOCK_SYNC_SCENARIO.expectedExpenses);
    expect(kapanis.closingCash).toBe(MOCK_SYNC_SCENARIO.expectedKapanisFromCash);
  });

  it('Aylık Özet Ciro === Kasa Durumu Ciro (Rezervasyon Hariç)', () => {
    const period = computePeriodSummaryBucket(input);
    const kapanis = computeRangeKapanis(input);
    expect(period.ciro).toBe(kapanis.ciro);
    expect(period.ciro).toBe(kapanis.todayTotal);
  });

  it('Aylık Özet Net Kalan + Alış + Gider = Ciro', () => {
    const p = computePeriodSummaryBucket(input);
    expect(p.ciro - p.gider - p.alis).toBe(p.netKalan);
  });

  it('Nakit + Kart + Havale = Ciro (veresiye Hariç sanal nakit satış)', () => {
    const m = computeMonthlyCashSummary(input);
    expect(m.nakitCiro + m.kartCiro + m.havaleCiro + m.veresiye).toBe(m.ciro);
  });

  it('Kart / havale yoksa Ciro = Nakit Ciro', () => {
    const m = computeMonthlyCashSummary(input);
    expect(m.nakitCiro).toBe(MOCK_SYNC_SCENARIO.expectedRevenue);
    expect(m.kartCiro).toBe(0);
    expect(m.havaleCiro).toBe(0);
  });

  it('İadeler Ciro\'ya yansımaz (negatif şişirmesin)', () => {
    // Ciro'yu 500.000 + iade 100.000 = 600.000 yapsın diye negatif eklememeli.
    const salesWithReturn: Sale[] = [
      ...(input.sales as Sale[]),
      makeSale({
        id: 'return-sale-1',
        receipt: 'BEA-2026-RETURN-1',
        total: -100_000,
        method: 'cash',
        date: '2026-10-20T11:00:00',
      }),
    ];
    const m2 = computeMonthlyCashSummary({
      ...input,
      sales: salesWithReturn,
    });
    // Ciro = 500.000 (iade yansımaz) — bug 29 follow-up
    expect(m2.ciro).toBe(MOCK_SYNC_SCENARIO.expectedRevenue);
  });

  it('Açılış kasası 50.000 olursa Kapanış = 520.000 (50 + 500 − 30)', () => {
    const m = computeRangeKapanis({ ...input, acilis: 50_000 });
    expect(m.opening).toBe(50_000);
    expect(m.closingCash).toBe(520_000); // 50 + 500 - 30
    // Ciro (todayTotal) hâlâ 500.000 — açılış Ciro'ya katılmaz
    expect(m.todayTotal).toBe(500_000);
  });

  it('Alış faturası eklendiğinde Net Kalan = Ciro − Gider − Alış', () => {
    const purchases: Invoice[] = [
      {
        id: 'inv-1',
        invoice_date: '2026-10-10',
        status: 'completed',
        is_cancelled: false,
        total_amount: 25_000,
        total: 25_000,
        receiptNumber: 'AL-2026-1',
      } as unknown as Invoice,
    ];
    const m = computeMonthlyCashSummary({ ...input, purchases });
    expect(m.alis).toBe(25_000);
    expect(m.netKalan).toBe(500_000 - 30_000 - 25_000);
  });
});

describe('Geri-çevrim korumaları — mevcut commit düzeltmeleri', () => {
  const input = buildScenario();

  it('b212c576 — Ciro 0 olsa bile avans > 0 ise satır aktif (hasPeriodActivity semantiği)', () => {
    // Ciro=0 ama avans > 0 → bug 28/30 düzeltmesi: satırda finansal değer var.
    const m = computeMonthlyCashSummary({
      ...input,
      sales: [],
      // Sadece rezervasyon avansı
      rezervasyonAvansi: 30_000,
    });
    expect(m.ciro).toBe(0);
    expect(m.rezervasyonAvansi).toBe(30_000);
    expect(m.kasaDurumuToplam).toBe(0); // Ciro (Rezervasyon Hariç) = 0
  });

  it('c18aa372 — Günlük Rapor avans dahil (nakitCiro + avans ayrı)', () => {
    // Nakit tahsilat Ciro içinde; avans Ciro Hariç ayrı gösterilir.
    const m = computeMonthlyCashSummary(input);
    expect(m.nakitCiro + m.rezervasyonAvansi).toBe(530_000);
  });

  it('94d8a7f5 — Kasa Durumu TOPLAM Rezervasyon Hariç', () => {
    const m = computeMonthlyCashSummary(input);
    // totalAmount mantığı Ciro içine almaz; Rezervasyon ayrı bucket
    expect(m.kasaDurumuToplam + m.rezervasyonAvansi).toBe(530_000);
    expect(m.kasaDurumuToplam).toBe(500_000);
  });

  it('4e687eb2 — Klinik TAHŞİLAT: Ciro ile çift sayılmaz, ayrı kasa girişi', () => {
    // cash_lines içinde CH_TAHSILAT Rezervasyon işaretli olan Ciro Hariç.
    // Ciro'ya yansımaz; rezervasyonAvansi bucket'ında sayılır.
    const m = computeMonthlyCashSummary(input);
    const cashInsForReport = input.cashLines.filter(
      (cl: KasaIslemi) =>
        String(cl.islem_tipi || '').toUpperCase() === 'CH_TAHSILAT',
    );
    const total = cashInsForReport.reduce(
      (s, cl) => s + Math.abs(Number(cl.tutar) || 0),
      0,
    );
    expect(total).toBe(30_000);
    expect(m.rezervasyonAvansi).toBe(30_000);
  });
});
