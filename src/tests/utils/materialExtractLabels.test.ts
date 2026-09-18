import { describe, expect, it } from 'vitest';
import {
    labelMaterialExtractFiche,
    resolveExtractSourceMeta,
} from '../../utils/materialExtractLabels';

const LABELS: Record<string, string> = {
    satinalmaFaturasi: 'Satınalma faturası',
    consumption: 'Sarf',
    salesInvoice: 'Satış Faturası',
    salesReturn: 'Satış İade',
    purchaseReturn: 'Alış İade',
    productionEntry: 'Üretim Girişi',
    warehouseReceipt: 'Ambar Fişi',
    in: 'Giriş',
    out: 'Çıkış',
};

function tm(key: string): string {
    return LABELS[key] || key;
}

describe('labelMaterialExtractFiche', () => {
    it('giriş + trcode 1 + slip → Satınalma faturası (Sarf değil)', () => {
        expect(labelMaterialExtractFiche(tm, 1, 'in', 'slip', '')).toBe('Satınalma faturası');
    });

    it('giriş + trcode 1 + invoice + purchase_invoice → Satınalma faturası', () => {
        expect(labelMaterialExtractFiche(tm, 1, 'in', 'invoice', 'purchase_invoice')).toBe(
            'Satınalma faturası',
        );
    });

    it('çıkış + trcode 1 + slip → Sarf', () => {
        expect(labelMaterialExtractFiche(tm, 1, 'out', 'slip', '')).toBe('Sarf');
    });

    it('çıkış + trcode 8 + invoice + sales_invoice → Satış Faturası', () => {
        expect(labelMaterialExtractFiche(tm, 8, 'out', 'invoice', 'sales_invoice')).toBe(
            'Satış Faturası',
        );
    });

    it('giriş + trcode 1 + warehouse → Satınalma faturası', () => {
        expect(labelMaterialExtractFiche(tm, 1, 'in', 'warehouse', '')).toBe('Satınalma faturası');
    });

    it('çıkış + trcode 1 + invoice + purchase_invoice → Satınalma faturası', () => {
        expect(labelMaterialExtractFiche(tm, 1, 'out', 'invoice', 'purchase_invoice')).toBe(
            'Satınalma faturası',
        );
    });

    it('giriş + trcode 2 + slip → Üretim Girişi', () => {
        expect(labelMaterialExtractFiche(tm, 2, 'in', 'slip', '')).toBe('Üretim Girişi');
    });

    it('giriş + trcode 5 + slip → Ambar Fişi', () => {
        expect(labelMaterialExtractFiche(tm, 5, 'in', 'slip', '')).toBe('Ambar Fişi');
    });
});

describe('resolveExtractSourceMeta', () => {
    it('satınalma fiche_type korunur', () => {
        expect(
            resolveExtractSourceMeta({
                movement_type: 'in',
                trcode: 1,
                source_type: 'invoice',
                fiche_type: 'purchase_invoice',
            }),
        ).toEqual({ source_type: 'invoice', fiche_type: 'purchase_invoice' });
    });

    it('giriş + trcode 1 slip → invoice / purchase_invoice', () => {
        expect(
            resolveExtractSourceMeta({
                movement_type: 'in',
                trcode: 1,
                source_type: 'slip',
            }),
        ).toEqual({ source_type: 'invoice', fiche_type: 'purchase_invoice' });
    });

    it('çıkış + trcode 1 slip → slip kalır (sarf)', () => {
        expect(
            resolveExtractSourceMeta({
                movement_type: 'out',
                trcode: 1,
                source_type: 'slip',
            }),
        ).toEqual({ source_type: 'slip', fiche_type: '' });
    });

    it('satış faturası invoice / sales_invoice kalır', () => {
        expect(
            resolveExtractSourceMeta({
                movement_type: 'out',
                trcode: 8,
                source_type: 'invoice',
                fiche_type: 'sales_invoice',
            }),
        ).toEqual({ source_type: 'invoice', fiche_type: 'sales_invoice' });
    });
});
