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
    listClinicTodayAppointments,
} from '../../utils/clinicDashboardStats';

const TODAY = '2026-10-03';

function makeApt(
    status: AppointmentStatus | string,
    total_price: number,
    overrides: Partial<BeautyAppointment> = {},
): BeautyAppointment {
    const id = String(overrides.id ?? `apt-${Math.random().toString(36).slice(2, 10)}`);
    return {
        id,
        // Aynı saatteki ayrı randevular aynı müşteri diye birleşmesin.
        customer_id: `cust-${id}`,
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

    it('iki hizmetli randevu bir kez sayılır; aynı müşterinin ayrı saatteki ikinci randevusu ayrı kalır; peşinat eklenmez', () => {
        const customer = 'cust-rza';
        const apts = [
            makeApt(AppointmentStatus.PRE_PAID, 50_000, {
                id: 'rza-hl',
                customer_id: customer,
                customer_name: 'RZA',
                service_name: 'HIGH LIGHT',
                appointment_time: '11:00',
                time: '11:00',
                duration: 60,
                sale_group_id: 'visit-rza-1',
                deposit_amount: 20_000,
            }),
            makeApt(AppointmentStatus.PRE_PAID, 25_000, {
                id: 'rza-hj',
                customer_id: customer,
                customer_name: 'RZA',
                service_name: 'HAND JELISH',
                appointment_time: '12:00',
                time: '12:00',
                duration: 60,
                sale_group_id: 'visit-rza-1',
                deposit_amount: 20_000,
            }),
            makeApt(AppointmentStatus.SCHEDULED, 30_000, {
                id: 'rza-later',
                customer_id: customer,
                customer_name: 'RZA',
                service_name: 'HAND JELISH',
                appointment_time: '18:00',
                time: '18:00',
                duration: 60,
                sale_group_id: 'visit-rza-2',
                deposit_amount: 10_000,
            }),
        ];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        const revenue = computeClinicExpectedRevenue(apts);
        const serviceTotal = 50_000 + 25_000 + 30_000;
        expect(k.total).toBe(2);
        expect(k.pending).toBe(2);
        expect(k.remaining).toBe(2);
        expect(k.completed).toBe(0);
        expect(k.expectedRevenue).toBe(serviceTotal);
        expect(revenue).toEqual({ amount: serviceTotal, count: 2 });
        expect(k.expectedRevenue).not.toBe(serviceTotal + 20_000);
        expect(k.expectedRevenue).not.toBe(serviceTotal + 20_000 + 20_000 + 10_000);
        expect(k.todayApts).toHaveLength(3);
    });

    it('farklı randevu kimliği bitişik saatte de ayrı kalır', () => {
        const customer = 'cust-rza';
        const apts = [
            makeApt(AppointmentStatus.SCHEDULED, 25_000, {
                id: 'a',
                customer_id: customer,
                appointment_time: '11:00',
                time: '11:00',
                sale_group_id: 'visit-a',
            }),
            makeApt(AppointmentStatus.SCHEDULED, 50_000, {
                id: 'b',
                customer_id: customer,
                appointment_time: '12:00',
                time: '12:00',
                sale_group_id: 'visit-b',
            }),
        ];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.total).toBe(2);
        expect(k.pending).toBe(2);
        expect(k.expectedRevenue).toBe(75_000);
    });

    it('kimliksiz ardışık iki hizmet tek randevudur; aynı gün 18:00 ayrı kalır', () => {
        const customer = 'cust-dunya';
        const apts = [
            makeApt(AppointmentStatus.PRE_PAID, 50_000, {
                id: 'd1',
                customer_id: customer,
                customer_name: 'DUNYA',
                service_name: 'HIGH LIGHT',
                appointment_time: '09:00',
                time: '09:00',
                duration: 60,
                deposit_amount: 25_000,
            }),
            makeApt(AppointmentStatus.PRE_PAID, 25_000, {
                id: 'd2',
                customer_id: customer,
                customer_name: 'DUNYA',
                service_name: 'HAND JELISH',
                appointment_time: '10:00',
                time: '10:00',
                duration: 60,
                deposit_amount: 25_000,
            }),
            makeApt(AppointmentStatus.SCHEDULED, 40_000, {
                id: 'd3',
                customer_id: customer,
                customer_name: 'DUNYA',
                service_name: 'HAND JELISH',
                appointment_time: '18:00',
                time: '18:00',
                duration: 60,
            }),
        ];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.total).toBe(2);
        expect(k.pending).toBe(2);
        expect(k.expectedRevenue).toBe(50_000 + 25_000 + 40_000);
        expect(k.todayApts).toHaveLength(3);
    });

    it('tamamlanan ziyaretin peşinatlı hizmet satırı bekleyene ve beklenen ciroya girmez', () => {
        const customer = 'cust-rza';
        const apts = [
            makeApt(AppointmentStatus.COMPLETED, 25_000, {
                id: 'c1',
                customer_id: customer,
                service_name: 'HAND JELISH',
                appointment_time: '11:00',
                time: '11:00',
                duration: 60,
                sale_group_id: 'visit-done',
            }),
            makeApt(AppointmentStatus.PRE_PAID, 50_000, {
                id: 'c2',
                customer_id: customer,
                service_name: 'HIGH LIGHT',
                appointment_time: '12:00',
                time: '12:00',
                duration: 60,
                sale_group_id: 'visit-done',
                deposit_amount: 20_000,
            }),
        ];
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.total).toBe(1);
        expect(k.completed).toBe(1);
        expect(k.pending).toBe(0);
        expect(k.remaining).toBe(0);
        expect(k.expectedRevenue).toBe(0);
        expect(k.todayApts).toHaveLength(2);
    });

    it('beş hizmet satırı üç fiş satırına iner; 18:00 ayrı kalır; peşinat tutara eklenmez', () => {
        const apts = [
            makeApt(AppointmentStatus.COMPLETED, 50_000, {
                id: 'dunya-hl',
                customer_id: 'cust-dunya',
                customer_name: 'DUNYA',
                service_name: 'HIGH LIGHT',
                appointment_time: '09:00',
                time: '09:00',
                duration: 120,
                sale_group_id: 'fis-dunya',
                deposit_amount: 25_000,
            }),
            makeApt(AppointmentStatus.PRE_PAID, 25_000, {
                id: 'dunya-hj',
                customer_id: 'cust-dunya',
                customer_name: 'DUNYA',
                service_name: 'HAND JELISH',
                appointment_time: '10:00',
                time: '10:00',
                duration: 60,
                sale_group_id: 'fis-dunya',
                deposit_amount: 25_000,
            }),
            makeApt(AppointmentStatus.COMPLETED, 25_000, {
                id: 'rza-hj',
                customer_id: 'cust-rza',
                customer_name: 'RZA',
                service_name: 'HAND JELISH',
                appointment_time: '11:00',
                time: '11:00',
                duration: 120,
                sale_group_id: 'fis-rza-noon',
                deposit_amount: 20_000,
            }),
            makeApt(AppointmentStatus.PRE_PAID, 50_000, {
                id: 'rza-hl',
                customer_id: 'cust-rza',
                customer_name: 'RZA',
                service_name: 'HIGH LIGHT',
                appointment_time: '12:00',
                time: '12:00',
                duration: 60,
                sale_group_id: 'fis-rza-noon',
                deposit_amount: 50_000,
            }),
            makeApt(AppointmentStatus.COMPLETED, 25_000, {
                id: 'rza-eve',
                customer_id: 'cust-rza',
                customer_name: 'RZA',
                service_name: 'HAND JELISH',
                appointment_time: '18:00',
                time: '18:00',
                duration: 60,
                sale_group_id: 'fis-rza-eve',
                deposit_amount: 25_000,
            }),
        ];

        const rows = listClinicTodayAppointments(apts);
        expect(rows).toHaveLength(3);
        expect(rows.map((row) => row.appointment_time)).toEqual(['09:00', '11:00', '18:00']);
        expect(rows.map((row) => row.customer_name)).toEqual(['DUNYA', 'RZA', 'RZA']);
        expect(rows.map((row) => row.service_name)).toEqual([
            'HIGH LIGHT · HAND JELISH',
            'HAND JELISH · HIGH LIGHT',
            'HAND JELISH',
        ]);
        expect(rows.map((row) => row.status)).toEqual([
            AppointmentStatus.COMPLETED,
            AppointmentStatus.COMPLETED,
            AppointmentStatus.COMPLETED,
        ]);
        expect(rows.map((row) => row.total_price)).toEqual([75_000, 75_000, 25_000]);
        expect(rows[0]?.total_price).not.toBe(75_000 + 25_000);
        expect(rows[1]?.total_price).not.toBe(75_000 + 50_000);
        expect(rows[1]?.total_price).not.toBe(75_000 + 20_000 + 50_000);
        expect(rows[2]?.total_price).not.toBe(25_000 + 25_000);
        expect(rows[2]?.service_name).toBe('HAND JELISH');

        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.total).toBe(rows.length);
        expect(k.total).toBe(3);
        expect(k.completed).toBe(3);
        expect(k.pending).toBe(0);
        expect(k.remaining).toBe(0);
        expect(k.expectedRevenue).toBe(0);
        expect(k.todayApts).toHaveLength(5);
    });

    it('yalnız ön ödemeli fiş tek satırdır; beklenen ciro hizmet toplamıdır, peşinat eklenmez', () => {
        const apts = [
            makeApt(AppointmentStatus.PRE_PAID, 40_000, {
                id: 'pre-1',
                customer_id: 'cust-pre',
                customer_name: 'DUNYA',
                service_name: 'HIGH LIGHT',
                appointment_time: '14:00',
                time: '14:00',
                duration: 60,
                sale_group_id: 'fis-pre',
                deposit_amount: 15_000,
            }),
            makeApt(AppointmentStatus.PRE_PAID, 10_000, {
                id: 'pre-2',
                customer_id: 'cust-pre',
                customer_name: 'DUNYA',
                service_name: 'HAND JELISH',
                appointment_time: '15:00',
                time: '15:00',
                duration: 60,
                sale_group_id: 'fis-pre',
                deposit_amount: 15_000,
            }),
        ];
        const rows = listClinicTodayAppointments(apts);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.status).toBe(AppointmentStatus.PRE_PAID);
        expect(rows[0]?.service_name).toBe('HIGH LIGHT · HAND JELISH');
        expect(rows[0]?.total_price).toBe(50_000);
        const k = computeClinicDayKpis({ appointments: apts, todayStr: TODAY, dateKeyOf });
        expect(k.total).toBe(1);
        expect(k.pending).toBe(1);
        expect(k.remaining).toBe(1);
        expect(k.completed).toBe(0);
        expect(k.expectedRevenue).toBe(50_000);
        expect(k.expectedRevenue).not.toBe(50_000 + 15_000);
        expect(k.expectedRevenue).not.toBe(50_000 + 15_000 + 15_000);
    });

    it('bitişik saatte farklı fiş listede birleşmez', () => {
        const customer = 'cust-rza';
        const rows = listClinicTodayAppointments([
            makeApt(AppointmentStatus.SCHEDULED, 25_000, {
                id: 'near-a',
                customer_id: customer,
                customer_name: 'RZA',
                service_name: 'HAND JELISH',
                appointment_time: '11:00',
                time: '11:00',
                duration: 60,
                sale_group_id: 'fis-a',
            }),
            makeApt(AppointmentStatus.SCHEDULED, 50_000, {
                id: 'near-b',
                customer_id: customer,
                customer_name: 'RZA',
                service_name: 'HIGH LIGHT',
                appointment_time: '12:00',
                time: '12:00',
                duration: 60,
                sale_group_id: 'fis-b',
            }),
        ]);
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.appointment_time)).toEqual(['11:00', '12:00']);
        expect(rows.map((row) => row.total_price)).toEqual([25_000, 50_000]);
        expect(rows.map((row) => row.service_name)).toEqual(['HAND JELISH', 'HIGH LIGHT']);
    });
});
