/**
 * ClinicDashboard "Tahsilat" KPI'sı — bugünkü KASA_GIRIS toplamı.
 *
 * Kök neden — kullanıcı şikâyeti 12.10.2026:
 *   `rex_001_01_sales` içindeki satırlar `total_gross=0, paid_amount=0`
 *   (henüz fatura tamamlanmamış); gerçek ödeme ayrıca
 *   `rex_001_01_cash_lines` tablosuna `KASA_GIRIS` transaction_type ile
 *   yazılmış (örn. 45.000 + 40.000 = 85.000 IQD). Mevcut `revenue =
 *   mainSales.reduce(total)` formülü 0 + 0 = 0 gösteriyordu; TAHSİLAT
 *   kartının 85.000 göstermesi için bugünkü KASA_GIRIS toplamı KPI'ya
 *   eklenmeli.
 *
 * Bu fonksiyon `cash_lines` satırlarını alır, `transaction_type='KASA_GIRIS'`
 * olanları filtreler, rezervasyon (REZERVASYON/AVANS) satırlarını ayrı
 * tutar (REZERVASYON kartının konusu) ve geri kalanı toplar. Pure; React
 * render'ından bağımsız; vitest ile doğrulanır.
 *
 * DB alanları (kasa.ts → KasaIslemi):
 *   - `islem_tipi`        → spec transaction_type
 *   - `tutar`             → spec amount
 *   - `ozel_kod`          → spec special_code
 *
 * Spec'te adı geçen `sign` alanı KasaIslemi tipinde yok; biz clamp
 * için `Math.max(0, …)` kullanıyoruz (negatif iade KASA_GIRIS değil
 * KASA_CIKIS olur; burada yine de güvenlik).
 */
export type CashLineRef = {
    transaction_type?: string | null;
    special_code?: string | null;
    amount?: number | null;
    sign?: number | null;
};

export type ClinicDashboardKasaGirisOptions = {
    /**
     * Rezervasyon avans fişlerini (`special_code='REZERVASYON'`) ana
     * toplamdan hariç tut; ayrı raporlanır. Varsayılan `true` — REZERVASYON
     * kartı zaten bu avansları gösteriyor.
     */
    excludeReservation?: boolean;
};

export type ClinicDashboardKasaGirisResult = {
    /** Bugünkü KASA_GIRIS toplamı (rezervasyon hariç). */
    total: number;
    /** Toplama dahil edilen satır sayısı. */
    count: number;
    /** Rezervasyon (`special_code='REZERVASYON'`) satırlarının toplamı. */
    reservationTotal: number;
};

const RESERVATION_CODES: ReadonlySet<string> = new Set(['REZERVASYON', 'AVANS']);

/**
 * `cash_lines` listesinden bugünkü KASA_GIRIS toplamını hesaplar.
 *
 * - `transaction_type` boş / null / undefined olan satırlar atlanır
 * - `amount` negatifse 0 sayılır (clamp)
 * - `excludeReservation=true` (varsayılan) ise `special_code='REZERVASYON'`
 *   veya `'AVANS'` olan satırlar `reservationTotal`'a yazılır, ana toplama
 *   dahil edilmez
 * - `count` yalnızca ana toplama giren satırları sayar
 *
 * @example
 * const lines = [
 *   { transaction_type: 'KASA_GIRIS', amount: 45_000, special_code: '' },
 *   { transaction_type: 'KASA_GIRIS', amount: 40_000, special_code: '' },
 * ];
 * clinicDashboardKasaGirisTotal(lines)
 * // → { total: 85_000, count: 2, reservationTotal: 0 }
 */
export function clinicDashboardKasaGirisTotal(
    lines: CashLineRef[] | null | undefined,
    opts: ClinicDashboardKasaGirisOptions = {},
): ClinicDashboardKasaGirisResult {
    const pool = Array.isArray(lines) ? lines : [];
    const excludeReservation = opts.excludeReservation !== false;

    let total = 0;
    let count = 0;
    let reservationTotal = 0;

    for (const line of pool) {
        const tip = String(line.transaction_type ?? '').trim().toUpperCase();
        if (tip !== 'KASA_GIRIS') continue;

        const amt = Math.max(0, Number(line.amount ?? 0) || 0);
        if (amt <= 0) continue;

        // `sign` opsiyonel; KasaIslemi tipinde yok. Negatifse iade sayılır
        // (KASA_CIKIS olurdu normalde) → tamamen atlanır (count + total dahil değil).
        const sign = Number(line.sign ?? 1) || 1;
        if (sign < 0) continue;
        const value = amt;

        if (excludeReservation) {
            const sc = String(line.special_code ?? '').trim().toUpperCase();
            if (RESERVATION_CODES.has(sc)) {
                reservationTotal += value;
                continue;
            }
        }

        total += value;
        count += 1;
    }

    return { total, count, reservationTotal };
}

/**
 * Bug 22 (legacy guard): Klinik Paneli TAHSİLAT formülü.
 *
 * 3 katmanlı tahsilat:
 *   1) Ana satış fişlerinin hizmet tam tutarı (`Σ sale.total`,
 *      avans dahil — mevcut Bug 22 semantiği)
 *   2) Bugünkü KASA_GIRIS (satış faturası tahsilatı cash_lines'a
 *      yazıldığında)
 *   3) Bugünkü CH_TAHSILAT (cari tahsilatları; rezervasyon Hariç çünkü
 *      rezervasyon kendi KPI kartında)
 *
 * @param mainSales           İptal/peşinat filtrelenmiş ana satışlar
 * @param cashLines           Bugünkü `cash_lines` (fetchKasaIslemleri)
 * @param cancelledReceipts   İptal edilen fiş no'ları (CH_TAHSILAT hariç)
 * @param dateFilterable      cashLines.filter(line => ...) — bu fonksiyon
 *                            doğrudan filtreleme yapmaz; caller pre-filter
 *                            edip geçer (iptal edilen fişlerin CH_TAHSILAT
 *                            satırları Hariç tutulur).
 */
export type ClinicDashboardTahsilatSaleRef = {
    total?: number | null;
};

export type ClinicDashboardTahsilatCashLineRef = {
    transaction_type?: string | null;
    special_code?: string | null;
    amount?: number | null;
    sign?: number | null;
};

export function clinicDashboardTahsilatTotal(args: {
    mainSales: ClinicDashboardTahsilatSaleRef[];
    cashLines: ClinicDashboardTahsilatCashLineRef[];
}): {
    revenueFromSales: number;
    revenueFromKasa: number;
    revenueFromCariTahsilat: number;
    revenue: number;
} {
    const mainSales = Array.isArray(args.mainSales) ? args.mainSales : [];
    const cashLines = Array.isArray(args.cashLines) ? args.cashLines : [];

    const revenueFromSales = mainSales.reduce(
        (s, sale) => s + Math.max(0, Number(sale.total ?? 0) || 0),
        0,
    );

    const kasa = clinicDashboardKasaGirisTotal(cashLines);
    const revenueFromKasa = kasa.total;

    let revenueFromCariTahsilat = 0;
    for (const line of cashLines) {
        const tip = String(line.transaction_type ?? '').trim().toUpperCase();
        if (tip !== 'CH_TAHSILAT') continue;
        const sc = String(line.special_code ?? '').trim().toUpperCase();
        if (RESERVATION_CODES.has(sc)) continue; // REZERVASYON kendi KPI'sında
        const amt = Math.max(0, Number(line.amount ?? 0) || 0);
        const sign = Number(line.sign ?? 1) || 1;
        if (sign < 0) continue; // iade
        revenueFromCariTahsilat += amt * sign;
    }

    const revenue = revenueFromSales + revenueFromKasa + revenueFromCariTahsilat;

    return {
        revenueFromSales,
        revenueFromKasa,
        revenueFromCariTahsilat,
        revenue,
    };
}