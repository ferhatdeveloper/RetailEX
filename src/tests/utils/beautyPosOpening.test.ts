/**
 * Aynı müşteri, aynı gün, aynı personel, iki saat ve iki fiş.
 * POS açılışı iki sepet döner. Tutarlar karışmaz.
 * Rezervasyon yalnız kendi fişinde kalır.
 */
import { describe, expect, it } from 'vitest';
import { AppointmentStatus, type BeautyAppointment } from '../../types/beauty';
import { findBeautyAppointmentsSameQueueGroup } from '../../utils/beautyQueueOrder';
import {
    beautyPosOpeningAppointments,
    beautyPosOpeningKey,
    buildBeautyPosOpeningCarts,
    openBeautyPosCart,
} from '../../utils/beautyPosOpening';

const DAY = '2026-10-24';
const CUSTOMER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TORPI_ID = '11111111-1111-1111-1111-111111111111';
const SAC_ID = '22222222-2222-2222-2222-222222222222';

function appointment(partial: Partial<BeautyAppointment> & Pick<BeautyAppointment, 'id'>): BeautyAppointment {
    return {
        duration: 60,
        status: AppointmentStatus.COMPLETED,
        total_price: 0,
        is_package_session: false,
        customer_id: CUSTOMER,
        client_id: CUSTOMER,
        customer_name: 'ROZA',
        staff_id: STAFF,
        specialist_id: STAFF,
        staff_name: 'ARZ',
        appointment_date: DAY,
        date: DAY,
        deposit_amount: 0,
        remainder_paid_amount: 0,
        ...partial,
    };
}

const torpi = appointment({
    id: TORPI_ID,
    service_name: 'TORPI',
    appointment_time: '09:00',
    time: '09:00',
    total_price: 50_000,
    deposit_amount: 10_000,
    remainder_sale_fiche_no: 'BEA-20261024-0900',
});

const sacBoya = appointment({
    id: SAC_ID,
    service_name: 'SAC BOYA',
    appointment_time: '12:00',
    time: '12:00',
    total_price: 25_000,
    deposit_amount: 0,
    remainder_sale_fiche_no: 'BEA-20261024-1200',
});

describe('POS açılış sepeti — fatura, saat ve randevu', () => {
    it('aynı müşteri, gün ve personelde iki saati iki sepete ayırır', () => {
        const queueGroup = findBeautyAppointmentsSameQueueGroup(torpi, [torpi, sacBoya]);
        expect(queueGroup).toHaveLength(2);

        const carts = buildBeautyPosOpeningCarts([torpi, sacBoya], {
            advances: [{ notes: `Randevu ${TORPI_ID}`, amount: 10_000 }],
        });

        expect(carts).toHaveLength(2);
        expect(new Set(carts.map((cart) => cart.key)).size).toBe(2);
        expect(carts.every((cart) => cart.customerId === CUSTOMER)).toBe(true);
        expect(carts.every((cart) => cart.staffId === STAFF)).toBe(true);
        expect(carts.every((cart) => cart.dateKey === DAY)).toBe(true);

        const customerDayStaff = `${CUSTOMER}|${DAY}|${STAFF}`;
        expect(carts.map((cart) => cart.key)).not.toContain(customerDayStaff);
        expect(beautyPosOpeningKey(torpi)).toContain('BEA-20261024-0900');
        expect(beautyPosOpeningKey(torpi)).toContain('09:00');
        expect(beautyPosOpeningKey(torpi)).toContain(TORPI_ID);
        expect(beautyPosOpeningKey(sacBoya)).toContain('BEA-20261024-1200');
        expect(beautyPosOpeningKey(sacBoya)).toContain('12:00');
        expect(beautyPosOpeningKey(sacBoya)).toContain(SAC_ID);
        expect(beautyPosOpeningKey(torpi)).not.toBe(beautyPosOpeningKey(sacBoya));
    });

    it('09:00 TORPI fişi yalnız TORPI tutarını ve kendi peşinatını taşır', () => {
        const cart = openBeautyPosCart(torpi, [torpi, sacBoya], {
            advances: [{ notes: `Randevu ${TORPI_ID}`, amount: 10_000 }],
        });
        expect(cart).not.toBeNull();
        expect(beautyPosOpeningAppointments(torpi, [torpi, sacBoya]).map((row) => row.id)).toEqual([TORPI_ID]);
        expect(cart?.time).toBe('09:00');
        expect(cart?.ficheNo).toBe('BEA-20261024-0900');
        expect(cart?.lines.map((line) => line.serviceName)).toEqual(['TORPI']);
        expect(cart?.lines.map((line) => line.unitPrice)).toEqual([50_000]);
        expect(cart?.subtotal).toBe(50_000);
        expect(cart?.total).toBe(50_000);
        expect(cart?.reservationAmount).toBe(10_000);
        expect(cart?.prepaid).toBe(10_000);
        expect(cart?.remaining).toBe(40_000);
        expect(cart?.subtotal).not.toBe(75_000);
        expect(cart?.remaining).not.toBe(65_000);
        expect(cart?.lines.some((line) => line.serviceName === 'SAC BOYA')).toBe(false);
        expect(cart?.lines.some((line) => line.unitPrice === 40_000)).toBe(false);
    });

    it('12:00 SAC BOYA fişi peşinatı kopyalamaz ve birleşik kalanı taşımaz', () => {
        const cart = openBeautyPosCart(sacBoya, [torpi, sacBoya], {
            advances: [{ notes: `Randevu ${TORPI_ID}`, amount: 10_000 }],
        });
        expect(cart).not.toBeNull();
        expect(beautyPosOpeningAppointments(sacBoya, [torpi, sacBoya]).map((row) => row.id)).toEqual([SAC_ID]);
        expect(cart?.time).toBe('12:00');
        expect(cart?.ficheNo).toBe('BEA-20261024-1200');
        expect(cart?.lines.map((line) => ({ name: line.serviceName, price: line.unitPrice }))).toEqual([
            { name: 'SAC BOYA', price: 25_000 },
        ]);
        expect(cart?.subtotal).toBe(25_000);
        expect(cart?.total).toBe(25_000);
        expect(cart?.reservationAmount).toBe(0);
        expect(cart?.prepaid).toBe(0);
        expect(cart?.remaining).toBe(25_000);
        expect(cart?.remaining).not.toBe(65_000);
        expect(cart?.remaining).not.toBe(32_500);
        expect(cart?.reservationAmount).not.toBe(5_000);
        expect(cart?.lines.some((line) => line.serviceName === 'TORPI')).toBe(false);
    });

    it('iki randevuyu birden sayan avans notu peşinatı kopyalamaz ve bölmez', () => {
        const bareTorpi = appointment({
            ...torpi,
            deposit_amount: 0,
        });
        const carts = buildBeautyPosOpeningCarts([bareTorpi, sacBoya], {
            advances: [{ notes: `${TORPI_ID} ${SAC_ID}`, amount: 10_000 }],
        });
        expect(carts.map((cart) => cart.reservationAmount)).toEqual([0, 0]);
        expect(carts.map((cart) => cart.prepaid)).toEqual([0, 0]);
        expect(carts.map((cart) => cart.total)).toEqual([50_000, 25_000]);
    });

    it('fiş no boş olsa da saat ve randevu id sepetleri ayrı tutar', () => {
        const early = appointment({
            ...torpi,
            remainder_sale_fiche_no: '',
            deposit_sale_fiche_no: 'PES-0900',
        });
        const late = appointment({
            ...sacBoya,
            remainder_sale_fiche_no: '',
            deposit_sale_fiche_no: 'PES-1200',
        });
        const carts = buildBeautyPosOpeningCarts([early, late]);
        expect(carts).toHaveLength(2);
        expect(carts[0]?.ficheNo).toBe('');
        expect(carts[1]?.ficheNo).toBe('');
        expect(carts[0]?.time).toBe('09:00');
        expect(carts[1]?.time).toBe('12:00');
        expect(carts[0]?.lines[0]?.unitPrice).toBe(50_000);
        expect(carts[1]?.lines[0]?.unitPrice).toBe(25_000);
        expect(carts[0]?.reservationAmount).toBe(10_000);
        expect(carts[1]?.reservationAmount).toBe(0);
        expect(carts[0]?.key).not.toBe(carts[1]?.key);
    });
});
