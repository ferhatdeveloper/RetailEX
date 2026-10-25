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
    filterBeautyPosCatalogForReceipt,
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
        expect(beautyPosOpeningKey(torpi)).toBe('fiche:BEA-20261024-0900');
        expect(beautyPosOpeningKey(sacBoya)).toBe('fiche:BEA-20261024-1200');
        expect(beautyPosOpeningKey(torpi)).not.toContain('09:00');
        expect(beautyPosOpeningKey(torpi)).not.toContain(TORPI_ID);
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
        expect(carts[0]?.key).toBe(`apt:${TORPI_ID}`);
        expect(carts[1]?.key).toBe(`apt:${SAC_ID}`);
    });

    it('sale_group_id aynıysa fiş no boş olsa da iki hizmet tek sepette kalır', () => {
        const group = 'grp-visit-nihat';
        const high = appointment({
            id: TORPI_ID,
            service_name: 'HIGH LIGHT',
            appointment_time: '09:00',
            time: '09:00',
            total_price: 50_000,
            deposit_amount: 25_000,
            sale_group_id: group,
            remainder_sale_fiche_no: '',
        });
        const hand = appointment({
            id: SAC_ID,
            service_name: 'HAND JELISH',
            appointment_time: '10:00',
            time: '10:00',
            total_price: 25_000,
            deposit_amount: 0,
            sale_group_id: group,
            remainder_sale_fiche_no: '',
        });
        const cart = openBeautyPosCart(high, [high, hand]);
        expect(cart?.lines.map((line) => line.serviceName)).toEqual(['HIGH LIGHT', 'HAND JELISH']);
        expect(cart?.subtotal).toBe(75_000);
        expect(cart?.reservationAmount).toBe(25_000);
        expect(cart?.remaining).toBe(50_000);
        expect(beautyPosOpeningAppointments(high, [high, hand]).map((row) => row.id)).toEqual([
            TORPI_ID,
            SAC_ID,
        ]);
        expect(beautyPosOpeningKey(high)).toBe(`group:${group}`);
    });

    it('fişsiz ardışık iki hizmet (ikinci fatura yok) tek sepette birleşir', () => {
        const high = appointment({
            id: TORPI_ID,
            service_name: 'HIGH LIGHT',
            appointment_time: '09:00',
            time: '09:00',
            total_price: 50_000,
            deposit_amount: 25_000,
            remainder_sale_fiche_no: '',
        });
        const hand = appointment({
            id: SAC_ID,
            service_name: 'HAND JELISH',
            appointment_time: '10:00',
            time: '10:00',
            total_price: 25_000,
            deposit_amount: 0,
            remainder_sale_fiche_no: '',
        });
        const cart = openBeautyPosCart(high, [high, hand]);
        expect(cart?.lines.map((line) => line.serviceName)).toEqual(['HIGH LIGHT', 'HAND JELISH']);
        expect(cart?.subtotal).toBe(75_000);
        expect(cart?.remaining).toBe(50_000);
    });

    it('aynı fişin iki hizmeti sepette kalır, diğer fişin hizmeti gelmez', () => {
        const saleId = '55555555-5555-4555-8555-555555555555';
        const boyaId = '33333333-3333-4333-8333-333333333333';
        const tirnak = appointment({
            id: TORPI_ID,
            service_id: 'svc-tirnak',
            service_name: 'TIRNAK',
            appointment_time: '09:00',
            time: '09:00',
            total_price: 25_000,
            deposit_amount: 25_000,
            remainder_sale_id: saleId,
            remainder_sale_fiche_no: 'BEA-FERHAT-0900',
        });
        const boyaSame = appointment({
            id: boyaId,
            service_id: 'svc-boya',
            service_name: 'BOYA',
            appointment_time: '09:30',
            time: '09:30',
            total_price: 50_000,
            deposit_amount: 0,
            remainder_sale_id: saleId,
            remainder_sale_fiche_no: 'BEA-FERHAT-0900',
        });
        const other = appointment({
            ...sacBoya,
            remainder_sale_id: '66666666-6666-4666-8666-666666666666',
            remainder_sale_fiche_no: 'BEA-FERHAT-1200',
        });

        const cart = openBeautyPosCart(tirnak, [tirnak, boyaSame, other], {
            advances: [{ notes: `Randevu ${SAC_ID}`, amount: 99_000 }],
        });
        expect(cart?.lines.map((line) => line.serviceName)).toEqual(['TIRNAK', 'BOYA']);
        expect(cart?.subtotal).toBe(75_000);
        expect(cart?.total).toBe(75_000);
        expect(cart?.reservationAmount).toBe(25_000);
        expect(cart?.prepaid).toBe(25_000);
        expect(cart?.remaining).toBe(50_000);
        expect(cart?.total).not.toBe(100_000);
        expect(cart?.lines.some((line) => line.serviceName === 'SAC BOYA')).toBe(false);
        expect(beautyPosOpeningAppointments(tirnak, [tirnak, boyaSame, other]).map((row) => row.id)).toEqual([
            TORPI_ID,
            boyaId,
        ]);
        const catalog = filterBeautyPosCatalogForReceipt(
            [
                { id: 'svc-tirnak', name: 'TIRNAK' },
                { id: 'svc-boya', name: 'BOYA' },
                { id: 'svc-sac', name: 'SAC BOYA' },
            ],
            cart?.lines ?? [],
        );
        expect(catalog.map((item) => item.name)).toEqual(['TIRNAK', 'BOYA']);
    });

    it('FERHAT 09:00 fişinde yalnız TIRNAK kalır; BOYA başka fişse katalogda durmaz', () => {
        const ferhat = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const boyaId = '44444444-4444-4444-8444-444444444444';
        const tirnak = appointment({
            id: TORPI_ID,
            customer_id: ferhat,
            client_id: ferhat,
            customer_name: 'FERHAT',
            service_id: 'svc-tirnak',
            service_name: 'TIRNAK',
            appointment_date: '2026-10-25',
            date: '2026-10-25',
            appointment_time: '09:00',
            time: '09:00',
            status: AppointmentStatus.SCHEDULED,
            total_price: 25_000,
            deposit_amount: 25_000,
        });
        const boya = appointment({
            id: boyaId,
            customer_id: ferhat,
            client_id: ferhat,
            customer_name: 'FERHAT',
            service_id: 'svc-boya',
            service_name: 'BOYA',
            appointment_date: '2026-10-25',
            date: '2026-10-25',
            appointment_time: '11:00',
            time: '11:00',
            status: AppointmentStatus.SCHEDULED,
            total_price: 50_000,
            deposit_amount: 40_000,
            remainder_sale_fiche_no: 'BEA-BOYA-1100',
        });
        const cart = openBeautyPosCart(tirnak, [tirnak, boya], {
            advances: [{ notes: `Randevu ${boyaId}`, amount: 40_000 }],
        });
        expect(cart?.time).toBe('09:00');
        expect(cart?.lines.map((line) => ({ name: line.serviceName, price: line.unitPrice }))).toEqual([
            { name: 'TIRNAK', price: 25_000 },
        ]);
        expect(cart?.subtotal).toBe(25_000);
        expect(cart?.total).toBe(25_000);
        expect(cart?.prepaid).toBe(25_000);
        expect(cart?.reservationAmount).toBe(25_000);
        expect(cart?.remaining).toBe(0);
        expect(cart?.reservationAmount).not.toBe(40_000);
        expect(cart?.reservationAmount).not.toBe(65_000);
        const catalog = filterBeautyPosCatalogForReceipt(
            [
                { id: 'svc-tirnak', name: 'TIRNAK' },
                { id: 'svc-boya', name: 'BOYA' },
            ],
            cart?.lines ?? [],
        );
        expect(catalog.map((item) => item.name)).toEqual(['TIRNAK']);
        expect(filterBeautyPosCatalogForReceipt(
            [
                { id: 'svc-tirnak', name: 'TIRNAK' },
                { id: 'svc-boya', name: 'BOYA' },
            ],
            [],
        ).map((item) => item.name)).toEqual(['TIRNAK', 'BOYA']);
    });

    it('fişe bağlı satış kalemleri sepete girer, depozito ve diğer fiş girmez', () => {
        const tirnak = appointment({
            id: TORPI_ID,
            service_id: 'svc-tirnak',
            service_name: 'TIRNAK',
            appointment_time: '09:00',
            time: '09:00',
            status: AppointmentStatus.SCHEDULED,
            total_price: 25_000,
            deposit_amount: 25_000,
        });
        const cart = openBeautyPosCart(tirnak, [tirnak, sacBoya], {
            saleLines: [
                {
                    saleId: '77777777-7777-4777-8777-777777777777',
                    ficheNo: 'BEA-FERHAT',
                    linkedAppointmentId: TORPI_ID,
                    name: 'TIRNAK',
                    itemId: 'svc-tirnak',
                    unitPrice: 25_000,
                    qty: 1,
                },
                {
                    saleId: '77777777-7777-4777-8777-777777777777',
                    ficheNo: 'BEA-FERHAT',
                    linkedAppointmentId: TORPI_ID,
                    name: 'BOYA',
                    itemId: 'svc-boya',
                    unitPrice: 50_000,
                    qty: 1,
                },
                {
                    saleId: '77777777-7777-4777-8777-777777777777',
                    ficheNo: 'BEA-FERHAT',
                    linkedAppointmentId: TORPI_ID,
                    isDepositSale: true,
                    name: 'REZERVASYON',
                    unitPrice: 25_000,
                    qty: 1,
                },
                {
                    saleId: '88888888-8888-4888-8888-888888888888',
                    ficheNo: 'BEA-20261024-1200',
                    linkedAppointmentId: SAC_ID,
                    name: 'SAC BOYA',
                    itemId: 'svc-sac',
                    unitPrice: 25_000,
                    qty: 1,
                },
            ],
        });
        expect(cart?.lines.map((line) => line.serviceName)).toEqual(['TIRNAK', 'BOYA']);
        expect(cart?.total).toBe(75_000);
        expect(cart?.prepaid).toBe(25_000);
        expect(cart?.remaining).toBe(50_000);
        expect(cart?.lines.some((line) => line.serviceName === 'REZERVASYON')).toBe(false);
        expect(cart?.lines.some((line) => line.serviceName === 'SAC BOYA')).toBe(false);
    });

    it('satış kalemi eksik olsa da aynı fişin randevu hizmeti düşmez', () => {
        const saleId = '55555555-5555-4555-8555-555555555555';
        const boyaId = '33333333-3333-4333-8333-333333333333';
        const tirnak = appointment({
            id: TORPI_ID,
            service_id: 'svc-tirnak',
            service_name: 'TIRNAK',
            appointment_time: '09:00',
            time: '09:00',
            total_price: 25_000,
            deposit_amount: 25_000,
            remainder_sale_id: saleId,
            remainder_sale_fiche_no: 'BEA-FERHAT-0900',
        });
        const boyaSame = appointment({
            id: boyaId,
            service_id: 'svc-boya',
            service_name: 'BOYA',
            appointment_time: '09:30',
            time: '09:30',
            total_price: 50_000,
            deposit_amount: 0,
            remainder_sale_id: saleId,
            remainder_sale_fiche_no: 'BEA-FERHAT-0900',
        });
        const cart = openBeautyPosCart(tirnak, [tirnak, boyaSame], {
            saleLines: [{
                saleId,
                ficheNo: 'BEA-FERHAT-0900',
                linkedAppointmentId: TORPI_ID,
                name: 'TIRNAK',
                itemId: 'svc-tirnak',
                unitPrice: 25_000,
                qty: 1,
            }],
        });
        expect(cart?.lines.map((line) => line.serviceName)).toEqual(['TIRNAK', 'BOYA']);
        expect(cart?.total).toBe(75_000);
        expect(cart?.prepaid).toBe(25_000);
        expect(cart?.remaining).toBe(50_000);
    });
});
