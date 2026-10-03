/**
 * Clinic Dashboard KPI istatistikleri (Bug 21).
 *
 * Bu helper, `ClinicDashboard.tsx` içindeki `stats` useMemo'sundan bağımsız
 * olarak çağrılabilen **pure** fonksiyonlar içerir. React bileşenini
 * render etmeden BEKLENEN CİRO / TAMAMLANAN / BEKLEYEN gibi KPI
 * hesaplamalarını doğrulamak için vitest ile test edilir.
 *
 * Neden pure fonksiyon?
 *  - React render maliyeti yok; doğrudan veri üzerinde çalışır.
 *  - Durum geçişleri (SCHEDULED → CONFIRMED → PRE_PAID → COMPLETED)
 *    deterministik; tekrar eden hesaplamada aynı sonucu üretir.
 *  - `ClinicDashboard` `useMemo`'su bu saf fonksiyonları çağırır.
 */
import { AppointmentStatus } from '../types/beauty';
import type { BeautyAppointment } from '../types/beauty';
import { beautyAptVisibleOnSchedule } from './beautyAppointmentVisibility';

/**
 * Bug 21: BEKLENEN CİRO'ya dahil edilecek durumlar.
 *
 *  - SCHEDULED   → "Planlandı"
 *  - CONFIRMED   → "Onayla"
 *  - PRE_PAID    → "Ön Ödeme Alındı" (peşinat alınmış, hizmet verilmemiş)
 *  - IN_PROGRESS → "Devam Ediyor"
 *
 * Tamamlananlar Hariç (TAMAMLANAN KPI'da sayılır),
 * İptal/No-show Hariç (CANCELLED/NO_SHOW → bugünkü "kalan" listesinde
 * yer almaz).
 */
export const EXPECTED_REVENUE_STATUSES: ReadonlyArray<AppointmentStatus> = [
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.PRE_PAID,
    AppointmentStatus.IN_PROGRESS,
] as const;

export interface ClinicExpectedRevenue {
    /** Bugünkü randevulardan, henüz gerçekleşmemiş / iptal edilmemiş olanların tutar toplamı */
    amount: number;
    /** Beklenen ciroya dahil edilen randevu sayısı (KPI alt yazısı) */
    count: number;
}

/**
 * Bug 21: ClinicDashboard "BEKLENEN CİRO" KPI hesabı.
 *
 * `todayAppointments` listesinden `EXPECTED_REVENUE_STATUSES` durumlarını
 * filtreleyip `total_price` toplamını döner. Tamamlanan ve iptal edilen
 * randevular Hariç tutulur.
 *
 * **Bağımlılık:** `beauty_sales` sorgusuna **değil**, doğrudan `appointments`
 * listesine bakar. Bug 19 sonrası peşinatlı modda cari satış fişi
 * oluşmadığı için `beauty_sales` boş dönebiliyor; bu yüzden BEKLENEN
 * CİRO `appointments` tablosundan bağımsız hesaplanmalı.
 *
 * @param todayAppointments  Bugünün tüm randevuları (iptal/no_show hariç
 *                           `beautyAptVisibleOnSchedule` filtresi uygulanmış
 *                           hâlde gelmeli).
 */
export function computeClinicExpectedRevenue(
    todayAppointments: BeautyAppointment[],
): ClinicExpectedRevenue {
    const pool = Array.isArray(todayAppointments) ? todayAppointments : [];
    let amount = 0;
    let count = 0;
    for (const a of pool) {
        const st = a?.status;
        if (
            st !== AppointmentStatus.SCHEDULED &&
            st !== AppointmentStatus.CONFIRMED &&
            st !== AppointmentStatus.PRE_PAID &&
            st !== AppointmentStatus.IN_PROGRESS
        ) {
            continue;
        }
        const price = Number(a?.total_price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        amount += price;
        count += 1;
    }
    return { amount, count };
}

/**
 * Bug 21 (yardımcı): ClinicDashboard `stats` useMemo'su içindeki filtreleri
 * tek noktada toplar. Test kapsamı dışındaki ekran kodundan çağrılır.
 */
export interface ClinicDayKpiInputs {
    /** `useBeautyStore` üzerinden gelen tüm randevular */
    appointments: BeautyAppointment[];
    /** `formatLocalYmd(new Date())` çıktısı (örn. "2026-10-03") */
    todayStr: string;
    /** `beautyAppointmentDateKey(apt)` yardımcısı */
    dateKeyOf: (a: BeautyAppointment) => string;
}

export interface ClinicDayKpis {
    todayApts: BeautyAppointment[];
    completed: number;
    pending: number;
    inProg: number;
    cancelled: number;
    expectedRevenue: number;
    remaining: number;
    total: number;
    rate: number;
}

/**
 * Bug 21: ClinicDashboard KPI şeridinin (TAHSİLAT hariç) hesaplarını
 * döner. React bileşeninden çağrılabileceği gibi vitest ile saf olarak
 * da test edilebilir.
 */
export function computeClinicDayKpis(input: ClinicDayKpiInputs): ClinicDayKpis {
    const { appointments, todayStr, dateKeyOf } = input;
    const safe = Array.isArray(appointments) ? appointments : [];
    const todayAll = safe.filter((a) => dateKeyOf(a) === todayStr);
    const todayApts = todayAll.filter(beautyAptVisibleOnSchedule);
    const completed = todayApts.filter(
        (a) => a.status === AppointmentStatus.COMPLETED,
    );
    const pending = todayApts.filter(
        (a) =>
            a.status === AppointmentStatus.SCHEDULED ||
            a.status === AppointmentStatus.CONFIRMED,
    );
    const inProg = todayApts.filter(
        (a) => a.status === AppointmentStatus.IN_PROGRESS,
    );
    const cancelled = todayAll.filter(
        (a) => a.status === AppointmentStatus.CANCELLED,
    );
    const expected = computeClinicExpectedRevenue(todayApts);
    const rate = todayApts.length
        ? Math.round((completed.length / todayApts.length) * 100)
        : 0;
    return {
        todayApts,
        completed: completed.length,
        pending: pending.length,
        inProg: inProg.length,
        cancelled: cancelled.length,
        expectedRevenue: expected.amount,
        remaining: expected.count,
        total: todayApts.length,
        rate,
    };
}
