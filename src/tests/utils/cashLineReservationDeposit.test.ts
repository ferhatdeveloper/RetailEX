/**
 * cashLineReservationDeposit helper birim testleri — Bug 22 / Plan §6
 *
 * Senaryo: Kasa İşlemleri listesinde "Satış faturası" etiketiyle görünen
 * fişler aslında güzellik randevu peşinatı olabilir. Bu helper iki şeyi
 * ayrıştırır:
 *   1) `isBeautyFicheNo(ficheNo)` — `BEA-*` veya `BEAUTY-PESINAT-*` öneki
 *   2) `detectReservationDepositFiches(...)` — `sales.is_deposit=true` VEYA
 *      `notes` içinde `deposit:1` tag'i olan fişler
 *   3) `resolveCashLineTypeLabelShort(...)` — Tür kolonu etiketi (çok dilli)
 *
 * Regression kapsamı:
 *   - Boş / null / farklı format → tespit edilmez
 *   - Normal güzellik satışı (is_deposit=false) → rezervasyon peşinatı DEĞİL
 *   - Eski fiş (is_deposit kolonu yok ama notes'ta deposit:1) → tespit edilir
 *   - BEAUTY-PESINAT- ve BEA- önekleri ikisi de taranır
 *   - Büyük-küçük harf duyarsız eşleşme
 */
import { describe, expect, it } from 'vitest';
import {
    detectReservationDepositFiches,
    isBeautyFicheNo,
    notesHasDepositFlag,
    resolveCashLineTypeLabelShort,
} from '../../utils/cashLineReservationDeposit';

const tm = (k: string) => `[${k}]`;

describe('isBeautyFicheNo — fiş no öneki', () => {
    it('BEA-YYYY-XXXXX öneki true', () => {
        expect(isBeautyFicheNo('BEA-2026-MUS0WBJT')).toBe(true);
    });
    it('BEAUTY-PESINAT- öneki true', () => {
        expect(isBeautyFicheNo('BEAUTY-PESINAT-apt-1-20260930120000')).toBe(true);
    });
    it('Büyük-küçük harf duyarsız', () => {
        expect(isBeautyFicheNo('bea-2026-abc')).toBe(true);
        expect(isBeautyFicheNo('beauty-pesinat-x')).toBe(true);
    });
    it('Market/POS fiş no false', () => {
        expect(isBeautyFicheNo('ST-2026-001')).toBe(false);
        expect(isBeautyFicheNo('INV-001')).toBe(false);
        expect(isBeautyFicheNo('BEAUTY-REMAINDER-apt-1')).toBe(false); // kalan ödeme
        expect(isBeautyFicheNo('THS-2026-XYZ')).toBe(false);
    });
    it('Boş / null / undefined false', () => {
        expect(isBeautyFicheNo('')).toBe(false);
        expect(isBeautyFicheNo(null)).toBe(false);
        expect(isBeautyFicheNo(undefined)).toBe(false);
    });
});

describe('notesHasDepositFlag — geriye dönük uyumluluk', () => {
    it('deposit:1 tag başta', () => {
        expect(notesHasDepositFlag('deposit:1')).toBe(true);
    });
    it('deposit:1 tag ortada (| ayraçlı)', () => {
        expect(notesHasDepositFlag('rex_appt:abc-123 | deposit:1')).toBe(true);
    });
    it('deposit:1 tag sonda', () => {
        expect(notesHasDepositFlag('Peşinat | deposit:1')).toBe(true);
    });
    it('Büyük-küçük harf duyarsız', () => {
        expect(notesHasDepositFlag('DEPOSIT:1')).toBe(true);
    });
    it('Sadece deposit:10 → false (substring match yok)', () => {
        // /deposit:1(?:[|]|$)/ → yalnızca :1 sonra | veya satır sonu
        expect(notesHasDepositFlag('deposit:10')).toBe(false);
    });
    it('Etiket yoksa false', () => {
        expect(notesHasDepositFlag('Normal satış')).toBe(false);
        expect(notesHasDepositFlag(null)).toBe(false);
    });
});

describe('detectReservationDepositFiches — sales JOIN sonrası set', () => {
    it('is_deposit=true olan BEA-* fiş → set\'e girer', () => {
        const out = detectReservationDepositFiches(
            ['BEA-2026-MUS0WBJT', 'ST-2026-001'],
            [
                { fiche_no: 'BEA-2026-MUS0WBJT', is_deposit: true, notes: 'Peşinat' },
            ],
        );
        expect(out.has('BEA-2026-MUS0WBJT')).toBe(true);
        expect(out.size).toBe(1);
    });

    it('is_deposit=false olan normal güzellik satışı → set\'e GİRMEZ', () => {
        const out = detectReservationDepositFiches(
            ['BEA-2026-MUS0WBJT'],
            [{ fiche_no: 'BEA-2026-MUS0WBJT', is_deposit: false, notes: 'STRONG POLISH' }],
        );
        expect(out.has('BEA-2026-MUS0WBJT')).toBe(false);
        expect(out.size).toBe(0);
    });

    it('Geriye dönük: kolon null, notes\'ta deposit:1 → set\'e girer (Bug 14)', () => {
        const out = detectReservationDepositFiches(
            ['BEA-2026-LEGACY'],
            [
                {
                    fiche_no: 'BEA-2026-LEGACY',
                    is_deposit: null,
                    notes: 'Peşinat | rex_appt:abc | deposit:1',
                },
            ],
        );
        expect(out.has('BEA-2026-LEGACY')).toBe(true);
    });

    it('BEAUTY-PESINAT-* öneki de taranır', () => {
        const out = detectReservationDepositFiches(
            ['BEAUTY-PESINAT-apt-1-20260930120000'],
            [
                {
                    fiche_no: 'BEAUTY-PESINAT-apt-1-20260930120000',
                    is_deposit: true,
                    notes: null,
                },
            ],
        );
        expect(out.has('BEAUTY-PESINAT-apt-1-20260930120000')).toBe(true);
    });

    it('BEAUTY-REMAINDER-* öneki (kalan ödeme) → rezervasyon peşinatı DEĞİL', () => {
        // Kalan ödeme satırı zaten kendi definition'ıyla gelir; bu helper
        // sadece peşinat ayrımı yapar. BEAUTY-REMAINDER öneki bu yüzden
        // ön-kapıdan elenir.
        const out = detectReservationDepositFiches(
            ['BEAUTY-REMAINDER-apt-1'],
            [{ fiche_no: 'BEAUTY-REMAINDER-apt-1', is_deposit: true, notes: null }],
        );
        expect(out.has('BEAUTY-REMAINDER-apt-1')).toBe(false);
    });

    it('Büyük-küçük harf duyarsız eşleşme (fiche_no)', () => {
        const out = detectReservationDepositFiches(
            ['BEA-2026-MUS0WBJT'],
            [{ fiche_no: 'bea-2026-mus0wbjt', is_deposit: true, notes: null }],
        );
        expect(out.has('BEA-2026-MUS0WBJT')).toBe(true);
    });

    it('Map girişi de kabul edilir', () => {
        const m = new Map<string, { fiche_no: string; is_deposit: boolean }>();
        m.set('BEA-2026-MUS0WBJT', { fiche_no: 'BEA-2026-MUS0WBJT', is_deposit: true });
        const out = detectReservationDepositFiches(['BEA-2026-MUS0WBJT'], m);
        expect(out.has('BEA-2026-MUS0WBJT')).toBe(true);
    });

    it('Boş liste / null satırlar → boş set', () => {
        expect(detectReservationDepositFiches([], []).size).toBe(0);
        expect(detectReservationDepositFiches(null as any, []).size).toBe(0);
        expect(detectReservationDepositFiches(['BEA-2026-X'], null as any).size).toBe(0);
    });
});

describe('resolveCashLineTypeLabelShort — Tür kolonu etiketi', () => {
    it('Rezervasyon peşinatı → "Rezervasyon Peşinatı" (öncelikli)', () => {
        // description "Satış faturası" olsa bile rezervasyon peşinatı etiketi
        // gelir; aksi halde kasiyer yanılır.
        const out = resolveCashLineTypeLabelShort(
            'KASA_GIRIS',
            'Satış faturası',
            true,
            tm,
        );
        expect(out).toBe('[cashTransactionTypeReservationDeposit]');
    });

    it('Rezervasyon peşinatı değilse açıklamaya göre fatura etiketi', () => {
        const out = resolveCashLineTypeLabelShort(
            'KASA_GIRIS',
            'Satış faturası — INV-001',
            false,
            tm,
        );
        expect(out).toBe('[cashSalesInvoice]');
    });

    it('Alış faturası', () => {
        const out = resolveCashLineTypeLabelShort('CH_ODEME', 'Alış faturası — INV-X', false, tm);
        expect(out).toBe('[cashPurchaseInvoice]');
    });

    it('Hizmet faturası (alınan / verilen)', () => {
        expect(
            resolveCashLineTypeLabelShort('KASA_GIRIS', 'Alınan hizmet faturası', false, tm),
        ).toBe('[cashReceivedServiceInvoice]');
        expect(
            resolveCashLineTypeLabelShort('CH_ODEME', 'Verilen hizmet faturası', false, tm),
        ).toBe('[cashGivenServiceInvoice]');
        // Alınan/Verilen eşleşmezse generic hizmet faturası
        expect(
            resolveCashLineTypeLabelShort('KASA_GIRIS', 'Hizmet faturası — X', false, tm),
        ).toBe('[cashServiceInvoice]');
    });

    it('islem_tipi sözlük eşlemesi', () => {
        expect(resolveCashLineTypeLabelShort('CH_TAHSILAT', '', false, tm)).toBe('[chCollection]');
        expect(resolveCashLineTypeLabelShort('KASA_GIRIS', '', false, tm)).toBe('[cashIn]');
        expect(resolveCashLineTypeLabelShort('KASA_CIKIS', '', false, tm)).toBe('[cashOut]');
        expect(resolveCashLineTypeLabelShort('GIDER_PUSULASI', '', false, tm)).toBe(
            '[expenseVoucher]',
        );
    });

    it('Tanımsız tip → ham değer', () => {
        expect(resolveCashLineTypeLabelShort('UNKNOWN_TYPE', '', false, tm)).toBe('UNKNOWN_TYPE');
    });
});
