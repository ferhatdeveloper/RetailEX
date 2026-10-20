import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../types/beauty';
import { buildClinicV2View } from '../../utils/clinicV2Charts';

const TODAY = '2026-10-20';

function apt(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id' | 'service_name' | 'total_price'>): BeautyAppointment {
    return {
        customer_name: 'Müşteri',
        appointment_date: TODAY,
        appointment_time: '10:00',
        duration: 60,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        staff_id: 'st-1',
        ...partial,
    };
}

const staff: BeautySpecialist[] = [
    {
        id: 'st-1',
        name: 'Roza',
        is_active: true,
        commission_rate: 0,
        color: '#db2777',
    },
];

describe('buildClinicV2View', () => {
    it('hizmet tutarını API fiyatı olarak bırakır', () => {
        const view = buildClinicV2View({
            todayStr: TODAY,
            specialists: staff,
            unassignedLabel: 'Atanmamış',
            dateKeyOf: (a) => String(a.appointment_date),
            appointments: [
                apt({ id: 'a1', service_name: 'HAIR CUT', total_price: 50000, appointment_time: '09:00' }),
                apt({
                    id: 'a2',
                    service_name: 'HAIR PINK COLOR',
                    total_price: 60000,
                    appointment_time: '11:00',
                    status: AppointmentStatus.COMPLETED,
                }),
            ],
        });
        expect(view.serviceRevenue).toEqual([
            { name: 'HAIR PINK COLOR', amount: 60000 },
            { name: 'HAIR CUT', amount: 50000 },
        ]);
        expect(view.blocks.map((b) => b.price).sort((a, b) => a - b)).toEqual([50000, 60000]);
        expect(view.status.find((s) => s.key === 'completed')?.count).toBe(1);
        expect(view.status.find((s) => s.key === 'pending')?.count).toBe(1);
    });

    it('iptal satırını hizmet cirosuna eklemez ve boş günde sıfır döner', () => {
        const empty = buildClinicV2View({
            todayStr: TODAY,
            specialists: [],
            unassignedLabel: 'Atanmamış',
            dateKeyOf: (a) => String(a.appointment_date),
            appointments: [],
        });
        expect(empty.serviceRevenue).toEqual([]);
        expect(empty.blocks).toEqual([]);
        expect(empty.occupancyRate).toBe(0);
        expect(empty.status.every((s) => s.count === 0)).toBe(true);

        const cancelled = buildClinicV2View({
            todayStr: TODAY,
            specialists: staff,
            unassignedLabel: 'Atanmamış',
            dateKeyOf: (a) => String(a.appointment_date),
            appointments: [
                apt({
                    id: 'c1',
                    service_name: 'HAIR CUT',
                    total_price: 50000,
                    status: AppointmentStatus.CANCELLED,
                }),
            ],
        });
        expect(cancelled.serviceRevenue).toEqual([]);
        expect(cancelled.status.find((s) => s.key === 'cancelled')?.count).toBe(1);
        expect(cancelled.blocks).toEqual([]);
    });

    it('personel doluluğunu süre ve gün penceresinden hesaplar', () => {
        const view = buildClinicV2View({
            todayStr: TODAY,
            specialists: staff,
            unassignedLabel: 'Atanmamış',
            dateKeyOf: (a) => String(a.appointment_date),
            appointments: [
                apt({ id: 'd1', service_name: 'HAIR CUT', total_price: 50000, duration: 60 }),
            ],
        });
        expect(view.staffOccupancy).toHaveLength(1);
        expect(view.staffOccupancy[0]?.bookedMin).toBe(60);
        expect(view.staffOccupancy[0]?.capacityMin).toBe(12 * 60);
        expect(view.occupancyRate).toBe(Math.round((60 / (12 * 60)) * 100));
    });
});
