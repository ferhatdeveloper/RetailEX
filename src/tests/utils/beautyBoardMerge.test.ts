import { describe, expect, it } from 'vitest';
import { AppointmentStatus, type BeautyAppointment } from '../../types/beauty';
import { mergeBeautyAppointmentsForBoardDisplay } from '../../utils/beautyQueueOrder';

const DAY = '2026-10-25';
const CUSTOMER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function apt(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id'>): BeautyAppointment {
    return {
        duration: 60,
        status: AppointmentStatus.PRE_PAID,
        total_price: 0,
        is_package_session: false,
        customer_id: CUSTOMER,
        client_id: CUSTOMER,
        customer_name: 'NIHAT TEKIN',
        appointment_date: DAY,
        date: DAY,
        deposit_amount: 0,
        ...partial,
    };
}

describe('takvim kartı — fatura bazlı birleşim', () => {
    it('aynı sale_group_id ile HIGH LIGHT + HAND JELISH tek kart olur', () => {
        const group = 'grp-nihat-1';
        const cards = mergeBeautyAppointmentsForBoardDisplay([
            apt({
                id: '1',
                service_name: 'HIGH LIGHT',
                appointment_time: '09:00',
                time: '09:00',
                total_price: 50_000,
                deposit_amount: 25_000,
                sale_group_id: group,
            }),
            apt({
                id: '2',
                service_name: 'HAND JELISH',
                appointment_time: '10:00',
                time: '10:00',
                total_price: 25_000,
                sale_group_id: group,
            }),
        ]);
        expect(cards).toHaveLength(1);
        expect(cards[0]?.service_name).toBe('HIGH LIGHT · HAND JELISH');
        expect(cards[0]?.total_price).toBe(75_000);
        expect(cards[0]?.deposit_amount).toBe(25_000);
        expect(cards[0]?.duration).toBe(120);
        expect(cards[0]?.appointment_time).toBe('09:00');
    });

    it('sale_group yok, hizmet faturası yok, ardışık → yine tek kart (ikinci fatura açılmadı)', () => {
        const cards = mergeBeautyAppointmentsForBoardDisplay([
            apt({
                id: '1',
                service_name: 'HIGH LIGHT',
                appointment_time: '09:00',
                time: '09:00',
                total_price: 50_000,
                deposit_amount: 25_000,
            }),
            apt({
                id: '2',
                service_name: 'HAND JELISH',
                appointment_time: '10:00',
                time: '10:00',
                total_price: 25_000,
            }),
        ]);
        expect(cards).toHaveLength(1);
        expect(cards[0]?.service_name).toContain('HIGH LIGHT');
        expect(cards[0]?.service_name).toContain('HAND JELISH');
        expect(cards[0]?.total_price).toBe(75_000);
    });

    it('farklı hizmet fişleri olan iki randevu ayrı kart kalır', () => {
        const cards = mergeBeautyAppointmentsForBoardDisplay([
            apt({
                id: '1',
                service_name: 'HIGH LIGHT',
                appointment_time: '09:00',
                time: '09:00',
                total_price: 50_000,
                remainder_sale_fiche_no: 'BEA-A',
            }),
            apt({
                id: '2',
                service_name: 'HAND JELISH',
                appointment_time: '10:00',
                time: '10:00',
                total_price: 25_000,
                remainder_sale_fiche_no: 'BEA-B',
            }),
        ]);
        expect(cards).toHaveLength(2);
    });
});
