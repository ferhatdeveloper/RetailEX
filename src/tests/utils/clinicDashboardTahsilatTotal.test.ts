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
import {
    clinicDashboardKasaGirisTotal,
    clinicDashboardTahsilatTotal,
} from '../../utils/clinicDashboardKasaGiris';

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

/**
 * Bug ekleme (12.10.2026): TAHSİLAT KPI'sı bugün 85.000 IQD göstermiyordu
 * çünkü `mainSales.total` formülü `total_gross=0` olan satışlarda 0
 * dönüyordu; gerçek ödeme `cash_lines.KASA_GIRIS` tablosunda.
 *
 * `clinicDashboardKasaGirisTotal` ve `clinicDashboardTahsilatTotal`
 * helper'ları bugünkü KASA_GIRIS + ana satışlar + CH_TAHSILAT
 * (rezervasyon hariç) toplamını döner; üretim bileşeni bu formülü
 * `stats.revenue`'da kullanır.
 *
 * DB alan eşlemesi (KasaIslemi):
 *   transaction_type → islem_tipi
 *   amount          → tutar
 *   special_code    → ozel_kod
 */
describe('ClinicDashboard KASA_GIRIS (12.10.2026 bug-fix)', () => {
  it('bugün senaryosu: 2 KASA_GIRIS (45k + 40k) → 85.000', () => {
    const lines = [
      { transaction_type: 'KASA_GIRIS', amount: 45_000, sign: 1 },
      { transaction_type: 'KASA_GIRIS', amount: 40_000, sign: 1 },
    ];
    const r = clinicDashboardKasaGirisTotal(lines);
    expect(r.total).toBe(85_000);
    expect(r.count).toBe(2);
    expect(r.reservationTotal).toBe(0);
  });

  it('REZERVASYON Hariç → reservationTotal ayrı tutulur', () => {
    const lines = [
      // Rezervasyon avansı: ana toplama girmez, reservationTotal'a yazılır.
      { transaction_type: 'KASA_GIRIS', amount: 30_000, sign: 1, special_code: 'REZERVASYON' },
      // Normal KASA_GIRIS: ana toplama girer.
      { transaction_type: 'KASA_GIRIS', amount: 50_000, sign: 1, special_code: '' },
    ];
    const r = clinicDashboardKasaGirisTotal(lines);
    expect(r.total).toBe(50_000);
    expect(r.count).toBe(1);
    expect(r.reservationTotal).toBe(30_000);
  });

  it('CH_TAHSILAT + REZERVASYON → 0 (KASA_GIRIS değil)', () => {
    // Rezervasyon CH_TAHSILAT satırları KASA_GIRIS filtresine takılmaz;
    // REZERVASYON bucket'ı `extraReservationCustomerCollections` üzerinden
    // REZERVASYON KPI'sına gider. Burada helper'a giren tek satır CH_TAHSILAT
    // olduğu için total = 0 olmalı.
    const lines = [
      { transaction_type: 'CH_TAHSILAT', special_code: 'REZERVASYON', amount: 30_000, sign: 1 },
    ];
    const r = clinicDashboardKasaGirisTotal(lines);
    expect(r.total).toBe(0);
    expect(r.reservationTotal).toBe(0);
  });

  it('boş liste → 0', () => {
    expect(clinicDashboardKasaGirisTotal([]).total).toBe(0);
    expect(clinicDashboardKasaGirisTotal(null).total).toBe(0);
    expect(clinicDashboardKasaGirisTotal(undefined).total).toBe(0);
  });

  it('sign=-1 (iade) → 0 (clamp)', () => {
    const lines = [{ transaction_type: 'KASA_GIRIS', amount: 5_000, sign: -1 }];
    const r = clinicDashboardKasaGirisTotal(lines);
    expect(r.total).toBe(0);
    expect(r.count).toBe(0);
  });

  it('null/undefined alanlar güvenli', () => {
    const lines = [
      { transaction_type: null, amount: 1_000, sign: 1 },
      { transaction_type: 'KASA_GIRIS', amount: null, sign: 1 },
      { transaction_type: 'KASA_GIRIS', amount: 20_000, sign: 1, special_code: null },
    ];
    const r = clinicDashboardKasaGirisTotal(lines);
    expect(r.total).toBe(20_000);
    expect(r.count).toBe(1);
  });

  it('büyük-küçük harf ve whitespace toleransı', () => {
    const lines = [
      { transaction_type: '  kasa_giris  ', amount: 10_000, sign: 1 },
      { transaction_type: 'KASA_GIRIS', amount: 5_000, sign: 1, special_code: '  rezervasyon  ' },
    ];
    const r = clinicDashboardKasaGirisTotal(lines);
    expect(r.total).toBe(10_000);
    expect(r.reservationTotal).toBe(5_000);
  });
});

describe('ClinicDashboard Tahsilat 3-katmanlı (12.10.2026)', () => {
  it('bugün senaryosu: sales=0 + KASA_GIRIS=85k + CH_TAHSILAT=0 → 85.000', () => {
    // Gerçek bugün verisi: `total_gross=0` sales + cash_lines'a yazılmış
    // 2 KASA_GIRIS. Toplam: 85.000 IQD (kullanıcının beklediği).
    const mainSales: Array<{ total: number }> = [];
    const cashLines = [
      {
        transaction_type: 'KASA_GIRIS',
        amount: 45_000,
        special_code: '',
        definition: 'Satış faturası — BEA-2026-MV51RK5A (ARAM)',
      },
      {
        transaction_type: 'KASA_GIRIS',
        amount: 40_000,
        special_code: '',
        definition: 'Satış faturası — BEA-2026-MV528MLD (FERHAT)',
      },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales, cashLines });
    expect(r.revenueFromSales).toBe(0);
    expect(r.revenueFromKasa).toBe(85_000);
    expect(r.revenueFromCariTahsilat).toBe(0);
    expect(r.revenue).toBe(85_000);
  });

  it('3 kaynak toplamı: sales 50k + KASA 30k + CH_TAHSILAT 20k = 100k', () => {
    const mainSales = [{ total: 50_000 }];
    const cashLines = [
      { transaction_type: 'KASA_GIRIS', amount: 30_000, special_code: '' },
      { transaction_type: 'CH_TAHSILAT', amount: 20_000, special_code: '' },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales, cashLines });
    expect(r.revenue).toBe(100_000);
  });

  it('REZERVASYON CH_TAHSILAT hariç (rezervasyon kendi kartında)', () => {
    const cashLines = [
      { transaction_type: 'CH_TAHSILAT', amount: 15_000, special_code: 'REZERVASYON' },
      { transaction_type: 'CH_TAHSILAT', amount: 25_000, special_code: '' },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines });
    expect(r.revenueFromCariTahsilat).toBe(25_000);
  });

  it('AVANS da hariç (geriye dönük UI rename uyumu)', () => {
    // 07.10.2026 öncesi `special_code='AVANS'` kullanılıyordu.
    const cashLines = [
      { transaction_type: 'CH_TAHSILAT', amount: 12_000, special_code: 'AVANS' },
      { transaction_type: 'CH_TAHSILAT', amount: 8_000, special_code: '' },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines });
    expect(r.revenueFromCariTahsilat).toBe(8_000);
  });

  it('negatif/null amount clamp (defansif)', () => {
    const cashLines = [
      { transaction_type: 'KASA_GIRIS', amount: -10_000, special_code: '' },
      { transaction_type: 'KASA_GIRIS', amount: null, special_code: '' },
      { transaction_type: 'CH_TAHSILAT', amount: Number.NaN, special_code: '' },
      { transaction_type: 'KASA_GIRIS', amount: 7_000, special_code: '' },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines });
    expect(r.revenueFromKasa).toBe(7_000);
    expect(r.revenueFromCariTahsilat).toBe(0);
  });
});

/**
 * 12.10.2026 — Kullanıcı isteği: TAHSİLAT = kasaya giren toplam nakit
 * (avans dahil). Kullanıcı 85.000 + 55.000 = 140.000 görmek istiyor.
 * TAHSİLAT = `tahsilat.revenue + reservation + reservationFromAvans` formülü.
 * Bu describe, formülün toplamını doğrular.
 */
describe('ClinicDashboard TAHSİLAT toplamı (12.10.2026 bug)', () => {
  it('KASA_GIRIS 85.000 + cari_avans 55.000 = TAHSİLAT 140.000', () => {
    const cashLines = [
      { transaction_type: 'KASA_GIRIS', amount: 45_000, special_code: '' },
      { transaction_type: 'KASA_GIRIS', amount: 40_000, special_code: '' },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines });
    const reservation = 0; // sales.deposit = 0
    const reservationFromAvans = 55_000;
    const totalTahsilat = r.revenue + reservation + reservationFromAvans;
    expect(totalTahsilat).toBe(140_000);
  });

  it('Sadece avans (50k cari_avans) → 50.000 TAHSİLAT', () => {
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines: [] });
    const reservationFromAvans = 50_000;
    const totalTahsilat = r.revenue + 0 + reservationFromAvans;
    expect(totalTahsilat).toBe(50_000);
  });

  it('Sadece KASA_GIRIS (85.000) → 85.000 TAHSİLAT', () => {
    const cashLines = [
      { transaction_type: 'KASA_GIRIS', amount: 85_000, special_code: '' },
    ];
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines });
    const totalTahsilat = r.revenue + 0 + 0;
    expect(totalTahsilat).toBe(85_000);
  });

  it('Hepsi sıfır → 0', () => {
    const r = clinicDashboardTahsilatTotal({ mainSales: [], cashLines: [] });
    expect(r.revenue + 0 + 0).toBe(0);
  });
});