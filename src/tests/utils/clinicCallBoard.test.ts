import { describe, expect, it } from 'vitest';
import { AppointmentStatus, type BeautyAppointment } from '../../types/beauty';
import {
    clinicCallBoardBounds,
    filterClinicCallBoardRows,
    groupClinicCallBoardByService,
    selectClinicCallBoardRows,
} from '../../utils/clinicCallBoard';
import { computeClinicDayKpis, sortClinicTodayAppointments } from '../../utils/clinicDashboardStats';
import { beautyAppointmentDateKey } from '../../utils/dateLocal';

function apt(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id'>): BeautyAppointment {
    return {
        service_name: 'Kesim',
        total_price: 10,
        appointment_date: '2026-10-21',
        appointment_time: '09:00',
        duration: 30,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        ...partial,
    };
}

describe('clinicCallBoard', () => {
    it('V1 arama süzgeci planlı kayıtları tutar, tamamlananı bırakır', () => {
        const rows = selectClinicCallBoardRows([
            apt({ id: 'plan', status: AppointmentStatus.SCHEDULED, appointment_time: '11:00' }),
            apt({ id: 'ok', status: AppointmentStatus.CONFIRMED, appointment_time: '08:00' }),
            apt({ id: 'run', status: AppointmentStatus.IN_PROGRESS, appointment_time: '10:00' }),
            apt({ id: 'done', status: AppointmentStatus.COMPLETED }),
            apt({ id: 'pre', status: AppointmentStatus.PRE_PAID }),
            apt({ id: 'no', status: AppointmentStatus.CANCELLED }),
        ]);
        expect(rows.map((row) => row.id)).toEqual(['ok', 'run', 'plan']);
    });

    it('hizmet ve cihaz seçimi aynı süzgeci kullanır', () => {
        const rows = filterClinicCallBoardRows(
            [
                apt({ id: 'a', service_id: 's1', device_id: 'd1' }),
                apt({ id: 'b', service_id: 's2', device_id: 'd1' }),
            ],
            's1',
            'd1',
        );
        expect(rows.map((row) => row.id)).toEqual(['a']);
        const grouped = groupClinicCallBoardByService(rows);
        expect(grouped).toHaveLength(1);
        expect(grouped[0].sum).toBe(10);
    });

    it('bugün ve yarın aralığı tek gündür', () => {
        const now = new Date(2026, 9, 21, 15, 0, 0);
        expect(clinicCallBoardBounds({ tab: 'today', now, monthOffset: 0, rangeFrom: '', rangeTo: '' })).toEqual({
            start: '2026-10-21',
            end: '2026-10-21',
        });
        expect(clinicCallBoardBounds({ tab: 'tomorrow', now, monthOffset: 0, rangeFrom: '', rangeTo: '' })).toEqual({
            start: '2026-10-22',
            end: '2026-10-22',
        });
    });

    it('bugünkü liste computeClinicDayKpis sırasını kullanır', () => {
        const kpis = computeClinicDayKpis({
            appointments: [
                apt({ id: 'late', appointment_time: '18:00', total_price: 20 }),
                apt({ id: 'early', appointment_time: '08:30', total_price: 15 }),
                apt({ id: 'other', appointment_date: '2026-10-20', appointment_time: '07:00' }),
            ],
            todayStr: '2026-10-21',
            dateKeyOf: beautyAppointmentDateKey,
        });
        expect(sortClinicTodayAppointments(kpis.todayApts).map((row) => row.id)).toEqual(['early', 'late']);
        expect(kpis.total).toBe(2);
    });
});
