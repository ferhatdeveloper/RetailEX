import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { DEFAULT_TEMPLATES, TEMPLATE_USAGE_SCOPE_LABELS, TEMPLATE_USAGE_SCOPES } from '../../core/types/templates';
import { PRINT_DESIGN_SCOPES } from '../../core/types/printDesignBindings';
import { convertTemplateToReportTemplate } from '../../services/templateRenderService';
import { displayItemCode } from '../../utils/lastPurchaseCostSql';
import {
    MATERIAL_EXTRACT_PRINT_LS_KEY,
    buildMaterialExtractPrintContext,
    buildMaterialExtractPrintHtml,
    collectMaterialExtractDesignTemplates,
    escapeHtml,
    formatExtractDate,
    readStoredExtractPrintDesign,
    writeStoredExtractPrintDesign,
    type MaterialExtractPrintInput,
} from '../../utils/materialExtractPrint';

const LABELS = {
    reportTitle: 'Malzeme Ekstresi',
    date: 'Tarih',
    ficheType: 'Fiş Tipi',
    ficheNo: 'Fiş No',
    description: 'Açıklama',
    inQty: 'Giriş miktar',
    inAmt: 'Giriş tutar',
    purchaseUnitPrice: 'Alış Birim Fiyatı',
    outQty: 'Çıkış miktar',
    outAmt: 'Çıkış tutar',
    salesUnitPrice: 'Satış Birim Fiyatı',
    runningBalance: 'Kalan Bakiye',
    total: 'Toplam',
    dateRange: 'Tarih Aralığı',
    empty: 'Kayıt bulunamadı',
};

function sampleInput(overrides?: Partial<MaterialExtractPrintInput>): MaterialExtractPrintInput {
    return {
        reportTitle: 'Malzeme Ekstresi',
        productCode: 'URN-100',
        productName: 'Zeytinyağı',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-19',
        currency: 'IQD',
        companyName: 'RetailEX Demo',
        companyAddress: 'Atatürk Cad.',
        rows: [
            {
                date: '2026-09-02',
                trcode: 1,
                movement_type: 'in',
                source_type: 'invoice',
                fiche_type: 'purchase_invoice',
                document_no: 'AF-1',
                description: 'Alış <script>',
                quantity: 10,
                unit_price: 2,
                amount: 20,
                running_balance: 10,
            },
            {
                date: '2026-09-03',
                trcode: 8,
                movement_type: 'out',
                source_type: 'invoice',
                fiche_type: 'sales_invoice',
                document_no: 'SF-2',
                description: 'Satış',
                quantity: 3,
                unit_price: 5,
                amount: 15,
                running_balance: 7,
            },
        ],
        totals: {
            totalInQty: 10,
            totalInAmount: 20,
            totalOutQty: 3,
            totalOutAmount: 15,
        },
        labels: LABELS,
        labelFiche: (row) => (row.movement_type === 'in' ? 'Satınalma faturası' : 'Satış Faturası'),
        ...overrides,
    };
}

describe('material extract print scope', () => {
    it('TemplateUsageScope ve PRINT_DESIGN_SCOPES material_extract içerir', () => {
        expect(TEMPLATE_USAGE_SCOPES).toContain('material_extract');
        expect(TEMPLATE_USAGE_SCOPE_LABELS.material_extract).toBe('Malzeme Ekstresi');
        const row = PRINT_DESIGN_SCOPES.find((s) => s.scope === 'material_extract');
        expect(row).toEqual({ scope: 'material_extract', label: 'Malzeme Ekstresi', group: 'Rapor' });
    });

    it('DEFAULT_TEMPLATES A4 malzeme ekstresi şablonunu içerir', () => {
        const tpl = DEFAULT_TEMPLATES.find((t) => t.id === 'default-a4-material-extract');
        expect(tpl).toBeTruthy();
        expect(tpl?.format).toBe('A4');
        expect(tpl?.usageScopes).toEqual(expect.arrayContaining(['material_extract', 'global']));
    });
});

describe('collectMaterialExtractDesignTemplates', () => {
    it('scope + A4/A5/Letter fatura tasarımlarını birleştirir, tekilleştirir', () => {
        const templates = [
            { id: 'a', type: 'invoice' as const, format: 'A4' as const, usageScopes: ['global'] },
            { id: 'b', type: 'invoice' as const, format: '80mm' as const, usageScopes: ['material_extract'] },
            { id: 'c', type: 'invoice' as const, format: 'Letter' as const, usageScopes: ['invoice_sales'] },
            { id: 'a', type: 'invoice' as const, format: 'A4' as const, usageScopes: ['material_extract'] },
        ];
        const result = collectMaterialExtractDesignTemplates(
            (_type, scope) =>
                templates.filter(
                    (t) =>
                        t.type === 'invoice' &&
                        (t.usageScopes?.includes(scope!) || t.usageScopes?.includes('global')),
                ) as any,
            (type) => templates.filter((t) => t.type === type) as any,
        );
        const ids = result.map((t) => t.id);
        expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c', 'default-a4-material-extract']));
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('buildMaterialExtractPrintHtml', () => {
    it('HTML kaçış ve şirket başlığı ile tablo üretir', () => {
        const html = buildMaterialExtractPrintHtml(sampleInput());
        expect(html).toContain('RetailEX Demo');
        expect(html).toContain('URN-100');
        expect(html).toContain('Alış &lt;script&gt;');
        expect(html).not.toContain('<script>');
        expect(html).toContain('Satınalma faturası');
        expect(html).toContain('AF-1');
        expect(html).toContain('@page { size: A4');
        expect(html).toContain('Alış Birim Fiyatı');
        expect(html).toContain('Satış Birim Fiyatı');
        expect(html).toContain('Kalan Bakiye');
        expect(html).not.toContain('Kümülatif');
        expect(html.indexOf('Alış Birim Fiyatı')).toBeLessThan(html.indexOf('Çıkış miktar'));
        expect(html.indexOf('Çıkış tutar')).toBeLessThan(html.indexOf('Satış Birim Fiyatı'));
        expect(html.indexOf('Satış Birim Fiyatı')).toBeLessThan(html.indexOf('Kalan Bakiye'));
    });

    it('UUID ürün kodunu gizler', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000';
        expect(displayItemCode(uuid, 'BR-9')).toBe('BR-9');
        const html = buildMaterialExtractPrintHtml(
            sampleInput({ productCode: uuid }),
        );
        expect(html).not.toContain(uuid);
        expect(html).toContain('—');
    });
});

describe('buildMaterialExtractPrintContext', () => {
    it('invoiceNo ürün kodudur ve items satırları giriş/çıkış ayırır', () => {
        const ctx = buildMaterialExtractPrintContext(sampleInput());
        expect(ctx.invoiceNo).toBe('URN-100');
        expect(ctx.storeName).toBe('RetailEX Demo');
        expect(ctx.productCode).toBe('URN-100');
        expect(ctx.reportTitle).toBe('Malzeme Ekstresi');
        const items = ctx.items as Array<Record<string, unknown>>;
        expect(items).toHaveLength(2);
        expect(items[0].inQty).toBe(10);
        expect(items[0].outQty).toBe('');
        expect(items[0].purchaseUnitPrice).toBe(2);
        expect(items[0].salesUnitPrice).toBe('');
        expect(items[1].outAmt).toBe(15);
        expect(items[1].inAmt).toBe('');
        expect(items[1].salesUnitPrice).toBe(5);
        expect(items[1].purchaseUnitPrice).toBe('');
    });
});

describe('extract print helpers', () => {
    it('formatExtractDate ISO tarihi dd.MM.yyyy yapar', () => {
        expect(formatExtractDate('2026-09-19')).toBe('19.09.2026');
    });

    it('escapeHtml tehlikeli karakterleri kaçırır', () => {
        expect(escapeHtml(`<img src="x" onerror='alert(1)'>`)).toContain('&lt;');
        expect(escapeHtml(`<img src="x" onerror='alert(1)'>`)).not.toContain('<img');
    });
});

describe('localStorage print design', () => {
    beforeEach(() => {
        localStorage.removeItem(MATERIAL_EXTRACT_PRINT_LS_KEY);
    });
    afterEach(() => {
        localStorage.removeItem(MATERIAL_EXTRACT_PRINT_LS_KEY);
    });

    it('JSON seçimi okur/yazar', () => {
        writeStoredExtractPrintDesign({ kind: 'design_center', id: 'default-a4', name: 'A4' });
        expect(readStoredExtractPrintDesign()).toEqual({
            kind: 'design_center',
            id: 'default-a4',
            name: 'A4',
        });
    });
});

describe('convertTemplateToReportTemplate extract columns', () => {
    it('Giriş/Çıkış ve alış/satış birim fiyatı alanlarına bağlar', () => {
        const tpl = DEFAULT_TEMPLATES.find((t) => t.id === 'default-a4-material-extract');
        expect(tpl).toBeTruthy();
        const report = convertTemplateToReportTemplate(tpl!);
        const table = report.components.find((c) => c.type === 'table');
        const fields = table?.columns?.map((c) => c.field) ?? [];
        expect(fields).toEqual([
            'dateLabel',
            'typeLabel',
            'documentNo',
            'description',
            'inQty',
            'inAmt',
            'purchaseUnitPrice',
            'outQty',
            'outAmt',
            'salesUnitPrice',
            'runningBalance',
        ]);
    });
});
