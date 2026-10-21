import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '../../../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import {
    buildClinicBoardShareText,
    clinicBoardWhatsAppShareUrl,
    listClinicBoardOpenSlots,
} from '../../../components/beauty/pages/clinicBoardModel';

const staff: BeautySpecialist[] = [
    { id: 'st-1', name: 'Roza', is_active: true, commission_rate: 0 },
];

function apt(partial: Partial<BeautyAppointment>): BeautyAppointment {
    return {
        id: 'a1',
        customer_name: 'Nihat',
        service_name: 'HAIR CUT',
        total_price: 50000,
        appointment_date: '2026-10-21',
        appointment_time: '10:00',
        duration: 60,
        status: AppointmentStatus.SCHEDULED,
        is_package_session: false,
        staff_id: 'st-1',
        ...partial,
    };
}

describe('boş saat paylaşımı', () => {
    it('dolu 10:00-11:00 dilimde yok, boş 09:00-09:30 dilimde var', () => {
        const slots = listClinicBoardOpenSlots({
            staff,
            appointments: [apt({})],
            dayYmd: '2026-10-21',
            staffFilterId: 'st-1',
            unassignedName: 'Atanmamış',
        });
        const labels = slots.map((slot) => slot.label);
        expect(labels).toContain('09:00-09:30');
        expect(labels).not.toContain('10:00-10:30');
        expect(labels).not.toContain('10:30-11:00');
        expect(labels.every((label) => !label.startsWith('10:00') && !label.startsWith('10:30'))).toBe(true);

        const text = buildClinicBoardShareText('21 Ekim 2026', slots, 'Boş saatler');
        expect(text).toContain('21 Ekim 2026');
        expect(text).toContain('09:00-09:30');
        expect(text).toContain('Roza');
        expect(text).not.toContain('10:00-10:30');
        expect(clinicBoardWhatsAppShareUrl(text).startsWith('https://wa.me/?text=')).toBe(true);
        expect(decodeURIComponent(clinicBoardWhatsAppShareUrl(text).split('text=')[1])).toContain('09:00-09:30');
    });
});
