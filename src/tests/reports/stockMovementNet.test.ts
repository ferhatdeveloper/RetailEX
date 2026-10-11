import { describe, it, expect } from 'vitest';
import { computeNetAmount, computeNetTotal } from '../../utils/stockMovementNet';

/**
 * Kullanıcı şikâyeti: "satinalma faturasi tutar yanlis fatura tutar 60, ama 10
 * indirim var net tutar 50 olmasi lazim". Bu testler, indirim sonrası net
 * tutarın doğru hesaplandığını ve dip toplamın brüt değil net üzerinden
 * olduğunu doğrular.
 */
describe('computeNetAmount (Hareket Dökümü)', () => {
    it('brüt 60k, indirim 10k → net 50k', () => {
        // DB'den gelen kayıt: unit_price=6000, qty=10, discount_amount=10000
        // gross_amount = 6000 * 10 = 60000, net = 60000 - 10000 = 50000
        const net = computeNetAmount({
            quantity: 10,
            unit_price: 6000,
            gross_amount: 60000,
            discount_amount: 10000,
        });
        expect(net).toBe(50000);
    });

    it('brüt 50k, indirim 0 → net 50k', () => {
        const net = computeNetAmount({
            quantity: 10,
            unit_price: 5000,
            gross_amount: 50000,
            discount_amount: 0,
        });
        expect(net).toBe(50000);
    });

    it('DB net_amount doluysa öncelikli (gross/discount yanlış olsa bile)', () => {
        const net = computeNetAmount({
            quantity: 10,
            unit_price: 6000,
            gross_amount: 60000,
            discount_amount: 0, // yanlış eksik
            net_amount: 50000, // gerçek net
        });
        expect(net).toBe(50000);
    });

    it('geriye uyumlu: gross_amount/discount yoksa qty*unit_price', () => {
        // eski slip (ambar fişi) — sadece unit_price ve quantity var
        const net = computeNetAmount({ quantity: 5, unit_price: 1000 });
        expect(net).toBe(5000);
    });

    it('negatif sonuç üretmez (indirim brütten büyükse 0 döner)', () => {
        const net = computeNetAmount({
            quantity: 10,
            unit_price: 1000,
            gross_amount: 10000,
            discount_amount: 99999,
        });
        expect(net).toBe(0);
    });

    it('Çıkış Tutar (sale): brüt 50k, indirim 0 → net 50k', () => {
        const net = computeNetAmount({
            quantity: 1,
            unit_price: 50000,
            gross_amount: 50000,
            discount_amount: 0,
        });
        expect(net).toBe(50000);
    });

    it('2 ondalık yuvarlama (50000.005 → 50000.01)', () => {
        const net = computeNetAmount({
            quantity: 1,
            unit_price: 50000.005,
            gross_amount: 50000.005,
            discount_amount: 0,
        });
        expect(net).toBe(50000.01);
    });
});

describe('computeNetTotal (dip toplam doğrulaması)', () => {
    it('kullanıcı şikâyeti: 4 satır × 50k net = 200k (dip 210k brüt YANLIŞ)', () => {
        const items = [
            { quantity: 10, unit_price: 5000, gross_amount: 60000, discount_amount: 10000 }, // 50k net
            { quantity: 10, unit_price: 5000, gross_amount: 50000, discount_amount: 0 },    // 50k net
            { quantity: 1, unit_price: 50000, gross_amount: 50000, discount_amount: 0 },    // 50k net
            { quantity: 1, unit_price: 50000, gross_amount: 50000, discount_amount: 0 },    // 50k net
        ];
        const total = computeNetTotal(items);
        expect(total).toBe(200000); // brüt toplam 210000 olurdu — yanlış
    });

    it('boş liste toplamı 0', () => {
        expect(computeNetTotal([])).toBe(0);
    });
});