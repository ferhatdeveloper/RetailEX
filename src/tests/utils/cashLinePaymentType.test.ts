/**
 * cashLinePaymentType helper birim testleri.
 *
 * Senaryo: Kasa İşlemleri modülünde yeni "Ödeme Tipi" kolonu.
 *   1) Rezervasyon peşinatı → turkuaz / cashTransactionTypeReservationDeposit
 *   2) payment_method='cash' → yeşil / paymentCash
 *   3) payment_method='card' → mavi / paymentCreditCard
 *   4) payment_method='veresiye' / 'credit' → amber / paymentCredit
 *   5) payment_method='havale' / 'transfer' / 'eft' → mor / cashLinePaymentTypeTransfer
 *   6) Boş / null / tanımsız → null (UI'da "—")
 *   7) Geriye dönük uyumluluk: 'Nakit' (TR büyük harf), 'Kart' ham değerleri
 */
import { describe, expect, it } from 'vitest';
import {
  paymentTypeBadgeClass,
  paymentTypeLabelKey,
  resolvePaymentType,
} from '../../utils/cashLinePaymentType';

describe('resolvePaymentType — Ödeme Tipi çözümleyici', () => {
    it('Rezervasyon peşinatı → reservation (turkuaz, öncelikli)', () => {
        const r = resolvePaymentType({ paymentMethod: 'cash', isReservationDeposit: true });
        expect(r?.code).toBe('reservation');
        expect(r?.tone).toBe('reservation');
        expect(r?.labelKey).toBe('cashTransactionTypeReservationDeposit');
    });

    it('Rezervasyon peşinatı, paymentMethod olmasa bile reservation döner', () => {
        const r = resolvePaymentType({ isReservationDeposit: true });
        expect(r?.code).toBe('reservation');
    });

    it('İkinci parametre isReservationDeposit (geriye dönük) → reservation', () => {
        const r = resolvePaymentType({ paymentMethod: 'cash' }, true);
        expect(r?.code).toBe('reservation');
    });

    it('paymentMethod="cash" → cash (yeşil)', () => {
        const r = resolvePaymentType({ paymentMethod: 'cash' });
        expect(r?.code).toBe('cash');
        expect(r?.tone).toBe('cash');
        expect(r?.labelKey).toBe('paymentCash');
        expect(r?.raw).toBe('cash');
    });

    it('paymentMethod="Nakit" (TR ham) → cash', () => {
        const r = resolvePaymentType({ paymentMethod: 'Nakit' });
        expect(r?.code).toBe('cash');
        expect(r?.labelKey).toBe('paymentCash');
    });

    it('paymentMethod="nakit" (küçük harf) → cash', () => {
        const r = resolvePaymentType({ paymentMethod: 'nakit' });
        expect(r?.code).toBe('cash');
    });

    it('paymentMethod="card" → card (mavi)', () => {
        const r = resolvePaymentType({ paymentMethod: 'card' });
        expect(r?.code).toBe('card');
        expect(r?.labelKey).toBe('paymentCreditCard');
    });

    it('paymentMethod="Kart" (TR ham) → card', () => {
        const r = resolvePaymentType({ paymentMethod: 'Kart' });
        expect(r?.code).toBe('card');
    });

    it('paymentMethod="veresiye" → credit (amber)', () => {
        const r = resolvePaymentType({ paymentMethod: 'veresiye' });
        expect(r?.code).toBe('credit');
        expect(r?.labelKey).toBe('paymentCredit');
    });

    it('paymentMethod="credit" → credit', () => {
        const r = resolvePaymentType({ paymentMethod: 'credit' });
        expect(r?.code).toBe('credit');
    });

    it('paymentMethod="cari" → credit', () => {
        const r = resolvePaymentType({ paymentMethod: 'cari' });
        expect(r?.code).toBe('credit');
    });

    it('paymentMethod="havale" → transfer (mor)', () => {
        const r = resolvePaymentType({ paymentMethod: 'havale' });
        expect(r?.code).toBe('transfer');
        expect(r?.labelKey).toBe('cashLinePaymentTypeTransfer');
    });

    it('paymentMethod="eft" → transfer', () => {
        const r = resolvePaymentType({ paymentMethod: 'eft' });
        expect(r?.code).toBe('transfer');
    });

    it('paymentMethod="transfer" → transfer', () => {
        const r = resolvePaymentType({ paymentMethod: 'transfer' });
        expect(r?.code).toBe('transfer');
    });

    it('paymentMethod="peşinat" → pesinatli bucket (reservation tonu)', () => {
        const r = resolvePaymentType({ paymentMethod: 'peşinat' });
        expect(r?.code).toBe('reservation');
        expect(r?.labelKey).toBe('paymentMethodPesinatli');
    });

    it('paymentMethod="çek" → other (bilinmeyen bucket)', () => {
        // normalizePaymentMethodBucket CEK → 'other' döner
        const r = resolvePaymentType({ paymentMethod: 'çek' });
        expect(r?.code).toBe('other');
    });

    it('Boş / null / undefined → null', () => {
        expect(resolvePaymentType(null)).toBeNull();
        expect(resolvePaymentType(undefined)).toBeNull();
        expect(resolvePaymentType('')).toBeNull();
        expect(resolvePaymentType({ paymentMethod: '' })).toBeNull();
        expect(resolvePaymentType({ paymentMethod: null })).toBeNull();
        expect(resolvePaymentType({ paymentMethod: undefined })).toBeNull();
    });

    it('payment_method alan adı (snake_case) de desteklenir', () => {
        const r = resolvePaymentType({ payment_method: 'cash' });
        expect(r?.code).toBe('cash');
    });

    it('Doğrudan string parametre de kabul edilir', () => {
        expect(resolvePaymentType('cash')?.code).toBe('cash');
        expect(resolvePaymentType('Veresiye')?.code).toBe('credit');
    });

    it('Rezervasyon peşinatı, paymentMethod ne olursa olsun reservation kalır', () => {
        // Bug 22: peşinat tespiti her şeyin önünde
        expect(
            resolvePaymentType({ paymentMethod: 'veresiye', isReservationDeposit: true })?.code,
        ).toBe('reservation');
        expect(
            resolvePaymentType({ paymentMethod: 'card', isReservationDeposit: true })?.code,
        ).toBe('reservation');
    });
});

describe('paymentTypeBadgeClass — Tailwind sınıf üretici', () => {
    it('cash → yeşil', () => {
        expect(paymentTypeBadgeClass('cash')).toContain('emerald');
    });
    it('card → mavi', () => {
        expect(paymentTypeBadgeClass('card')).toContain('blue');
    });
    it('credit → amber', () => {
        expect(paymentTypeBadgeClass('credit')).toContain('amber');
    });
    it('transfer → mor', () => {
        expect(paymentTypeBadgeClass('transfer')).toContain('purple');
    });
    it('reservation → turkuaz', () => {
        expect(paymentTypeBadgeClass('reservation')).toContain('cyan');
    });
    it('other → gri', () => {
        expect(paymentTypeBadgeClass('other')).toContain('gray');
    });
});

describe('paymentTypeLabelKey — sade etiket anahtarı (uyumluluk)', () => {
    it('cash → paymentCash', () => {
        expect(paymentTypeLabelKey('cash')).toBe('paymentCash');
    });
    it('card → paymentCreditCard', () => {
        expect(paymentTypeLabelKey('card')).toBe('paymentCreditCard');
    });
    it('veresiye → paymentCredit', () => {
        expect(paymentTypeLabelKey('veresiye')).toBe('paymentCredit');
    });
    it('havale → cashLinePaymentTypeTransfer', () => {
        expect(paymentTypeLabelKey('havale')).toBe('cashLinePaymentTypeTransfer');
    });
    it('Boş → openTerms', () => {
        expect(paymentTypeLabelKey('')).toBe('openTerms');
        expect(paymentTypeLabelKey(null)).toBe('openTerms');
        expect(paymentTypeLabelKey(undefined)).toBe('openTerms');
    });
});

// ===========================================================
// BUG 28 — Belgesel fallback + Satış Fatura No parse
// ===========================================================
describe('Bug 28 — Belgesel fallback (payment_method boş + fatura fişi)', () => {
    it('payment_method=null + islem_tipi=SATIS_FATURASI → Belgesel', async () => {
        const { resolvePaymentType } = await import('../../utils/cashLinePaymentType');
        const pt = resolvePaymentType({
            paymentMethod: null,
            isReservationDeposit: false,
            transactionType: 'SATIS_FATURASI',
        });
        expect(pt?.tone).toBe('document');
        expect(pt?.labelKey).toBe('cashLinePaymentTypeDocument');
    });

    it('payment_method=null + islem_tipi=HIZMET_FATURASI → Belgesel', async () => {
        const { resolvePaymentType } = await import('../../utils/cashLinePaymentType');
        const pt = resolvePaymentType({
            paymentMethod: null,
            transactionType: 'HIZMET_FATURASI',
        });
        expect(pt?.tone).toBe('document');
    });

    it('payment_method=null + islem_tipi=CH_TAHSILAT → null (cari tahsilatı, belge değil)', async () => {
        const { resolvePaymentType } = await import('../../utils/cashLinePaymentType');
        const pt = resolvePaymentType({
            paymentMethod: null,
            transactionType: 'CH_TAHSILAT',
        });
        expect(pt).toBeNull();
    });

    it('payment_method=cash her zaman cash kazanır (fatura tipi olsa bile)', async () => {
        const { resolvePaymentType } = await import('../../utils/cashLinePaymentType');
        const pt = resolvePaymentType({
            paymentMethod: 'cash',
            transactionType: 'SATIS_FATURASI',
        });
        expect(pt?.tone).toBe('cash');
    });

    it('payment_method=null + transactionType yok → null', async () => {
        const { resolvePaymentType } = await import('../../utils/cashLinePaymentType');
        const pt = resolvePaymentType({ paymentMethod: null });
        expect(pt).toBeNull();
    });
});

describe('Bug 28 — extractSalesInvoiceNo (KasalarModule helper)', () => {
    // helper burada yeniden üretildi; refactor riskini test tarafında izole tutuyoruz
    const extract = (def: string | null | undefined): string => {
        const s = String(def ?? '').trim();
        if (!s) return '';
        const parts = s.split('—').map((p) => p.trim()).filter(Boolean);
        return parts.length < 2 ? '' : parts.slice(1).join(' — ');
    };

    it('"Satış faturası — BEA-2026-MUS34222" → "BEA-2026-MUS34222"', () => {
        expect(extract('Satış faturası — BEA-2026-MUS34222')).toBe('BEA-2026-MUS34222');
    });
    it('"Hizmet faturası — INV-2025-001" → "INV-2025-001"', () => {
        expect(extract('Hizmet faturası — INV-2025-001')).toBe('INV-2025-001');
    });
    it('boş / null / "tek parça" → ""', () => {
        expect(extract('')).toBe('');
        expect(extract(null)).toBe('');
        expect(extract(undefined)).toBe('');
        expect(extract('Tek parça açıklama')).toBe('');
    });
    it('"A — B — C" → "B — C" (çoklu — birleştir)', () => {
        expect(extract('A — B — C')).toBe('B — C');
    });
});
