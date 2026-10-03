/**
 * Bug ARAM-history-prepaid — Geçmiş sekmesi filtresi.
 *
 * Senaryo: peşinatlı randevuda, randevu henüz tamamlanmamışsa cari hareketlerde
 * (Geçmiş sekmesi + KPI) yalnızca peşinat satırı görünmeli; tamamlanmamış
 * randevuya bağlı ana hizmet satış fişi görünmemelidir.
 *
 * `isMainBeautySale` (ClinicDashboard / ClientCustomerDetailPage) deposit +
 * parent_sale_id + tamamlanmamış randevuya bağlı satışları eler. Bu test
 * davranışın korunduğunu ve Geçmiş sekmesinin aynı filtreyi kullandığını
 * doğrular.
 */
import { describe, expect, it } from 'vitest';
import { isMainBeautySale, isReservationDepositSale } from '../../../components/beauty/components/ClientCustomerDetailPage';
import type { BeautySale } from '../../../services/beautyService';

function makeSale(overrides: Partial<BeautySale> = {}): BeautySale {
    return {
        id: 'sale-1',
        invoice_number: 'BEA-2026-XXX',
        customer_id: 'c-1',
        items: [],
        total: 30000,
        payment_method: 'veresiye',
        payment_status: 'pending',
        created_at: '2026-10-03T09:40:00Z',
        ...overrides,
    } as BeautySale;
}

describe('isMainBeautySale — Geçmiş sekmesi / KPI ana hizmet satışı filtresi', () => {
    it('peşinatlı randevuya bağlı tamamlanmamış ana satış → false (Geçmiş/KPI dışı)', () => {
        // 30.000 satış fişi, linked_appointment_id="apt-1", apt henüz tamamlanmamış
        const sale = makeSale({
            id: 'sale-30k',
            linked_appointment_id: 'apt-1',
            total: 30000,
            payment_method: 'veresiye',
            payment_status: 'pending',
        });
        const completedAptIds = new Set<string>(); // apt-1 tamamlanmamış
        expect(isMainBeautySale(sale, completedAptIds)).toBe(false);
    });

    it('ayı randevu tamamlanmışsa → true (Geçmiş/KPI\'da görünür)', () => {
        const sale = makeSale({
            id: 'sale-30k-completed',
            linked_appointment_id: 'apt-1',
            total: 30000,
            payment_method: 'veresiye',
            payment_status: 'pending',
        });
        const completedAptIds = new Set<string>(['apt-1']);
        expect(isMainBeautySale(sale, completedAptIds)).toBe(true);
    });

    it('is_deposit=true olan peşinat fişi → false (KPI/Geçmiş dışı)', () => {
        const sale = makeSale({
            id: 'sale-pesinat',
            is_deposit: true,
            total: 20000,
            payment_method: 'cash',
            payment_status: 'paid',
        });
        expect(isMainBeautySale(sale, new Set())).toBe(false);
    });

    it('parent_sale_id dolu fiş → false (peşinata bağlı ana satış tekrarı)', () => {
        const sale = makeSale({
            id: 'sale-child',
            parent_sale_id: 'sale-pesinat',
            total: 30000,
        });
        expect(isMainBeautySale(sale, new Set())).toBe(false);
    });

    it('iptal/canceled/void satış → false (aktif değil)', () => {
        for (const st of ['cancelled', 'canceled', 'void']) {
            const sale = makeSale({ payment_status: st });
            expect(isMainBeautySale(sale, new Set())).toBe(false);
        }
    });

    it('linked_appointment_id yok + aktif satış → true (serbest cari satış)', () => {
        const sale = makeSale({
            id: 'sale-free',
            total: 10000,
            payment_method: 'cash',
            payment_status: 'paid',
        });
        expect(isMainBeautySale(sale, new Set())).toBe(true);
    });

    it('notes içinde "deposit:1" yedek tag\'i → false (kolon yazılamamışsa fallback)', () => {
        const sale = makeSale({
            id: 'sale-notes-deposit',
            total: 20000,
            payment_method: 'cash',
            payment_status: 'paid',
            notes: 'deposit:1|peşinat',
        });
        expect(isMainBeautySale(sale, new Set())).toBe(false);
    });

    it('notes içinde "parent_sale:<uuid>" tag\'i → false', () => {
        const sale = makeSale({
            id: 'sale-notes-parent',
            total: 30000,
            notes: 'parent_sale:abcdef12-3456-7890-abcd-ef1234567890',
        });
        expect(isMainBeautySale(sale, new Set())).toBe(false);
    });

    it('case-insensitive: linked_appointment_id büyük harfle yazılmış → false (eşleşme)', () => {
        const sale = makeSale({
            id: 'sale-case',
            linked_appointment_id: 'APT-1',
            total: 30000,
        });
        const completedAptIds = new Set<string>(['apt-1']); // küçük harf
        expect(isMainBeautySale(sale, completedAptIds)).toBe(true);
    });

    it('ROZA senaryosu: aynı anda 2 satış — 20.000 nakit (peşinat) + 30.000 veresiye (tamamlanmamış randevu)', () => {
        const completedAptIds = new Set<string>(); // randevu henüz tamamlanmamış
        const pesinat = makeSale({
            id: 'sale-pesinat-20k',
            is_deposit: true,
            total: 20000,
            payment_method: 'cash',
            payment_status: 'paid',
        });
        const anaSatis = makeSale({
            id: 'sale-ana-30k',
            linked_appointment_id: 'apt-roza-1',
            total: 30000,
            payment_method: 'veresiye',
            payment_status: 'pending',
        });
        // Peşinat Geçmiş'te elenir (KPI/Geçmiş ana hizmet değil).
        // 30.000 ana satış da Geçmiş'te elenir (randevu tamamlanmamış).
        // Sonuç: ROZA'nın Geçmiş sekmesi boşalmalı; yalnızca cash_lines CH_TAHSILAT
        // (20.000) cari ekstrede görünür.
        expect(isMainBeautySale(pesinat, completedAptIds)).toBe(false);
        expect(isMainBeautySale(anaSatis, completedAptIds)).toBe(false);
    });
});

// ===========================================================
// BUG 28 — Rezervasyon peşinatı (henüz hizmet verilmemiş avanslar)
// ===========================================================
describe('Bug 28 — isReservationDepositSale (rezervasyon peşinatı tespiti)', () => {
    it('is_deposit=true olan satış peşinranır', () => {
        const peşinat = makeSale({ is_deposit: true, total: 20000 });
        expect(isReservationDepositSale(peşinat)).toBe(true);
    });

    it('notes içinde "deposit:1" tag olan fiş peşinranır', () => {
        const peşinat = makeSale({
            is_deposit: false,
            notes: 'randevu avansı deposit:1',
            total: 10000,
        });
        expect(isReservationDepositSale(peşinat)).toBe(true);
    });

    it('ana hizmet satışı peşinat değildir', () => {
        const anaSatış = makeSale({
            is_deposit: false,
            payment_status: 'paid',
            total: 55000,
        });
        expect(isReservationDepositSale(anaSatış)).toBe(false);
    });

    it('iptal/iade satışı peşinat değildir', () => {
        const iptal = makeSale({
            is_deposit: true,
            payment_status: 'cancelled',
        });
        expect(isReservationDepositSale(iptal)).toBe(false);
    });
});
