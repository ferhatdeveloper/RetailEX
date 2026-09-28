import { describe, expect, it } from 'vitest';
import {
    aggregateInOutTotals,
    classifyStockLineDirection,
    collapseInOutTotalsRows,
    isInOutTotalsServiceLine,
    isSqlDateInInclusiveRange,
    sqlDateExclusiveUpperBound,
    stockLineAmount,
} from '../../utils/stockInOutTotals';

describe('stockInOutTotals — EL KREMI senaryosu', () => {
    it('Sarf giriş +50 / Satış çıkış 2 / Sarf giriş +10 — miktar ve tutar ayrı', () => {
        const rows = aggregateInOutTotals([
            {
                productId: 'elk-1',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                quantity: 50,
                unitPrice: 100,
                movementType: 'in',
                trcode: 1,
                sourceType: 'slip',
            },
            {
                productId: 'elk-1',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                quantity: -2,
                unitPrice: 250,
                ficheType: 'sales_invoice',
                movementType: 'out',
                trcode: 8,
                sourceType: 'invoice',
            },
            {
                productId: 'elk-1',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                quantity: 10,
                unitPrice: 100,
                movementType: 'in',
                trcode: 1,
                sourceType: 'slip',
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].inQty).toBe(60);
        expect(rows[0].outQty).toBe(2);
        expect(rows[0].inAmount).toBe(6000);
        expect(rows[0].outAmount).toBe(500);
        expect(rows[0].inAmount - rows[0].outAmount).not.toBe(rows[0].inAmount);
    });

    it('alış faturası giriş, satış faturası çıkış', () => {
        expect(classifyStockLineDirection({ ficheType: 'purchase_invoice' })).toBe('in');
        expect(classifyStockLineDirection({ ficheType: 'sales_invoice' })).toBe('out');
        expect(classifyStockLineDirection({ ficheType: 'hizmet' })).toBe('out');
        expect(classifyStockLineDirection({ ficheType: 'service' })).toBe('out');
        expect(classifyStockLineDirection({ movementType: 'in', trcode: 1 })).toBe('in');
        expect(classifyStockLineDirection({ movementType: 'price_change' })).toBe('skip');
    });

    it('bitiş günü (2026-09-18) dahil; ertesi gün hariç', () => {
        expect(isSqlDateInInclusiveRange('2026-09-18', '2026-09-01', '2026-09-18')).toBe(true);
        expect(isSqlDateInInclusiveRange('2026-09-18T15:40:00.000Z', '2026-09-01', '2026-09-18')).toBe(true);
        expect(isSqlDateInInclusiveRange('2026-09-19', '2026-09-01', '2026-09-18')).toBe(false);
        expect(sqlDateExclusiveUpperBound('2026-09-18')).toBe('2026-09-19');
    });

    it('UUID ve kod aynı ürünü tek satırda birleştirir', () => {
        const merged = collapseInOutTotalsRows([
            {
                productId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                inQty: 50,
                inAmount: 5000,
                outQty: 0,
                outAmount: 0,
                purchaseReturnQty: 0,
                purchaseReturnAmount: 0,
                salesReturnQty: 0,
                salesReturnAmount: 0,
            },
            {
                productId: 'ELKREMI',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                inQty: 10,
                inAmount: 1000,
                outQty: 2,
                outAmount: 500,
                purchaseReturnQty: 1,
                purchaseReturnAmount: 100,
                salesReturnQty: 2,
                salesReturnAmount: 400,
            },
        ]);
        expect(merged).toHaveLength(1);
        expect(merged[0].inQty).toBe(60);
        expect(merged[0].outQty).toBe(2);
        expect(merged[0].inAmount).toBe(6000);
        expect(merged[0].outAmount).toBe(500);
        expect(merged[0].purchaseReturnQty).toBe(1);
        expect(merged[0].purchaseReturnAmount).toBe(100);
        expect(merged[0].salesReturnQty).toBe(2);
        expect(merged[0].salesReturnAmount).toBe(400);
    });

    it('alış iadesi ve satış iadesini ayrı kolonlarda toplar', () => {
        const rows = aggregateInOutTotals([
            {
                productId: 'p1',
                productCode: 'SABUN',
                productName: 'SABUN',
                quantity: 11,
                unitPrice: 5000,
                ficheType: 'purchase_invoice',
                trcode: 1,
            },
            {
                productId: 'p1',
                productCode: 'SABUN',
                productName: 'SABUN',
                quantity: 2,
                unitPrice: 5000,
                ficheType: 'return_invoice',
                trcode: 6,
                movementType: 'out',
            },
            {
                productId: 'p1',
                productCode: 'SABUN',
                productName: 'SABUN',
                quantity: 4,
                unitPrice: 15000,
                ficheType: 'sales_invoice',
                trcode: 8,
            },
            {
                productId: 'p1',
                productCode: 'SABUN',
                productName: 'SABUN',
                quantity: 1,
                unitPrice: 15000,
                ficheType: 'return_invoice',
                trcode: 3,
                movementType: 'in',
            },
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].purchaseReturnQty).toBe(2);
        expect(rows[0].purchaseReturnAmount).toBe(10000);
        expect(rows[0].salesReturnQty).toBe(1);
        expect(rows[0].salesReturnAmount).toBe(15000);
        expect(rows[0].inQty).toBe(12); // alış 11 + satış iade 1
        expect(rows[0].outQty).toBe(6); // satış 4 + alış iade 2
    });

    it('tutarları tek toplamda netlemez', () => {
        expect(stockLineAmount({ quantity: 50, unitPrice: 10 })).toBe(500);
        const rows = aggregateInOutTotals([
            { productId: 'a', quantity: 10, totalAmount: 1000, movementType: 'in' },
            { productId: 'a', quantity: 3, totalAmount: 300, movementType: 'out' },
        ]);
        expect(rows[0].inAmount).toBe(1000);
        expect(rows[0].outAmount).toBe(300);
    });

    it('hizmet satırlarını (item_type / beauty / material_type) dışlar', () => {
        expect(
            isInOutTotalsServiceLine({
                productId: 'beauty-service-Sac',
                productName: 'SAC BOYAMA',
                itemType: 'service',
                ficheType: 'beauty_sale',
                quantity: 1,
            }),
        ).toBe(true);
        expect(
            isInOutTotalsServiceLine({
                productId: 'svc-1',
                productName: 'KAŞ ALMA',
                itemType: 'Hizmet',
                ficheType: 'pos',
                quantity: 1,
            }),
        ).toBe(true);
        expect(
            isInOutTotalsServiceLine({
                productId: 'pkg-1',
                productName: 'Paket',
                itemType: 'package',
                quantity: 1,
            }),
        ).toBe(true);
        expect(
            isInOutTotalsServiceLine({
                productId: 'h-1',
                productName: 'Danışmanlık',
                ficheType: 'hizmet',
                quantity: 1,
            }),
        ).toBe(true);
        expect(
            isInOutTotalsServiceLine({
                productId: 'p-1',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                materialType: 'service',
                ficheType: 'sales_invoice',
                quantity: 1,
            }),
        ).toBe(true);
        expect(
            isInOutTotalsServiceLine({
                productId: 'p-1',
                productCode: 'ELKREMI',
                productName: 'EL KREMI',
                itemType: 'Malzeme',
                ficheType: 'sales_invoice',
                quantity: 1,
            }),
        ).toBe(false);

        // Regresyon: item_type boş/Malzeme + güzellik kart UUID (katalogda ürün yok)
        const beautySvcId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001';
        const beautyKeys = new Set([beautySvcId]);
        expect(
            isInOutTotalsServiceLine(
                {
                    productId: beautySvcId,
                    productName: 'SAÇ BOYAMA',
                    itemType: 'Malzeme',
                    ficheType: 'sales_invoice',
                    quantity: 3,
                },
                beautyKeys,
            ),
        ).toBe(true);
        expect(
            isInOutTotalsServiceLine({
                productId: beautySvcId,
                productName: 'KAŞ ALMA',
                isService: true,
                ficheType: 'pos',
                quantity: 2,
            }),
        ).toBe(true);

        const rows = aggregateInOutTotals(
            [
                {
                    productId: 'p-1',
                    productCode: 'ELKREMI',
                    productName: 'EL KREMI',
                    quantity: 2,
                    totalAmount: 500,
                    ficheType: 'sales_invoice',
                    movementType: 'out',
                    itemType: 'Malzeme',
                },
                {
                    productId: 'beauty-service-Sac',
                    productName: 'SAC BOYAMA',
                    quantity: 1,
                    totalAmount: 15000,
                    ficheType: 'beauty_sale',
                    movementType: 'out',
                    itemType: 'service',
                },
                {
                    productId: 'kas-1',
                    productName: 'KAŞ ALMA',
                    quantity: 1,
                    totalAmount: 5000,
                    ficheType: 'beauty_sale',
                    movementType: 'out',
                    itemType: 'Hizmet',
                },
                {
                    productId: beautySvcId,
                    productName: 'SAÇ BOYAMA',
                    quantity: 3,
                    totalAmount: 135000,
                    ficheType: 'sales_invoice',
                    movementType: 'out',
                    itemType: 'Malzeme',
                },
            ],
            beautyKeys,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].productCode).toBe('ELKREMI');
        expect(rows[0].outQty).toBe(2);
        expect(rows[0].outAmount).toBe(500);
    });

    it('serviceKeys ile güzellik UUID (item_type Malzeme) dışlanır', () => {
        const beautyId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const keys = new Set([beautyId]);
        expect(
            isInOutTotalsServiceLine(
                {
                    productId: beautyId,
                    productName: 'SAÇ BOYAMA',
                    itemType: 'Malzeme',
                    ficheType: 'sales_invoice',
                    quantity: 1,
                },
                keys,
            ),
        ).toBe(true);
        const rows = aggregateInOutTotals(
            [
                {
                    productId: 'p-1',
                    productCode: '01',
                    productName: 'SABUN',
                    quantity: 1,
                    totalAmount: 100,
                    ficheType: 'sales_invoice',
                    movementType: 'out',
                    itemType: 'Malzeme',
                },
                {
                    productId: beautyId,
                    productName: 'SAÇ BOYAMA',
                    quantity: 1,
                    totalAmount: 15000,
                    ficheType: 'sales_invoice',
                    movementType: 'out',
                    itemType: 'Malzeme',
                },
            ],
            { serviceKeys: keys },
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].productCode).toBe('01');
    });

    it('includeServices true iken hizmet satırları da gelir', () => {
        const rows = aggregateInOutTotals(
            [
                {
                    productId: 'p-1',
                    productCode: 'ELKREMI',
                    productName: 'EL KREMI',
                    quantity: 2,
                    totalAmount: 500,
                    ficheType: 'sales_invoice',
                    movementType: 'out',
                    itemType: 'Malzeme',
                },
                {
                    productId: 'beauty-service-Sac',
                    productName: 'SAÇ BOYAMA',
                    quantity: 1,
                    totalAmount: 15000,
                    ficheType: 'beauty_sale',
                    movementType: 'out',
                    itemType: 'service',
                },
            ],
            { includeServices: true },
        );
        expect(rows).toHaveLength(2);
        const svc = rows.find((r) => r.isService);
        expect(svc?.productName).toBe('SAÇ BOYAMA');
        expect(svc?.outAmount).toBe(15000);
    });
});
