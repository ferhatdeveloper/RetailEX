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
import { isAppointmentDepositCartLine } from './appointmentFormReservation';
import { beautyAptVisibleOnSchedule } from './beautyAppointmentVisibility';
import { groupBeautyBoardAppointmentLines, mergeQueueGroupForCardDisplay } from './beautyQueueOrder';

/**
 * Pano sayımı takvim kartıyla aynı ziyareti kullanır.
 * Personel sütununda ardışık hizmet satırları tek randevudur.
 * Farklı `sale_group_id` aynı müşteri ve bitişik saat olsa da ayrı kalır.
 */
const CLINIC_VISIT_GROUP = { mergeConsecutiveSameCustomer: true } as const;

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

function clinicVisitLines(rows: BeautyAppointment[]): BeautyAppointment[][] {
    return groupBeautyBoardAppointmentLines(rows, CLINIC_VISIT_GROUP);
}

function visitHasCompleted(lines: BeautyAppointment[]): boolean {
    return lines.some((line) => line?.status === AppointmentStatus.COMPLETED);
}

function visitIsPending(lines: BeautyAppointment[]): boolean {
    if (visitHasCompleted(lines)) return false;
    return lines.some((line) =>
        EXPECTED_REVENUE_STATUSES.includes(
            line?.status as (typeof EXPECTED_REVENUE_STATUSES)[number],
        ),
    );
}

/**
 * Liste durumu ziyaretin bütününe bakar.
 * Tamamlanan satır varsa satır Tamamlandı kalır; peşinat kardeşi bekleyen yapmaz.
 * Yalnız ön ödeme satırları varsa Ön Ödeme Alındı.
 */
function visitListStatus(lines: BeautyAppointment[]): AppointmentStatus {
    if (visitHasCompleted(lines)) return AppointmentStatus.COMPLETED;
    if (lines.some((line) => line?.status === AppointmentStatus.IN_PROGRESS)) {
        return AppointmentStatus.IN_PROGRESS;
    }
    const active = lines.filter(
        (line) =>
            line?.status !== AppointmentStatus.CANCELLED &&
            line?.status !== AppointmentStatus.NO_SHOW,
    );
    if (active.length > 0 && active.every((line) => line.status === AppointmentStatus.PRE_PAID)) {
        return AppointmentStatus.PRE_PAID;
    }
    if (active.some((line) => line.status === AppointmentStatus.CONFIRMED)) {
        return AppointmentStatus.CONFIRMED;
    }
    if (active.some((line) => line.status === AppointmentStatus.SCHEDULED)) {
        return AppointmentStatus.SCHEDULED;
    }
    return (active[0]?.status ?? lines[0]?.status ?? AppointmentStatus.SCHEDULED) as AppointmentStatus;
}

function serviceLinesForVisit(lines: BeautyAppointment[]): BeautyAppointment[] {
    const services = lines.filter(
        (line) =>
            !isAppointmentDepositCartLine({
                name: line?.service_name,
                itemId: line?.service_id,
            }),
    );
    return services.length > 0 ? services : lines;
}

/** Hizmet tutarları bir kez. Peşinat alanı ve peşinat satırı ciroya eklenmez. */
function visitServiceAmount(lines: BeautyAppointment[]): number {
    let amount = 0;
    for (const line of lines) {
        if (
            isAppointmentDepositCartLine({
                name: line?.service_name,
                itemId: line?.service_id,
            })
        ) {
            continue;
        }
        const price = Number(line?.total_price ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        amount += price;
    }
    return amount;
}

/**
 * Bug 21: ClinicDashboard "BEKLENEN CİRO" KPI hesabı.
 *
 * Ziyaret (randevu kimliği) başına bir kez sayılır. Aynı randevunun
 * hizmet satırları ikinci randevu olmaz. Tutar, hizmet `total_price`
 * toplamıdır; `deposit_amount` gelire ikinci kez eklenmez.
 * Tamamlanan ziyaret bekleyene karışmaz.
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
    for (const lines of clinicVisitLines(pool)) {
        if (!visitIsPending(lines)) continue;
        const price = visitServiceAmount(lines);
        if (price <= 0) continue;
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
    // Sayı ve ciro, listedeki fiş satırıyla aynı ziyaret kimliğini kullanır.
    const visits = clinicVisitLines(todayApts);
    const completed = visits.filter((lines) => visitHasCompleted(lines));
    // 09.10.2026 — Bug "planli olan var bekleyende gozukmuyor":
    // BEKLEYEN KPI'ı yalnız SCHEDULED+CONFIRMED durumlarını sayıyordu;
    // PRE_PAID (peşinat alınmış) ve IN_PROGRESS (hizmet devam ediyor) durumları
    // da operatörün "henüz tamamlanmamış" olarak izlemesi gereken planlı
    // randevulardır. EXPECTED_REVENUE_STATUSES ile aynı 4 durum kullanılır.
    // Tamamlanan satırı olan ziyaret bekleyene yazılmaz; kardeş hizmet satırı
    // ikinci randevu sayılmaz.
    const pending = visits.filter((lines) => visitIsPending(lines));
    const inProg = visits.filter(
        (lines) =>
            !visitHasCompleted(lines) &&
            lines.some((line) => line.status === AppointmentStatus.IN_PROGRESS),
    );
    const cancelled = clinicVisitLines(
        todayAll.filter((a) => a.status === AppointmentStatus.CANCELLED),
    );
    const expected = computeClinicExpectedRevenue(todayApts);
    const total = visits.length;
    const rate = total ? Math.round((completed.length / total) * 100) : 0;
    return {
        todayApts,
        completed: completed.length,
        pending: pending.length,
        inProg: inProg.length,
        cancelled: cancelled.length,
        expectedRevenue: expected.amount,
        remaining: expected.count,
        total,
        rate,
    };
}

/** V1 «Bugünün Randevuları» satır sırası: saat artan. */
export function sortClinicTodayAppointments(rows: BeautyAppointment[]): BeautyAppointment[] {
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
        (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? ''),
    );
}

/**
 * «Bugünün Randevuları» fiş satırları.
 * Aynı ziyaretin hizmetleri tek satırda birleşir (`HIGH LIGHT · HAND JELISH`).
 * Farklı fiş ve farklı saat ayrı kalır. Tutar hizmet satırlarının toplamıdır;
 * peşinat ikinci kez eklenmez. Kaynak diziyi değiştirmez.
 */
export function listClinicTodayAppointments(rows: BeautyAppointment[]): BeautyAppointment[] {
    const groups = clinicVisitLines(Array.isArray(rows) ? rows : []);
    const listed = groups.map((lines) => {
        const card = { ...mergeQueueGroupForCardDisplay(serviceLinesForVisit(lines)) };
        card.status = visitListStatus(lines);
        card.total_price = visitServiceAmount(lines);
        return card;
    });
    return sortClinicTodayAppointments(listed);
}
