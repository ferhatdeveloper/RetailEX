/**
 * Bug 22: Klinik Paneli "Tahsilat" KPI'sı = hizmet tam tutarı (avans dahil).
 *
 * Kullanıcı şikâyeti (09.10.2026):
 *   "BURADA EGER RANDEVU KAPANMIS ISE REZERVASYON VE KALAN HIZMET TUTARI
 *    YANSIYACAK YANI HIZMETIN TUTARI"
 *
 * Senaryo:
 *   - ROZA: hizmet 50.000, avans (REZERVASYON) 15.000, kalan nakit 35.000
 *   - ARA:  hizmet 50.000, peşin nakit 50.000
 *
 * Önceki formül: `beautySalePocketCollected` → yalnızca `cash + card + transfer`
 *   toplamı. ROZA'nın avansı düşmüştü, sonuç 35.000 (kalan) + 50.000 (peşin)
 *   = **85.000** (yanlış).
 *
 * Yeni formül: `Σ sale.total` → hizmet tam tutarı (avans dahil).
 *   ROZA 50.000 + ARA 50.000 = **100.000** (doğru).
 *
 * Bu test, `ClinicDashboard.tsx` `stats` useMemo'sunun yeni semantiğini
 * pure helper seviyesinde doğrular. Production bileşeni render etmeden
 * veri üzerinden aynı hesabı yapan yardımcı fonksiyon.
 */
import { describe, expect, it } from 'vitest';

export type ClinicDashboardSaleRef = {
  id?: string;
  total?: number;
  is_deposit?: boolean | null;
  parent_sale_id?: string | null;
  payment_status?: string | null;
  notes?: string | null;
  // parseDepositFlagFromNotes / parseParentSaleIdFromNotes için yedek tag'ler
};

/**
 * ClinicDashboard `stats.revenue` hesabı (Bug 22).
 *
 *   revenue = Σ mainSales.total
 *
 * Burada `mainSales` `ClinicDashboard`'un kullandığı filtreyle
 * (iptal/peşinat hariç) gelir; `total` hizmet tam tutarıdır (avans
 * dahil) — kullanıcının istediği semantik.
 *
 * Aşağıdaki filtre, ClinicDashboard.tsx içindeki `mainSales =` bloğu
 * ile birebir aynıdır.
 */
function isMainBeautySale(sale: ClinicDashboardSaleRef): boolean {
  if (sale.is_deposit === true || sale.parent_sale_id != null) return false;
  const notes = String(sale.notes ?? '');
  if (notes) {
    // "deposit:1" / "parent_sale:<uuid>" tag'leri için parse
    if (/deposit\s*[:=]\s*1\b/i.test(notes)) return false;
    if (/parent_sale\s*[:=]\s*[a-z0-9-]+/i.test(notes)) return false;
  }
  const ps = String(sale.payment_status ?? '').trim().toLowerCase();
  if (ps === 'cancelled' || ps === 'canceled' || ps === 'refunded' ||
      ps === 'void' || ps === 'iptal' || ps === 'silindi' || ps === 'deleted') {
    return false;
  }
  if (ps === 'pending' || ps === 'partial' || ps === 'awaiting_service') {
    return false;
  }
  return true;
}

export function clinicDashboardTahsilatRevenue(
  sales: ClinicDashboardSaleRef[],
): number {
  return sales
    .filter(isMainBeautySale)
    .reduce((sum, s) => sum + Math.max(0, Number(s.total) || 0), 0);
}

/**
 * ClinicDashboard `stats.reservation` hesabı.
 *
 *   reservation = Σ depositSales.total
 *
 * Ana satıştan ayrı tutulan peşinat / avans fişlerinin toplamı. Kullanıcı
 * şikâyeti 12.10.2026: "rezervasyon tutarını buraya eklemeli" → TAHSİLAT
 * kartının yanına REZERVASYON kartı. Tahsilat KPI'sı `Σ sale.total`
 * (avans dahil hizmet tam tutarı) olduğu için aynı parayı iki kez
 * saymamak amacıyla bu kartta yalnız deposit fişleri sayılır.
 *
 * `deposit:1` / `parent_sale:<uuid>` notes tag'leri için regex kullanılır
 * (mainSales filtresinin simetriği — Bug ARAM-collected-2x).
 */
function isDepositBeautySale(sale: ClinicDashboardSaleRef): boolean {
  if (sale.is_deposit === true || sale.parent_sale_id != null) return true;
  const notes = String(sale.notes ?? '');
  if (notes) {
    if (/deposit\s*[:=]\s*1\b/i.test(notes)) return true;
    if (/parent_sale\s*[:=]\s*[a-z0-9-]+/i.test(notes)) return true;
  }
  return false;
}

export function clinicDashboardReservationTotal(
  sales: ClinicDashboardSaleRef[],
): number {
  return sales
    .filter(isDepositBeautySale)
    .reduce((sum, s) => sum + Math.max(0, Number(s.total) || 0), 0);
}

describe('ClinicDashboard Tahsilat KPI (Bug 22)', () => {
  it('ROZA senaryosu: 50k hizmet + 15k avans + 35k kalan → KPI = 50.000 (hizmet tam tutarı)', () => {
    const sales: ClinicDashboardSaleRef[] = [
      {
        id: 'roza',
        // ROZA: toplam hizmet 50k; avans 15k + kalan 35k = 50k.
        // Önceki formül 35k (sadece nakit tahsilat) gösteriyordu.
        total: 50_000,
        payment_method: 'veresiye',
        paid_amount: 15_000,
        remaining_amount: 35_000,
        payment_status: 'paid',
      },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(50_000);
  });

  it('ARA senaryosu: 50k peşin nakit → KPI = 50.000', () => {
    const sales: ClinicDashboardSaleRef[] = [
      {
        id: 'ara',
        total: 50_000,
        payment_method: 'cash',
        payments: [{ method: 'cash', amount: 50_000 }],
        payment_status: 'paid',
      },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(50_000);
  });

  it('ROZA + ARA: kullanıcı şikâyeti → KPI = 100.000 (önceki 85.000 idi)', () => {
    const sales: ClinicDashboardSaleRef[] = [
      {
        id: 'roza',
        total: 50_000,
        payment_method: 'veresiye',
        paid_amount: 15_000,
        remaining_amount: 35_000,
        payment_status: 'paid',
      },
      {
        id: 'ara',
        total: 50_000,
        payment_method: 'cash',
        payments: [{ method: 'cash', amount: 50_000 }],
        payment_status: 'paid',
      },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(100_000);
  });

  it('iptal edilen satış KPI\'ya girmez (regresyon)', () => {
    const sales: ClinicDashboardSaleRef[] = [
      {
        id: 'cancelled-iptal',
        total: 80_000,
        payment_status: 'cancelled',
      },
      {
        id: 'iptal-etıket',
        total: 25_000,
        payment_status: 'iptal',
      },
      {
        id: 'void',
        total: 10_000,
        payment_status: 'void',
      },
      {
        id: 'normal',
        total: 50_000,
        payment_status: 'paid',
      },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(50_000);
  });

  it('peşinat fişleri (deposit / parent_sale) KPI\'ya girmez — çift sayım yok', () => {
    const sales: ClinicDashboardSaleRef[] = [
      // Ana satış fişi
      {
        id: 'ana',
        total: 50_000,
        payment_status: 'paid',
      },
      // Peşinat fişi (BEAUTY-DEPOSIT-...) — ayrıca sayılmamalı
      {
        id: 'deposit',
        total: 15_000,
        is_deposit: true,
        parent_sale_id: 'ana',
        payment_status: 'paid',
      },
      // Migration 192 öncesi peşinat (notes tag)
      {
        id: 'deposit-notes',
        total: 15_000,
        notes: 'deposit:1 parent_sale:ana',
        payment_status: 'paid',
      },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(50_000);
  });

  it('peşinatlı mod (payment_status=pending, kalan 0) → 0 (hizmet verilmemiş)', () => {
    const sales: ClinicDashboardSaleRef[] = [
      {
        id: 'pesinatli-beklemede',
        total: 50_000,
        payment_method: 'veresiye',
        paid_amount: 0,
        remaining_amount: 0,
        payment_status: 'pending',
      },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(0);
  });

  it('negatif / null / undefined total 0 sayılır', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'x', total: -10_000, payment_status: 'paid' },
      { id: 'y', total: Number.NaN, payment_status: 'paid' },
      { id: 'z', total: 30_000, payment_status: 'paid' },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(30_000);
  });

  it('boş satış listesi → KPI = 0', () => {
    expect(clinicDashboardTahsilatRevenue([])).toBe(0);
  });

  it('karışık gün: ROZA + ARA + iptal + peşinat → KPI = 100.000', () => {
    const sales: ClinicDashboardSaleRef[] = [
      // ROZA
      { id: 'roza', total: 50_000, payment_status: 'paid' },
      // ARA
      { id: 'ara', total: 50_000, payment_status: 'paid' },
      // İptal — Hariç
      { id: 'iptal', total: 30_000, payment_status: 'cancelled' },
      // Peşinat fişi — Hariç
      { id: 'deposit', total: 15_000, is_deposit: true, parent_sale_id: 'roza' },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(100_000);
  });
});

describe('ClinicDashboard Rezervasyon KPI', () => {
  it('deposit fişi → reservation toplamı', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'deposit', total: 15_000, is_deposit: true, parent_sale_id: 'ana' },
      { id: 'ana', total: 50_000, payment_status: 'paid' },
    ];
    expect(clinicDashboardReservationTotal(sales)).toBe(15_000);
  });

  it('notes tag deposit:1 → reservation', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'd1', total: 20_000, notes: 'deposit:1 parent_sale:ana' },
    ];
    expect(clinicDashboardReservationTotal(sales)).toBe(20_000);
  });

  it('boş → 0', () => {
    expect(clinicDashboardReservationTotal([])).toBe(0);
  });

  it('karışık → sadece deposit', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'ana', total: 50_000, payment_status: 'paid' },
      { id: 'd1', total: 15_000, is_deposit: true, parent_sale_id: 'ana' },
    ];
    expect(clinicDashboardReservationTotal(sales)).toBe(15_000);
  });

  it('ROZA senaryosu: 50k hizmet + 15k avans fişi → reservation = 15.000', () => {
    // Aynı gün: ana satış fişi (50k) + peşinat fişi (15k).
    // TAHSİLAT KPI 50k (avans dahil), REZERVASYON KPI 15k.
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'roza-ana', total: 50_000, payment_status: 'paid' },
      { id: 'roza-avans', total: 15_000, is_deposit: true, parent_sale_id: 'roza-ana' },
    ];
    expect(clinicDashboardTahsilatRevenue(sales)).toBe(50_000);
    expect(clinicDashboardReservationTotal(sales)).toBe(15_000);
  });

  it('negatif / null / undefined total 0 sayılır (deposit)', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'd-neg', total: -10_000, is_deposit: true },
      { id: 'd-nan', total: Number.NaN, is_deposit: true },
      { id: 'd-ok', total: 30_000, is_deposit: true, parent_sale_id: 'ana' },
    ];
    expect(clinicDashboardReservationTotal(sales)).toBe(30_000);
  });
});

/**
 * Bug ekleme (12.10.2026): REZERVASYON KPI'sı sıfır gösteriyordu çünkü
 * helper yalnızca `beauty_sales` deposit fişlerinden hesaplanıyordu; POS'tan
 * alınan rezervasyon avansları `rex_<firm>_<period>_cari_avans` tablosuna
 * (migration 194) yazılır.
 *
 * `ClinicDashboard.tsx` `stats.reservation` artık iki kaynağı toplar:
 *
 *     reservation = clinicDashboardReservationTotal(sales)   // deposit fişleri
 *                 + Math.max(0, Number(avans?.amount) || 0)   // cari_avans today
 *
 * Bu helper aynı formülü pure function seviyesinde doğrular. Üretim
 * bileşenini render etmeden veri üzerinden hesap yapılır; KPI 50.000
 * avans + 5.000 sales deposit = 55.000 gibi regresyonlar burada yakalanır.
 */
export function clinicDashboardReservationWithAvans(
  sales: ClinicDashboardSaleRef[],
  avans: { amount: number; count: number } | null | undefined,
): number {
  const depositTotal = clinicDashboardReservationTotal(sales);
  const avansAmount = Math.max(0, Number(avans?.amount ?? 0) || 0);
  return depositTotal + avansAmount;
}

describe('ClinicDashboard Rezervasyon KPI (cari_avans dahil)', () => {
  it('cari_avans + sales deposit toplamı', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'd1', total: 5_000, is_deposit: true, parent_sale_id: 'ana' },
    ];
    const avans = { amount: 30_000, count: 1 };
    expect(clinicDashboardReservationWithAvans(sales, avans)).toBe(35_000);
  });

  it('avans 0, sales 0 → 0', () => {
    expect(clinicDashboardReservationWithAvans([], { amount: 0, count: 0 })).toBe(0);
  });

  it('avans 50k, sales 0 → 50k (kullanıcı şikâyeti senaryosu)', () => {
    // Bugün 4 rezervasyon avansı, toplam 50.000 IQD;
    // `beauty_sales` içinde henüz deposit fişi yok.
    expect(clinicDashboardReservationWithAvans([], { amount: 50_000, count: 4 })).toBe(50_000);
  });

  it('cari_avans + ROZA avans senaryosu: deposit 15k + avans 50k → 65k', () => {
    // Kullanıcı şikâyeti: aynı gün 4 rezervasyon avansı 50.000 +
    // eski ROZA deposit fişi 15.000 → toplam 65.000 IQD.
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'roza-deposit', total: 15_000, is_deposit: true, parent_sale_id: 'roza-ana' },
    ];
    const avans = { amount: 50_000, count: 4 };
    expect(clinicDashboardReservationWithAvans(sales, avans)).toBe(65_000);
  });

  it('avans null/undefined → deposit toplamı (defansif)', () => {
    const sales: ClinicDashboardSaleRef[] = [
      { id: 'd1', total: 12_000, is_deposit: true },
    ];
    expect(clinicDashboardReservationWithAvans(sales, null)).toBe(12_000);
    expect(clinicDashboardReservationWithAvans(sales, undefined)).toBe(12_000);
  });

  it('avans negatif → 0 (clamp)', () => {
    expect(
      clinicDashboardReservationWithAvans([], { amount: -1_000, count: 1 })
    ).toBe(0);
  });
});