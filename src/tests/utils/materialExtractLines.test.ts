import { describe, expect, it } from 'vitest';
import {
    extractRunningFooter,
    isWithinInclusiveDayRange,
    prepareMaterialExtractLines,
    projectMaterialExtractLines,
    sourceFromMovementRow,
    sumMaterialExtract,
    type MaterialExtractSourceLine,
} from '../../utils/materialExtractLines';

/**
 * SABUN 0000001, 25.10.2026–26.10.2026.
 * Kart ve sağ tık stok hareketleri: giriş 11 / 65.000, çıkış 11 / 99.000, net 0.
 * 00005 yalnızca ad eşlemesi; stok fişi değil.
 */
function sabunLines(): MaterialExtractSourceLine[] {
    const product = { product_id: 'sabun', product_code: '0000001' };
    return [
        {
            ...product,
            id: 'alis-00001',
            quantity: 10,
            unit_price: 5_000,
            gross_amount: 50_000,
            discount_amount: 0,
            net_amount: 50_000,
            movement_type: 'in',
            fiche_type: 'purchase_invoice',
            trcode: 1,
            document_no: '00001',
            movement_date: '2026-10-25T22:18:00',
        },
        {
            ...product,
            id: 'satis-00002',
            quantity: 2,
            unit_price: 15_000,
            gross_amount: 30_000,
            discount_amount: 0,
            net_amount: 30_000,
            movement_type: 'out',
            fiche_type: 'sales_invoice',
            trcode: 8,
            document_no: 'BEA-2026-00002',
            movement_date: '2026-10-25T22:19:00',
        },
        {
            ...product,
            id: 'iade-00002',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 0,
            net_amount: 15_000,
            movement_type: 'in',
            fiche_type: 'return_invoice',
            trcode: 3,
            document_no: '00002',
            movement_date: '2026-10-25T22:20:00',
        },
        {
            ...product,
            id: 'iade-00002',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 0,
            net_amount: 15_000,
            movement_type: 'out',
            fiche_type: 'return_invoice',
            trcode: 3,
            document_no: '00002',
            movement_date: '2026-10-25T22:20:00',
        },
        {
            ...product,
            id: 'alis-iade-00004',
            quantity: 5,
            unit_price: 5_000,
            gross_amount: 25_000,
            discount_amount: 0,
            net_amount: 25_000,
            movement_type: 'in',
            fiche_type: 'return_invoice',
            trcode: 6,
            document_no: '00004',
            movement_date: '2026-10-25T23:01:00',
        },
        {
            ...product,
            id: 'satis-00009',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 1_000,
            net_amount: 14_000,
            movement_type: 'out',
            fiche_type: 'sales_invoice',
            trcode: 8,
            document_no: 'BEA-2026-00009',
            movement_date: '2026-10-26T11:08:00',
        },
        {
            ...product,
            id: 'satis-00012',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 0,
            net_amount: 15_000,
            movement_type: 'out',
            fiche_type: 'sales_invoice',
            trcode: 8,
            document_no: 'BEA-2026-00012',
            movement_date: '2026-10-26T11:27:00',
        },
        {
            ...product,
            id: 'satis-00013',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 5_000,
            net_amount: 10_000,
            movement_type: 'out',
            fiche_type: 'sales_invoice',
            trcode: 8,
            document_no: 'BEA-2026-00013',
            movement_date: '2026-10-26T11:42:00',
        },
        {
            ...product,
            id: 'satis-00014',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 10_000,
            net_amount: 5_000,
            movement_type: 'out',
            fiche_type: 'sales_invoice',
            trcode: 8,
            document_no: 'BEA-2026-00014',
            movement_date: '2026-10-26T12:09:00',
        },
        {
            id: 'iade-00005',
            quantity: 1,
            unit_price: 15_000,
            gross_amount: 15_000,
            discount_amount: 0,
            net_amount: 15_000,
            movement_type: 'in',
            fiche_type: 'return_invoice',
            trcode: 3,
            document_no: '00005',
            movement_date: '2026-10-26T12:14:00',
            product_id: 'sabun',
            product_code: '0000001',
            matchedByName: true,
        },
    ];
}

describe('malzeme ekstresi SABUN dip toplamı', () => {
    const rows = projectMaterialExtractLines(prepareMaterialExtractLines(sabunLines()));
    const totals = sumMaterialExtract(rows);

    it('giriş 11 / 65000, çıkış 11 / 99000, net 0', () => {
        expect(rows).toHaveLength(8);
        expect(totals.inQty).toBe(11);
        expect(totals.inAmt).toBe(65_000);
        expect(totals.outQty).toBe(11);
        expect(totals.outAmt).toBe(99_000);
        expect(rows.map((row) => row.id)).not.toContain('iade-00005');
    });

    it('satış satırı brüt 15000 indirim 1000 ise çıkış tutar 14000, birim fiyat 15000 kalır', () => {
        const sale = rows.find((row) => row.id === 'satis-00009');
        expect(sale).toMatchObject({
            side: 'out',
            quantity: 1,
            unitPrice: 15_000,
            outQty: 1,
            outAmt: 14_000,
            inQty: 0,
            inAmt: 0,
        });
    });

    it('satış iadesi 00002 giriş 1 / 15000; aynı fişin kopyası ve ad eşlemesi 00005 düşer', () => {
        const returns = rows.filter((row) => row.id === 'iade-00002' || row.id.startsWith('iade-00002'));
        expect(returns).toHaveLength(1);
        expect(returns[0]).toMatchObject({
            side: 'in',
            inQty: 1,
            inAmt: 15_000,
            outQty: 0,
            outAmt: 0,
        });
        expect(rows.some((row) => row.id === 'iade-00005')).toBe(false);
    });

    it('alış iadesi çıkış 5 / 25000', () => {
        const purchaseReturn = rows.find((row) => row.id === 'alis-iade-00004');
        expect(purchaseReturn).toMatchObject({
            side: 'out',
            outQty: 5,
            outAmt: 25_000,
            inQty: 0,
            inAmt: 0,
        });
    });

    it('kalan çıkışta azalır, satış iadesinde artar; dip toplam son bakiyedir', () => {
        expect(rows.map((row) => row.runningBalance)).toEqual([10, 8, 9, 4, 3, 2, 1, 0]);
        expect(rows.map((row) => row.outQty)).toEqual([0, 2, 0, 5, 1, 1, 1, 1]);
        expect(totals.closingBalance).toBe(0);
        expect(rows[rows.length - 1].runningBalance).toBe(0);
        expect(extractRunningFooter(rows)).toBe(0);
        const balanceSum = rows.reduce((acc, row) => acc + row.runningBalance, 0);
        expect(balanceSum).not.toBe(totals.closingBalance);
        expect(totals.inQty - totals.outQty).toBe(totals.closingBalance);
    });

    it('satış netleri 5000, 10000, 15000, 14000 ve 30000 bir kez', () => {
        expect(rows.find((row) => row.id === 'satis-00014')?.outAmt).toBe(5_000);
        expect(rows.find((row) => row.id === 'satis-00013')?.outAmt).toBe(10_000);
        expect(rows.find((row) => row.id === 'satis-00012')?.outAmt).toBe(15_000);
        expect(rows.find((row) => row.id === 'satis-00009')?.outAmt).toBe(14_000);
        expect(rows.find((row) => row.id === 'satis-00002')?.outAmt).toBe(30_000);
    });
});

describe('ad eşlemesi stok kümesine girmez', () => {
    it('kimliği yapıştırılmış 00005 ve kimliksiz satır düşer', () => {
        const kept = prepareMaterialExtractLines([
            sourceFromMovementRow({
                id: 'iade-00005',
                quantity: 1,
                unit_price: 15_000,
                extract_net_amount: 15_000,
                movement_type: 'in',
                fiche_type: 'return_invoice',
                trcode: 3,
                document_no: '00005',
                product_id: 'sabun',
                product_code: '0000001',
                matched_by_name: true,
            }),
            sourceFromMovementRow({
                id: 'kimliksiz',
                quantity: 1,
                unit_price: 15_000,
                extract_net_amount: 15_000,
                movement_type: 'in',
                fiche_type: 'return_invoice',
                trcode: 3,
                document_no: '00099',
            }),
        ]);
        expect(kept).toEqual([]);
    });
});

describe('ekstre tutarı indirimi bir kez düşer', () => {
    it('net doluysa indirim ikinci kez düşülmez', () => {
        const [row] = projectMaterialExtractLines([
            {
                id: 'net',
                quantity: 1,
                unit_price: 15_000,
                gross_amount: 15_000,
                discount_amount: 1_000,
                net_amount: 14_000,
                movement_type: 'out',
                fiche_type: 'sales_invoice',
                trcode: 8,
            },
        ]);
        expect(row.outAmt).toBe(14_000);
        expect(row.unitPrice).toBe(15_000);
    });

    it('net yoksa brüt eksi indirim', () => {
        const [row] = projectMaterialExtractLines([
            {
                id: 'brut',
                quantity: 1,
                unit_price: 15_000,
                gross_amount: 15_000,
                discount_amount: 1_000,
                movement_type: 'out',
                fiche_type: 'sales_invoice',
                trcode: 8,
            },
        ]);
        expect(row.outAmt).toBe(14_000);
    });

    it('satış iadesinin fiş tutarı maliyete çevrilmez', () => {
        const [row] = projectMaterialExtractLines([
            sourceFromMovementRow({
                id: 'iade-maliyet',
                quantity: 1,
                unit_price: 15_000,
                unit_cost: 5_000,
                cost_price: 5_000,
                extract_gross_amount: 15_000,
                extract_discount_amount: 0,
                extract_net_amount: 15_000,
                movement_type: 'out',
                fiche_type: 'return_invoice',
                trcode: 3,
                product_id: 'sabun',
            }),
        ]);
        expect(row.inQty).toBe(1);
        expect(row.inAmt).toBe(15_000);
        expect(row.outAmt).toBe(0);
    });
});

describe('ekstre tarih aralığı satır düşürmez', () => {
    it('bitiş günündeki duvar saati dahil, önceki gün hariç', () => {
        const dates = [
            '2026-10-24T23:00:00',
            '2026-10-25T22:20:00',
            '2026-10-26T23:30:00',
        ];
        const kept = dates.filter((value) => isWithinInclusiveDayRange(value, '2026-10-25', '2026-10-26'));
        expect(kept).toEqual(['2026-10-25T22:20:00', '2026-10-26T23:30:00']);
    });
});
