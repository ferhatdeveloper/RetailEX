/**
 * Bug 21: ClinicDashboard BEKLENEN CİRO düzeltmesi.
 *
 * Amaç: `computeClinicExpectedRevenue` ve `computeClinicDayKpis` pure
 * helper'larının SCHEDULED / CONFIRMED / PRE_PAID / IN_PROGRESS
 * durumlarındaki randevuları BEKLENEN CİRO'ya dahil ettiğini, COMPLETED
 * ve CANCELLED durumlarını Hariç tuttuğunu doğrulamak.
 *
 * Senaryolar:
 *  - 1 planlanmış randevu (50.000) → BEKLENEN CİRO = 50.000
 *  - Tamamlanan → BEKLENEN CİRO = 0, TAMAMLANAN = 50.000
 *  - İptal → BEKLENEN CİRO = 0
 *  - Karışık durumlar (SCHEDULED + CONFIRMED + PRE_PAID + IN_PROGRESS + COMPLETED + CANCELLED)
 */
import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../../types/beauty';
import type { BeautyAppointment } from '../../types/beauty';
import { beautyAppointmentDateKey } from '../../utils/dateLocal';
import {
    EXPECTED_REVENUE_STATUSES,
    computeClinicDayKpis,
    computeClinicExpectedRevenue,
} from '../../utils/clinicDashboardStats';

const TODAY = '2026-10-03';

function makeApt(
    status: AppointmentStatus | string,
    total_price: number,
    overrides: Partial<BeautyAppointment> = {},
): BeautyAppointment {
    return {
        id: `apt-${Math.random().toString(36).slice(2, 10)}`,
        customer_id: 'cust-1',
        service_id: 'svc-1',
        staff_id: 'staff-1',
        appointment_date: TODAY,
        appointment_time: '09:00',
        duration: 60,
        status: status as AppointmentStatus,
        total_price,
        is_package_session: false,
        ...overrides,
    };
}

function dateKeyOf(a: BeautyAppointment): string {
    return beautyAppointmentDateKey(a);
}

describe('computeClinicExpectedRevenue (Bug 21)', () => {
    it('tek planlanmış randevu için BEKLENEN CİRO = total_price ve count = 1', () => {
        const apts = [makeApt(AppointmentStatus.SCHEDULED, 50_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(50_000);
        expect(r.count).toBe(1);
    });

    it('PRE_PAID durumundaki randevu (peşinatlı rezervasyon) BEKLENEN CİRO\'ya dahil', () => {
        // Bug 19 sonrası peşinatlı modda cari satış fişi oluşmuyor; bu yüzden
        // PRE_PAID randevunun tutarı yalnızca appointments tablosundan
        // okunabilir ve BEKLENEN CİRO'ya eklenmelidir.
        const apts = [makeApt(AppointmentStatus.PRE_PAID, 30_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(30_000);
        expect(r.count).toBe(1);
    });

    it('CONFIRMED durumundaki randevu BEKLENEN CİRO\'ya dahil', () => {
        const apts = [makeApt(AppointmentStatus.CONFIRMED, 20_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(20_000);
        expect(r.count).toBe(1);
    });

    it('IN_PROGRESS durumundaki randevu BEKLENEN CİRO\'ya dahil', () => {
        const apts = [makeApt(AppointmentStatus.IN_PROGRESS, 40_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(40_000);
        expect(r.count).toBe(1);
    });

    it('COMPLETED randevu BEKLENEN CİRO\'dan Hariç (TAMAMLANAN KPI\'da sayılır)', () => {
        const apts = [makeApt(AppointmentStatus.COMPLETED, 50_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(0);
        expect(r.count).toBe(0);
    });

    it('CANCELLED randevu BEKLENEN CİRO\'dan Hariç', () => {
        const apts = [makeApt(AppointmentStatus.CANCELLED, 50_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(0);
        expect(r.count).toBe(0);
    });

    it('NO_SHOW randevu BEKLENEN CİRO\'dan Hariç', () => {
        const apts = [makeApt(AppointmentStatus.NO_SHOW, 50_000)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(0);
        expect(r.count).toBe(0);
    });

    it('Birden çok randevu: yalnızca BEKLENEN CİRO durumları toplanır', () => {
        const apts = [
            makeApt(AppointmentStatus.SCHEDULED, 50_000),
            makeApt(AppointmentStatus.CONFIRMED, 30_000),
            makeApt(AppointmentStatus.PRE_PAID, 20_000),
            makeApt(AppointmentStatus.IN_PROGRESS, 10_000),
            makeApt(AppointmentStatus.COMPLETED, 100_000), // Hariç
            makeApt(AppointmentStatus.CANCELLED, 80_000),  // Hariç
        ];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(50_000 + 30_000 + 20_000 + 10_000);
        expect(r.count).toBe(4);
    });

    it('Negatif / sıfır / NaN fiyat toplama dahil edilmez', () => {
        const apts = [
            makeApt(AppointmentStatus.SCHEDULED, 0),
            makeApt(AppointmentStatus.SCHEDULED, -10),
            makeApt(AppointmentStatus.SCHEDULED, Number.NaN),
            makeApt(AppointmentStatus.SCHEDULED, 5_000),
        ];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(5_000);
        expect(r.count).toBe(1);
    });

    it('Boş / null / undefined input için güvenli 0/0 döner', () => {
        // @ts-expect-error — runtime savunma testi
        expect(computeClinicExpectedRevenue(null)).toEqual({ amount: 0, count: 0 });
        // @ts-expect-error — runtime savunma testi
        expect(computeClinicExpectedRevenue(undefined)).toEqual({ amount: 0, count: 0 });
        expect(computeClinicExpectedRevenue([])).toEqual({ amount: 0, count: 0 });
    });

    it('Bilinmeyen status BEKLENEN CİRO\'ya dahil edilmez', () => {
        // makeApt'in imzası (status: AppointmentStatus | string) kasıtlı
        // olarak geniş tutuldu; burada string fallback test ediliyor.
        const apts = [makeApt('mystery_state', 99_999)];
        const r = computeClinicExpectedRevenue(apts);
        expect(r.amount).toBe(0);
        expect(r.count).toBe(0);
    });

    it('Beklenen durum listesi (EXPECTED_REVENUE_STATUSES) doğru 4 status içerir', () => {
        expect(new Set(EXPECTED_REVENUE_STATUSES)).toEqual(
            new Set([
                AppointmentStatus.SCHEDULED,
                AppointmentStatus.CONFIRMED,
                AppointmentStatus.PRE_PAID,
                AppointmentStatus.IN_PROGRESS,
            ]),
        );
    });
});

describe('computeClinicDayKpis (Bug 21)', () => {
    it('Bugünkü randevular filtrelenir; başka güne ait olanlar Hariç', () => {
        const apts = [
            makeApt(AppointmentStatus.SCHEDULED, 50_000, { appointment_date: TODAY }),
            makeApt(AppointmentStatus.CONFIRMED, 30_000, { appointment_date: '2026-10-04' }),
            makeApt(AppointmentStatus.SCHEDULED, 20_000, { appointment_date: TODAY }),
        ];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.total).toBe(2);
        expect(k.expectedRevenue).toBe(70_000);
        expect(k.remaining).toBe(2);
    });

    it('Bug 19 sonrası senaryo: peşinatlı rezervasyon → BEKLENEN CİRO = 50.000', () => {
        // Bugünkü tek randevu, status PRE_PAID, total 50.000.
        // beauty_sales'ta cari satış fişi oluşmadığı için TAHSİLAT = 0;
        // BEKLENEN CİRO appointments'tan 50.000 gelmeli.
        const apts = [makeApt(AppointmentStatus.PRE_PAID, 50_000)];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.expectedRevenue).toBe(50_000);
        expect(k.remaining).toBe(1);
        expect(k.completed).toBe(0);
        expect(k.cancelled).toBe(0);
        expect(k.total).toBe(1);
    });

    it('Tamamlanan randevu → BEKLENEN CİRO = 0, TAMAMLANAN = 1', () => {
        const apts = [makeApt(AppointmentStatus.COMPLETED, 50_000)];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.expectedRevenue).toBe(0);
        expect(k.remaining).toBe(0);
        expect(k.completed).toBe(1);
        expect(k.rate).toBe(100);
    });

    it('İptal edilen randevu → BEKLENEN CİRO = 0, İPTAL = 1', () => {
        const apts = [makeApt(AppointmentStatus.CANCELLED, 50_000)];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.expectedRevenue).toBe(0);
        expect(k.remaining).toBe(0);
        expect(k.cancelled).toBe(1);
        expect(k.completed).toBe(0);
    });

    it('Karışık gün: scheduled + completed + cancelled → doğru KPI dağılımı', () => {
        const apts = [
            makeApt(AppointmentStatus.SCHEDULED, 50_000),
            makeApt(AppointmentStatus.PRE_PAID, 20_000),
            makeApt(AppointmentStatus.COMPLETED, 80_000),
            makeApt(AppointmentStatus.CANCELLED, 30_000),
            makeApt(AppointmentStatus.NO_SHOW, 10_000),
        ];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        // total = bugünkü görünür randevular (cancelled/no_show Hariç)
        // 5 kayıttan 2'si (CANCELLED + NO_SHOW) dışarıda kalır → 3 görünür
        expect(k.total).toBe(3);
        expect(k.expectedRevenue).toBe(70_000); // 50.000 + 20.000
        expect(k.remaining).toBe(2);
        expect(k.completed).toBe(1);
        expect(k.cancelled).toBe(1);
        // rate = completed / todayApts (3 görünür: SCHEDULED + PRE_PAID + COMPLETED)
        // → 1/3 = %33
        expect(k.rate).toBe(33);
    });

    it('rate hesabı 0 randevu için 0 döner (NaN koruması)', () => {
        const k = computeClinicDayKpis({ appointments: [], todayStr: TODAY, dateKeyOf });
        expect(k.rate).toBe(0);
        expect(k.total).toBe(0);
        expect(k.expectedRevenue).toBe(0);
        expect(k.remaining).toBe(0);
    });
});
