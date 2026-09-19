import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Printer, X, FileText, LayoutTemplate, Database } from 'lucide-react';
import { toast } from 'sonner';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { productAPI } from '../../../services/api/products';
import type { Product } from '../../../core/types';
import { formatNumber } from '../../../utils/formatNumber';
import { formatLedgerAmount, getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';
import { format } from 'date-fns';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { exportReportToXlsx } from '../../../utils/reportExport';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import {
    buildReportGridColumns,
    REPORT_GRID_DEFAULTS,
} from '../../reports/shared/ReportDataGrid';
import {
    isInboundMovement,
    isOutboundMovement,
    labelMaterialExtractFiche,
    resolveExtractSourceMeta,
} from '../../../utils/materialExtractLabels';
import { displayItemCode } from '../../../utils/lastPurchaseCostSql';
import { formatReportDateCell } from '../../../utils/dateLocale';
import { receiptNotesForDisplay } from '../../../utils/receiptNotes';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { ReportHtmlPrintPreviewModal } from '../../reports/ReportHtmlPrintPreviewModal';
import { ReportViewerModule } from '../../reports/ReportViewerModule';
import type { ReportTemplate } from '../../reports/designerUtils';
import { useTemplateStore } from '../../../store/useTemplateStore';
import {
    getBindingForScope,
    listFastReportDesigns,
    saveBindings,
} from '../../../services/printDesignBindingService';
import type { PrintDesignOption } from '../../../core/types/printDesignBindings';
import { convertTemplateToReportTemplate } from '../../../services/templateRenderService';
import { getReceiptSettings } from '../../../services/receiptSettingsService';
import {
    enqueueFastReportFrxJob,
    enqueueFastReportTemplateJob,
    enqueueHtmlDocumentJob,
    isWindowsPrinterServiceEnabled,
} from '../../../services/unifiedPrintQueueService';
import { printReportHtml, shouldPreviewReportPrint } from '../../../utils/reportHtmlPrint';
import { useResponsive } from '../../../hooks/useResponsive';
import {
    MATERIAL_EXTRACT_BUILTIN_ID,
    MATERIAL_EXTRACT_PRINT_SCOPE,
    buildMaterialExtractPrintContext,
    buildMaterialExtractPrintHtml,
    collectMaterialExtractDesignTemplates,
    companyHeaderFromReceiptSettings,
    readStoredExtractPrintDesign,
    writeStoredExtractPrintDesign,
    type ExtractPrintSelection,
    type MaterialExtractPrintInput,
    type MaterialExtractPrintRow,
} from '../../../utils/materialExtractPrint';

/** Tüm malzemeler modunda satır üst sınırı (API ile aynı). */
const ALL_MATERIALS_ROW_LIMIT = 10_000;

interface ExtractRow {
    id: string;
    date: string;
    trcode: number;
    movement_type: string;
    source_type: string;
    fiche_type: string;
    document_no: string;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    running_balance: number;
    warehouse_name?: string;
    product_id?: string;
    product_code?: string;
    product_name?: string;
}

type ExtractRowKind = 'detail' | 'group' | 'subtotal';

type ExtractGridRow = ExtractRow & {
    dateLabel: string;
    productCodeLabel: string;
    productNameLabel: string;
    typeLabel: string;
    descLabel: string;
    inQty: number | null;
    inAmt: number | null;
    purchaseUnitPrice: number | null;
    outQty: number | null;
    outAmt: number | null;
    salesUnitPrice: number | null;
    _rowKind: ExtractRowKind;
};

function extractProductGroupKey(row: {
    product_id?: string;
    product_code?: string;
    product_name?: string;
}): string {
    const id = String(row.product_id || '').trim();
    if (id) return `id:${id}`;
    const code = displayItemCode(row.product_code);
    const codePart = code === '—' ? '' : code;
    const name = String(row.product_name || '').trim();
    return `cn:${codePart}\0${name}`;
}

function compareExtractProductRows(
    a: { productCodeLabel?: string; productNameLabel?: string; product_code?: string; product_name?: string; date?: string },
    b: { productCodeLabel?: string; productNameLabel?: string; product_code?: string; product_name?: string; date?: string },
): number {
    const aCode = a.productCodeLabel || (displayItemCode(a.product_code) === '—' ? '' : displayItemCode(a.product_code));
    const bCode = b.productCodeLabel || (displayItemCode(b.product_code) === '—' ? '' : displayItemCode(b.product_code));
    const byCode = aCode.localeCompare(bCode, 'tr', { sensitivity: 'base' });
    if (byCode !== 0) return byCode;
    const aName = a.productNameLabel || a.product_name || '';
    const bName = b.productNameLabel || b.product_name || '';
    const byName = aName.localeCompare(bName, 'tr', { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return String(a.date || '').localeCompare(String(b.date || ''));
}

const BUILTIN_SELECTION: ExtractPrintSelection = {
    kind: 'builtin',
    id: MATERIAL_EXTRACT_BUILTIN_ID,
    name: null,
};

/**
 * Malzeme Ekstresi — tenant-aware.
 * Malzeme seçilirse tek ürün ekstresi; boş bırakılırsa tarih aralığında
 * tüm malzemelerin hareketleri (ambar fişleri + faturalar).
 * Kümülatif bakiye tek üründe global, tümünde ürün bazında.
 * Para kolonları giriş/çıkış olarak ayrıdır; tek tutarda netlenmez.
 */
export function MaterialExtractReport() {
    const { tm } = useLanguage();
    const { selectedFirm } = useFirmaDonem();
    const { isMobile } = useResponsive();
    const currency = getFirmLedgerCurrency(
        selectedFirm,
        getAppDefaultCurrency() || getGlobalCurrency(),
    );
    const firmNr = String(selectedFirm?.firm_nr || '001').trim().padStart(3, '0');

    const templates = useTemplateStore((s) => s.templates);
    const {
        loadTemplatesFromDatabase,
        getTemplatesForScope,
        getTemplatesByType,
        resolveTemplateForScope,
        setTemplateDefaultForScope,
    } = useTemplateStore();

    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [rows, setRows] = useState<ExtractRow[]>([]);
    /** Rapor en az bir kez başarıyla hazırlandı (seçimsiz tümü dahil). */
    const [reportReady, setReportReady] = useState(false);
    /** true = malzeme seçilmeden tüm malzemeler yüklendi */
    const [allMaterialsMode, setAllMaterialsMode] = useState(false);
    /** Tüm malzemeler modunda ürün koduna göre grupla (varsayılan açık). */
    const [groupByProduct, setGroupByProduct] = useState(true);
    /** DevEx kolon gruplama (ürün bazlı kapalıyken). */
    const [columnGroupBy, setColumnGroupBy] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [printOpen, setPrintOpen] = useState(false);
    const [printLoadingOptions, setPrintLoadingOptions] = useState(false);
    const [printBusy, setPrintBusy] = useState(false);
    const [printSelection, setPrintSelection] = useState<ExtractPrintSelection>(BUILTIN_SELECTION);
    const [printMakeDefault, setPrintMakeDefault] = useState(false);
    const [frxOptions, setFrxOptions] = useState<PrintDesignOption[]>([]);
    const [printPreview, setPrintPreview] = useState<{ html: string; title: string } | null>(null);
    const [viewerState, setViewerState] = useState<{ template: ReportTemplate; data: Record<string, unknown> } | null>(null);

    const designTemplates = useMemo(
        () => collectMaterialExtractDesignTemplates(getTemplatesForScope, getTemplatesByType),
        [templates, getTemplatesForScope, getTemplatesByType],
    );

    const today = useMemo(() => new Date(), []);
    const monthStart = useMemo(() => {
        const d = new Date(today);
        d.setMonth(d.getMonth() - 1);
        return d;
    }, [today]);
    const [startDate, setStartDate] = useState(format(monthStart, 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(today, 'yyyy-MM-dd'));

    const productCodeLabel = displayItemCode(selectedProduct?.code, selectedProduct?.barcode);

    // Ürün listesi tek seferde yüklensin
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const list = await productAPI.getAllForReports({ firmNr: selectedFirm?.firm_nr });
                if (!cancelled) setProducts(list);
            } catch (err) {
                console.error('[MaterialExtractReport] products load failed', err);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [selectedFirm?.firm_nr]);

    // Dış tıklamada dropdown kapansın
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filteredProducts = useMemo(() => {
        const q = searchText.trim().toLocaleLowerCase('tr');
        if (!q) return products.slice(0, 50);
        return products
            .filter(p =>
                (p.code || '').toLocaleLowerCase('tr').includes(q) ||
                (p.name || '').toLocaleLowerCase('tr').includes(q) ||
                (p.barcode || '').toLocaleLowerCase('tr').includes(q)
            )
            .slice(0, 50);
    }, [products, searchText]);

    const resetToManualSearch = (opts?: { openDropdown?: boolean }) => {
        setSelectedProduct(null);
        setSearchText('');
        setRows([]);
        setReportReady(false);
        setAllMaterialsMode(false);
        setShowDropdown(opts?.openDropdown !== false);
    };

    const mapMovementToExtractRow = (
        m: any,
        idx: number,
        balance: number,
        productMeta?: { id?: string; code?: string; name?: string },
    ): ExtractRow => {
        const qty = Number(m.quantity) || 0;
        const unitPrice = Number(m.unit_price) || 0;
        const movType = m.movement?.movement_type || m.movement_type || '';
        const classified = resolveExtractSourceMeta({
            movement_type: movType,
            trcode: Number(m.movement?.trcode || m.trcode || 0),
            source_type: String(
                m.source_type ||
                m.source_kind ||
                m.movement?.source_type ||
                m.movement?.source_kind ||
                '',
            ).trim(),
            fiche_type: String(
                m.fiche_type ||
                m.ficheType ||
                m.movement?.fiche_type ||
                m.movement?.ficheType ||
                m.sales_fiche_type ||
                '',
            ).trim(),
        });
        const code =
            productMeta?.code ||
            displayItemCode(m.product_code, m.productCode, selectedProduct?.code, selectedProduct?.barcode);
        return {
            id: `${m.id || idx}`,
            date: m.movement?.movement_date || m.movement_date || m.created_at,
            trcode: Number(m.movement?.trcode || m.trcode || 0),
            movement_type: movType,
            source_type: classified.source_type,
            fiche_type: classified.fiche_type,
            document_no: m.movement?.document_no || m.document_no || '',
            description: receiptNotesForDisplay(
                m.notes || m.description || m.customer_name || m.supplier || '',
            ),
            quantity: qty,
            unit_price: unitPrice,
            amount: qty * unitPrice,
            running_balance: balance,
            warehouse_name: m.movement?.warehouses?.name || m.warehouse_name || '',
            product_id: productMeta?.id || String(m.product_id || '').trim() || undefined,
            product_code: code === '—' ? '' : code,
            product_name: productMeta?.name || String(m.product_name || '').trim() || selectedProduct?.name || '',
        };
    };

    const loadReport = async () => {
        if (!startDate || !endDate) {
            toast.error(tm('dateRangeLabel') || 'Tarih aralığı gerekli');
            return;
        }
        setLoading(true);
        try {
            if (selectedProduct?.id) {
                const movements = await stockMovementAPI.getProductMovements(selectedProduct.id, {
                    code: selectedProduct.code,
                    barcode: selectedProduct.barcode,
                });
                const start = new Date(startDate).getTime();
                const end = new Date(endDate).getTime() + 86_400_000;
                const filtered = movements.filter((m: any) => {
                    const date = new Date(m.movement?.movement_date || m.movement_date || m.created_at).getTime();
                    return date >= start && date <= end;
                });
                filtered.sort((a: any, b: any) => {
                    const da = new Date(a.movement?.movement_date || a.movement_date || a.created_at).getTime();
                    const db = new Date(b.movement?.movement_date || b.movement_date || b.created_at).getTime();
                    return da - db;
                });
                let balance = 0;
                const mapped: ExtractRow[] = filtered.map((m: any, idx: number) => {
                    const qty = Number(m.quantity) || 0;
                    const movType = m.movement?.movement_type || m.movement_type || '';
                    if (movType === 'in') balance += qty;
                    else if (movType === 'out') balance -= qty;
                    return mapMovementToExtractRow(m, idx, balance, {
                        id: selectedProduct.id,
                        code: displayItemCode(selectedProduct.code, selectedProduct.barcode),
                        name: selectedProduct.name || '',
                    });
                });
                setRows(mapped);
                setAllMaterialsMode(false);
                setReportReady(true);
            } else {
                const result = await stockMovementAPI.getExtractMovementsInDateRange({
                    startDate,
                    endDate,
                    limit: ALL_MATERIALS_ROW_LIMIT,
                    firmNr: selectedFirm?.firm_nr,
                });
                const balances = new Map<string, number>();
                const mapped: ExtractRow[] = result.rows.map((m: any, idx: number) => {
                    const qty = Number(m.quantity) || 0;
                    const movType = m.movement?.movement_type || m.movement_type || '';
                    const key =
                        String(m.product_id || '').trim() ||
                        displayItemCode(m.product_code) ||
                        `row-${idx}`;
                    let bal = balances.get(key) || 0;
                    if (movType === 'in') bal += qty;
                    else if (movType === 'out') bal -= qty;
                    balances.set(key, bal);
                    return mapMovementToExtractRow(m, idx, bal, {
                        id: String(m.product_id || '').trim(),
                        code: displayItemCode(m.product_code),
                        name: String(m.product_name || '').trim(),
                    });
                });
                setRows(mapped);
                setAllMaterialsMode(true);
                setReportReady(true);
                if (result.truncated) {
                    toast.warning(
                        (tm('extractRowLimitWarning') || '').replace('{limit}', String(result.limit)) ||
                            `Sonuç üst sınıra ulaştı (${result.limit} satır).`,
                    );
                }
            }
        } catch (err) {
            console.error('[MaterialExtractReport] loadReport failed', err);
            toast.error(tm('error') || 'Rapor yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    // Tek malzeme seçiliyken ürün/tarih değişince otomatik yükle (tümü için yalnızca buton)
    useEffect(() => {
        if (selectedProduct) void loadReport();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProduct?.id, startDate, endDate]);

    const totals = useMemo(() => {
        return rows.reduce(
            (acc, r) => {
                if (isInboundMovement(r.movement_type)) {
                    acc.totalInQty += r.quantity;
                    acc.totalInAmount += r.amount;
                } else if (isOutboundMovement(r.movement_type)) {
                    acc.totalOutQty += r.quantity;
                    acc.totalOutAmount += r.amount;
                }
                return acc;
            },
            { totalInQty: 0, totalInAmount: 0, totalOutQty: 0, totalOutAmount: 0 }
        );
    }, [rows]);

    const labelTrcode = (
        trcode: number,
        movType: string,
        sourceType: string,
        ficheType: string,
    ): string => labelMaterialExtractFiche(tm, trcode, movType, sourceType, ficheType);

    /** Tek ürün seçiliyken gruplama kapalı; tüm malzemelerde kullanıcı tercihi. */
    const effectiveGroupByProduct = Boolean(
        allMaterialsMode && !selectedProduct && groupByProduct && !columnGroupBy,
    );

    const gridGroupByColumnId = useMemo(() => {
        if (!allMaterialsMode || selectedProduct) return null;
        if (effectiveGroupByProduct) return 'productNameLabel';
        return columnGroupBy;
    }, [allMaterialsMode, selectedProduct, effectiveGroupByProduct, columnGroupBy]);

    const handleGridGroupByChange = (columnId: string | null) => {
        if (!columnId) {
            setGroupByProduct(false);
            setColumnGroupBy(null);
            return;
        }
        if (columnId === 'productNameLabel' || columnId === 'productCodeLabel') {
            setGroupByProduct(true);
            setColumnGroupBy(null);
            return;
        }
        setGroupByProduct(false);
        setColumnGroupBy(columnId);
    };

    const gridRows = useMemo((): ExtractGridRow[] => {
        return rows.map((row) => {
            const inbound = isInboundMovement(row.movement_type);
            const outbound = isOutboundMovement(row.movement_type);
            return {
                ...row,
                dateLabel: row.date ? formatReportDateCell(row.date) : '',
                productCodeLabel: displayItemCode(row.product_code) === '—' ? '' : displayItemCode(row.product_code),
                productNameLabel: row.product_name || '',
                typeLabel: labelTrcode(row.trcode, row.movement_type, row.source_type, row.fiche_type),
                descLabel: row.description || row.warehouse_name || '',
                inQty: inbound ? row.quantity : null,
                inAmt: inbound ? row.amount : null,
                purchaseUnitPrice: inbound ? row.unit_price : null,
                outQty: outbound ? row.quantity : null,
                outAmt: outbound ? row.amount : null,
                salesUnitPrice: outbound ? row.unit_price : null,
                _rowKind: 'detail' as const,
            };
        });
    }, [rows, tm]);

    /** Excel / yazdırma için ürün bazlı sentetik grup satırları (ekran native DevEx gruplama kullanır). */
    const productGroupedRows = useMemo((): ExtractGridRow[] => {
        if (!effectiveGroupByProduct) return gridRows;
        const sorted = [...gridRows].sort(compareExtractProductRows);
        const out: ExtractGridRow[] = [];
        let i = 0;
        while (i < sorted.length) {
            const key = extractProductGroupKey(sorted[i]);
            const group: ExtractGridRow[] = [];
            while (i < sorted.length && extractProductGroupKey(sorted[i]) === key) {
                group.push(sorted[i]);
                i += 1;
            }
            const first = group[0];
            let inQty = 0;
            let inAmt = 0;
            let outQty = 0;
            let outAmt = 0;
            let lastBal = first.running_balance;
            for (const g of group) {
                if (g.inQty != null) {
                    inQty += g.inQty;
                    inAmt += Number(g.inAmt) || 0;
                }
                if (g.outQty != null) {
                    outQty += g.outQty;
                    outAmt += Number(g.outAmt) || 0;
                }
                lastBal = g.running_balance;
            }
            const code = first.productCodeLabel || '';
            const name = first.productNameLabel || '';
            out.push({
                ...first,
                id: `group-${key}`,
                _rowKind: 'group',
                dateLabel: '',
                typeLabel: '',
                document_no: '',
                descLabel: '',
                productCodeLabel: code,
                productNameLabel: name,
                inQty: null,
                inAmt: null,
                purchaseUnitPrice: null,
                outQty: null,
                outAmt: null,
                salesUnitPrice: null,
                running_balance: lastBal,
                quantity: 0,
                unit_price: 0,
                amount: 0,
            });
            for (const g of group) out.push(g);
            out.push({
                ...first,
                id: `subtotal-${key}`,
                _rowKind: 'subtotal',
                dateLabel: '',
                typeLabel: '',
                document_no: '',
                descLabel: tm('extractGroupSubtotal') || 'Grup toplamı',
                productCodeLabel: code,
                productNameLabel: name,
                inQty,
                inAmt,
                purchaseUnitPrice: null,
                outQty,
                outAmt,
                salesUnitPrice: null,
                running_balance: lastBal,
                quantity: 0,
                unit_price: 0,
                amount: 0,
            });
        }
        return out;
    }, [gridRows, tm, effectiveGroupByProduct]);

    const showProductColumns = allMaterialsMode || !selectedProduct;

    const gridColumns = useMemo(
        () =>
            buildReportGridColumns<ExtractGridRow>([
                {
                    id: 'dateLabel',
                    header: tm('date'),
                    filterKind: 'date',
                    size: 110,
                    cell: (r) => r.dateLabel || '',
                },
                ...(showProductColumns
                    ? [
                          {
                              id: 'productCodeLabel' as const,
                              header: tm('materialCode') || 'Malzeme Kodu',
                              size: 120,
                              cell: (r: ExtractGridRow) => r.productCodeLabel || '',
                          },
                          {
                              id: 'productNameLabel' as const,
                              header: tm('materialName') || 'Malzeme Adı',
                              size: 180,
                              cell: (r: ExtractGridRow) => r.productNameLabel || '',
                          },
                      ]
                    : []),
                {
                    id: 'typeLabel',
                    header: tm('ficheType') || 'Fiş Tipi',
                    size: 130,
                    cell: (r) => r.typeLabel || '',
                },
                {
                    id: 'document_no',
                    header: tm('ficheNo') || 'Fiş No',
                    size: 120,
                    cell: (r) => r.document_no || '',
                },
                {
                    id: 'descLabel',
                    header: tm('description') || 'Açıklama',
                    size: 180,
                    cell: (r) => r.descLabel || '',
                },
                {
                    id: 'inQty',
                    header: tm('extractInQty'),
                    align: 'right',
                    size: 110,
                    cell: (r) =>
                        r.inQty == null ? (
                            ''
                        ) : (
                            <span className="font-bold text-green-700">{formatNumber(r.inQty, 2)}</span>
                        ),
                },
                {
                    id: 'inAmt',
                    header: tm('extractInAmount'),
                    align: 'right',
                    size: 120,
                    cell: (r) =>
                        r.inAmt == null ? (
                            ''
                        ) : (
                            <span className="text-green-700">{formatNumber(r.inAmt, 2)}</span>
                        ),
                },
                {
                    id: 'purchaseUnitPrice',
                    header: tm('extractPurchaseUnitPrice') || 'Alış Birim Fiyatı',
                    align: 'right',
                    size: 130,
                    cell: (r) =>
                        r.purchaseUnitPrice == null ? (
                            ''
                        ) : (
                            <span className="text-green-700">{formatNumber(r.purchaseUnitPrice, 2)}</span>
                        ),
                },
                {
                    id: 'outQty',
                    header: tm('extractOutQty'),
                    align: 'right',
                    size: 110,
                    cell: (r) =>
                        r.outQty == null ? (
                            ''
                        ) : (
                            <span className="font-bold text-red-700">{formatNumber(r.outQty, 2)}</span>
                        ),
                },
                {
                    id: 'outAmt',
                    header: tm('extractOutAmount'),
                    align: 'right',
                    size: 120,
                    cell: (r) =>
                        r.outAmt == null ? (
                            ''
                        ) : (
                            <span className="text-red-700">{formatNumber(r.outAmt, 2)}</span>
                        ),
                },
                {
                    id: 'salesUnitPrice',
                    header: tm('extractSalesUnitPrice') || 'Satış Birim Fiyatı',
                    align: 'right',
                    size: 130,
                    cell: (r) =>
                        r.salesUnitPrice == null ? (
                            ''
                        ) : (
                            <span className="text-red-700">{formatNumber(r.salesUnitPrice, 2)}</span>
                        ),
                },
                {
                    id: 'running_balance',
                    header: tm('runningQuantity') || 'Kalan Bakiye',
                    align: 'right',
                    size: 140,
                    cell: (r) => (
                        <span className="font-bold">{formatNumber(r.running_balance, 2)}</span>
                    ),
                },
            ]),
        [tm, showProductColumns],
    );

    const exportExcel = () => {
        if (!reportReady || rows.length === 0) return;
        const hDate = tm('date');
        const hCode = tm('materialCode') || 'Malzeme Kodu';
        const hName = tm('materialName') || 'Malzeme Adı';
        const hFicheType = tm('ficheType') || 'Fiş Tipi';
        const hFicheNo = tm('ficheNo') || 'Fiş No';
        const hDesc = tm('description') || 'Açıklama';
        const hInQty = tm('extractInQty');
        const hInAmt = tm('extractInAmount');
        const hPurchaseUnit = tm('extractPurchaseUnitPrice') || 'Alış Birim Fiyatı';
        const hOutQty = tm('extractOutQty');
        const hOutAmt = tm('extractOutAmount');
        const hSalesUnit = tm('extractSalesUnitPrice') || 'Satış Birim Fiyatı';
        const hBal = tm('runningQuantity') || 'Kalan Bakiye';
        const headers = showProductColumns
            ? [hDate, hCode, hName, hFicheType, hFicheNo, hDesc, hInQty, hInAmt, hPurchaseUnit, hOutQty, hOutAmt, hSalesUnit, hBal]
            : [hDate, hFicheType, hFicheNo, hDesc, hInQty, hInAmt, hPurchaseUnit, hOutQty, hOutAmt, hSalesUnit, hBal];

        const exportSource: ExtractGridRow[] = effectiveGroupByProduct
            ? productGroupedRows
            : gridRows;

        const exportRows = exportSource.map((row) => {
            const kind = row._rowKind;
            if (kind === 'group') {
                const base: Record<string, string | number> = {
                    [hDate]: '',
                    [hFicheType]: '',
                    [hFicheNo]: '',
                    [hDesc]: [row.productCodeLabel, row.productNameLabel].filter(Boolean).join(' — '),
                    [hInQty]: '',
                    [hInAmt]: '',
                    [hPurchaseUnit]: '',
                    [hOutQty]: '',
                    [hOutAmt]: '',
                    [hSalesUnit]: '',
                    [hBal]: '',
                };
                if (showProductColumns) {
                    base[hCode] = row.productCodeLabel || '';
                    base[hName] = row.productNameLabel || '';
                }
                return base;
            }
            if (kind === 'subtotal') {
                const base: Record<string, string | number> = {
                    [hDate]: '',
                    [hFicheType]: '',
                    [hFicheNo]: '',
                    [hDesc]: tm('extractGroupSubtotal') || 'Grup toplamı',
                    [hInQty]: row.inQty ?? '',
                    [hInAmt]: row.inAmt ?? '',
                    [hPurchaseUnit]: '',
                    [hOutQty]: row.outQty ?? '',
                    [hOutAmt]: row.outAmt ?? '',
                    [hSalesUnit]: '',
                    [hBal]: row.running_balance,
                };
                if (showProductColumns) {
                    base[hCode] = row.productCodeLabel || '';
                    base[hName] = row.productNameLabel || '';
                }
                return base;
            }
            const base: Record<string, string | number> = {
                [hDate]: row.dateLabel,
                [hFicheType]: row.typeLabel,
                [hFicheNo]: row.document_no,
                [hDesc]: row.descLabel,
                [hInQty]: row.inQty ?? '',
                [hInAmt]: row.inAmt ?? '',
                [hPurchaseUnit]: row.purchaseUnitPrice ?? '',
                [hOutQty]: row.outQty ?? '',
                [hOutAmt]: row.outAmt ?? '',
                [hSalesUnit]: row.salesUnitPrice ?? '',
                [hBal]: row.running_balance,
            };
            if (showProductColumns) {
                base[hCode] = row.productCodeLabel;
                base[hName] = row.productNameLabel;
            }
            return base;
        });
        const lastBalance = rows[rows.length - 1]?.running_balance ?? 0;
        const codeForFile = selectedProduct
            ? productCodeLabel === '—'
                ? 'urun'
                : productCodeLabel.replace(/[^\w.-]+/g, '_')
            : 'tum_malzemeler';
        const noteLabel = selectedProduct
            ? `${productCodeLabel} — ${selectedProduct.name || ''} • ${currency}`
            : `${tm('extractAllMaterialsLabel') || 'Tüm malzemeler'}${
                  effectiveGroupByProduct ? ` · ${tm('extractGroupByProduct') || 'Ürün bazında'}` : ''
              } • ${currency}`;
        exportReportToXlsx({
            fileName: `Malzeme_Ekstresi_${codeForFile}_${startDate}_${endDate}`,
            sheetName: tm('materialExtractReport') || 'Malzeme Ekstresi',
            headers,
            rows: exportRows,
            totals: showProductColumns
                ? {
                      [hDate]: '',
                      [hCode]: '',
                      [hName]: '',
                      [hFicheType]: '',
                      [hFicheNo]: '',
                      [hDesc]: tm('totalUppercase') || 'Toplam',
                      [hInQty]: totals.totalInQty,
                      [hInAmt]: totals.totalInAmount,
                      [hPurchaseUnit]: '',
                      [hOutQty]: totals.totalOutQty,
                      [hOutAmt]: totals.totalOutAmount,
                      [hSalesUnit]: '',
                      [hBal]: lastBalance,
                  }
                : {
                      [hDate]: '',
                      [hFicheType]: '',
                      [hFicheNo]: '',
                      [hDesc]: tm('totalUppercase') || 'Toplam',
                      [hInQty]: totals.totalInQty,
                      [hInAmt]: totals.totalInAmount,
                      [hPurchaseUnit]: '',
                      [hOutQty]: totals.totalOutQty,
                      [hOutAmt]: totals.totalOutAmount,
                      [hSalesUnit]: '',
                      [hBal]: lastBalance,
                  },
            metadata: {
                companyName: selectedFirm?.name || selectedFirm?.firma_adi || 'RetailEX',
                period: `${formatReportDateCell(startDate)} → ${formatReportDateCell(endDate)}`,
                note: noteLabel,
            },
        });
    };

    const buildPrintInput = async (): Promise<MaterialExtractPrintInput | null> => {
        if (!reportReady || rows.length === 0) return null;
        const receipt = await getReceiptSettings(firmNr).catch(() => ({}));
        const header = companyHeaderFromReceiptSettings(
            receipt,
            selectedFirm?.name || selectedFirm?.firma_adi || 'RetailEX',
        );
        const printRows: MaterialExtractPrintRow[] = effectiveGroupByProduct
            ? productGroupedRows.flatMap((row) => {
                  if (row._rowKind === 'group') {
                      const title = [row.productCodeLabel, row.productNameLabel].filter(Boolean).join(' — ');
                      return [
                          {
                              date: '',
                              trcode: 0,
                              movement_type: '',
                              source_type: '',
                              fiche_type: '',
                              document_no: '',
                              description: title,
                              quantity: 0,
                              unit_price: 0,
                              amount: 0,
                              running_balance: row.running_balance,
                              printRowKind: 'group' as const,
                          },
                      ];
                  }
                  if (row._rowKind === 'subtotal') {
                      return [
                          {
                              date: '',
                              trcode: 0,
                              movement_type: '',
                              source_type: '',
                              fiche_type: '',
                              document_no: '',
                              description: tm('extractGroupSubtotal') || 'Grup toplamı',
                              quantity: 0,
                              unit_price: 0,
                              amount: 0,
                              running_balance: row.running_balance,
                              printRowKind: 'subtotal' as const,
                              printInQty: row.inQty ?? undefined,
                              printInAmt: row.inAmt ?? undefined,
                              printOutQty: row.outQty ?? undefined,
                              printOutAmt: row.outAmt ?? undefined,
                          },
                      ];
                  }
                  return [
                      {
                          date: row.date,
                          trcode: row.trcode,
                          movement_type: row.movement_type,
                          source_type: row.source_type,
                          fiche_type: row.fiche_type,
                          document_no: row.document_no,
                          description: row.description,
                          quantity: row.quantity,
                          unit_price: row.unit_price,
                          amount: row.amount,
                          running_balance: row.running_balance,
                          warehouse_name: row.warehouse_name,
                      },
                  ];
              })
            : [...rows].sort(compareExtractProductRows);
        return {
            ...header,
            reportTitle: tm('materialExtractReport') || 'Malzeme Ekstresi',
            productCode: selectedProduct
                ? selectedProduct.code || selectedProduct.barcode || ''
                : tm('extractAllMaterialsLabel') || 'Tüm malzemeler',
            productName: selectedProduct?.name || (allMaterialsMode ? '' : ''),
            dateFrom: startDate,
            dateTo: endDate,
            currency,
            rows: printRows,
            totals,
            labels: {
                reportTitle: tm('materialExtractReport') || 'Malzeme Ekstresi',
                date: tm('date'),
                ficheType: tm('ficheType') || 'Fiş Tipi',
                ficheNo: tm('ficheNo') || 'Fiş No',
                description: tm('description') || 'Açıklama',
                inQty: tm('extractInQty'),
                inAmt: tm('extractInAmount'),
                purchaseUnitPrice: tm('extractPurchaseUnitPrice') || 'Alış Birim Fiyatı',
                outQty: tm('extractOutQty'),
                outAmt: tm('extractOutAmount'),
                salesUnitPrice: tm('extractSalesUnitPrice') || 'Satış Birim Fiyatı',
                runningBalance: tm('runningQuantity') || 'Kalan Bakiye',
                total: tm('totalUppercase') || 'Toplam',
                dateRange: tm('dateRangeLabel') || 'Tarih Aralığı',
                empty: tm('noRecordsFound') || 'Kayıt bulunamadı',
            },
            labelFiche: (row) =>
                labelMaterialExtractFiche(tm, row.trcode, row.movement_type, row.source_type, row.fiche_type),
        };
    };

    const persistDefaultSelection = async (sel: ExtractPrintSelection) => {
        writeStoredExtractPrintDesign(sel);
        try {
            await saveBindings(firmNr, [
                {
                    scope: MATERIAL_EXTRACT_PRINT_SCOPE,
                    designKind: sel.kind,
                    designId: sel.kind === 'builtin' ? null : sel.id,
                    designName: sel.name,
                    isActive: true,
                },
            ]);
        } catch (err) {
            console.warn('[MaterialExtractReport] saveBindings failed', err);
        }
        if (sel.kind === 'design_center' && sel.id) {
            try {
                await setTemplateDefaultForScope(sel.id, MATERIAL_EXTRACT_PRINT_SCOPE);
            } catch (err) {
                console.warn('[MaterialExtractReport] setTemplateDefaultForScope failed', err);
            }
        }
    };

    const openPrintModal = async () => {
        if (!reportReady || rows.length === 0) {
            toast.error(tm('extractPrintNeedRows') || 'Yazdırmak için önce raporu hazırlayın.');
            return;
        }
        setPrintOpen(true);
        setPrintMakeDefault(false);
        setPrintLoadingOptions(true);
        try {
            await loadTemplatesFromDatabase();
            let frx: PrintDesignOption[] = [];
            try {
                frx = await listFastReportDesigns(firmNr);
            } catch (err) {
                console.warn('[MaterialExtractReport] listFastReportDesigns failed', err);
                frx = [];
            }
            setFrxOptions(frx);

            const stored = readStoredExtractPrintDesign();
            const resolved = resolveTemplateForScope('invoice', MATERIAL_EXTRACT_PRINT_SCOPE);
            let next: ExtractPrintSelection = BUILTIN_SELECTION;

            const binding = await getBindingForScope(firmNr, MATERIAL_EXTRACT_PRINT_SCOPE).catch(() => null);
            if (binding?.designKind === 'fastreport_frx' && binding.designId) {
                next = { kind: 'fastreport_frx', id: binding.designId, name: binding.designName };
            } else if (binding?.designKind === 'design_center' && binding.designId) {
                next = { kind: 'design_center', id: binding.designId, name: binding.designName };
            } else if (binding?.designKind === 'builtin') {
                next = BUILTIN_SELECTION;
            } else if (resolved?.id) {
                next = { kind: 'design_center', id: resolved.id, name: resolved.name };
            } else if (stored) {
                next = stored.kind === 'builtin' ? BUILTIN_SELECTION : stored;
            }

            setPrintSelection(next);
        } catch (err) {
            console.error('[MaterialExtractReport] openPrintModal failed', err);
            setPrintSelection(BUILTIN_SELECTION);
        } finally {
            setPrintLoadingOptions(false);
        }
    };

    const handleConfirmPrint = async () => {
        if (!reportReady || rows.length === 0) {
            toast.error(tm('extractPrintNeedRows') || 'Yazdırmak için önce raporu hazırlayın.');
            return;
        }
        setPrintBusy(true);
        try {
            const input = await buildPrintInput();
            if (!input) return;
            if (printMakeDefault) {
                await persistDefaultSelection(printSelection);
            } else {
                writeStoredExtractPrintDesign(printSelection);
            }

            if (printSelection.kind === 'builtin') {
                const html = buildMaterialExtractPrintHtml(input);
                const title = `${input.reportTitle} — ${displayItemCode(input.productCode)}`;
                if (shouldPreviewReportPrint(isMobile)) {
                    setPrintOpen(false);
                    setPrintPreview({ html, title });
                    return;
                }
                if (await isWindowsPrinterServiceEnabled()) {
                    await enqueueHtmlDocumentJob({
                        html,
                        paperHint: 'A4',
                        connection: 'system',
                        refType: 'material_extract',
                        refId: selectedProduct?.id ?? null,
                        sourceSystem: 'web',
                    });
                    toast.success(tm('extractPrintQueued') || 'Yazıcı kuyruğuna eklendi.');
                    setPrintOpen(false);
                    return;
                }
                await printReportHtml(html);
                setPrintOpen(false);
                return;
            }

            const context = buildMaterialExtractPrintContext(input);

            if (printSelection.kind === 'fastreport_frx') {
                if (!printSelection.id) {
                    toast.error(tm('extractPrintFailed') || 'Yazdırma hazırlanamadı.');
                    return;
                }
                if (!(await isWindowsPrinterServiceEnabled())) {
                    toast.error(tm('extractPrintNeedService') || 'FastReport .frx için Windows yazıcı servisi açık olmalı.');
                    return;
                }
                await enqueueFastReportFrxJob({
                    designId: printSelection.id,
                    designName: printSelection.name,
                    scope: MATERIAL_EXTRACT_PRINT_SCOPE,
                    data: context,
                    connection: 'system',
                    refType: 'material_extract',
                    refId: selectedProduct?.id ?? null,
                    sourceSystem: 'web',
                    priority: 80,
                });
                toast.success(tm('extractPrintQueued') || 'Yazıcı kuyruğuna eklendi.');
                setPrintOpen(false);
                return;
            }

            const selectedTemplate = designTemplates.find((t) => t.id === printSelection.id);
            if (!selectedTemplate) {
                toast.error(tm('extractPrintFailed') || 'Seçili şablon bulunamadı.');
                return;
            }
            if (await isWindowsPrinterServiceEnabled()) {
                await enqueueFastReportTemplateJob({
                    templateId: selectedTemplate.id,
                    type: 'invoice',
                    data: context,
                    connection: 'system',
                    refType: 'material_extract',
                    refId: selectedProduct?.id ?? null,
                    sourceSystem: 'web',
                    priority: 80,
                });
                toast.success(tm('extractPrintQueued') || 'Yazıcı kuyruğuna eklendi.');
                setPrintOpen(false);
                return;
            }
            setViewerState({
                template: convertTemplateToReportTemplate(selectedTemplate),
                data: context,
            });
            setPrintOpen(false);
        } catch (err) {
            console.error('[MaterialExtractReport] print failed', err);
            toast.error(tm('extractPrintFailed') || tm('reportToastPrintFrameFail') || 'Yazdırma hazırlanamadı.');
        } finally {
            setPrintBusy(false);
        }
    };

    const canExport = reportReady && rows.length > 0 && !loading;
    const builtinActive = printSelection.kind === 'builtin';
    const dateRangeDisplay = `${formatReportDateCell(startDate)} → ${formatReportDateCell(endDate)}`;

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Üst Filtre Çubuğu */}
            <div className="bg-gray-100 border-b p-4 flex flex-wrap gap-4 items-end">
                <div className="relative" ref={dropdownRef}>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        {tm('materialCodeOrName') || 'Malzeme Kodu / Adı'}
                    </label>
                    <div className="flex gap-2">
                        <input
                            className="px-3 py-1.5 border rounded text-sm w-72 focus:ring-2 focus:ring-indigo-500"
                            placeholder={tm('selectMaterialPlaceholder') || 'Malzeme arayın...'}
                            value={searchText}
                            onChange={e => {
                                const v = e.target.value;
                                setSearchText(v);
                                if (selectedProduct) {
                                    setSelectedProduct(null);
                                    setRows([]);
                                    setReportReady(false);
                                    setAllMaterialsMode(false);
                                }
                                setShowDropdown(true);
                            }}
                            onFocus={() => {
                                if (!selectedProduct) setShowDropdown(true);
                            }}
                        />
                        {selectedProduct ? (
                            <button
                                type="button"
                                onClick={() => resetToManualSearch({ openDropdown: true })}
                                className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                title={tm('clear') || 'Temizle'}
                                aria-label={tm('clear') || 'Temizle'}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowDropdown(s => !s)}
                                className="p-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                title={tm('search') || 'Ara'}
                                aria-label={tm('search') || 'Ara'}
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    {showDropdown && filteredProducts.length > 0 && (
                        <div className="absolute z-20 mt-1 w-80 max-h-80 overflow-y-auto bg-white border rounded-lg shadow-lg">
                            {filteredProducts.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedProduct(p);
                                        setSearchText(`${displayItemCode(p.code, p.barcode)} - ${p.name || ''}`);
                                        setShowDropdown(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 border-b last:border-b-0"
                                >
                                    <div className="font-mono text-xs text-gray-500">{displayItemCode(p.code, p.barcode)}</div>
                                    <div className="font-medium text-gray-800">{p.name}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        {tm('startDate') || 'Başlangıç'}
                    </label>
                    <input
                        type="date"
                        className="px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                        {tm('endDate') || 'Bitiş'}
                    </label>
                    <input
                        type="date"
                        className="px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-indigo-500"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                    />
                </div>

                <button
                    type="button"
                    onClick={() => void loadReport()}
                    disabled={loading || !startDate || !endDate}
                    className="px-6 py-2 bg-gray-800 text-white rounded font-bold text-sm hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (tm('loading') || 'Yükleniyor...') : (tm('prepareReport') || 'Raporu Hazırla')}
                </button>

                {!selectedProduct && (
                    <label
                        className="flex items-center gap-2 px-3 py-2 border rounded bg-white text-sm text-gray-700 select-none cursor-pointer"
                        title={tm('extractGroupByProduct') || 'Ürün bazında'}
                    >
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            checked={groupByProduct && !columnGroupBy}
                            onChange={(e) => {
                                const on = e.target.checked;
                                setGroupByProduct(on);
                                if (on) setColumnGroupBy(null);
                            }}
                        />
                        <span className="font-medium">{tm('extractGroupByProduct') || 'Ürün bazında'}</span>
                    </label>
                )}
            </div>

            {/* Rapor Başlığı */}
            <div className="p-6 pb-3 text-center">
                <h1 className="text-xl font-bold uppercase tracking-widest text-gray-800">
                    {tm('materialExtractReport') || 'Malzeme Ekstresi'}
                </h1>
                <div className="mt-2 flex justify-center gap-4 text-xs text-gray-500 flex-wrap">
                    {selectedProduct ? (
                        <span className="font-semibold">
                            {productCodeLabel} — {selectedProduct.name}
                        </span>
                    ) : reportReady && allMaterialsMode ? (
                        <span className="font-semibold">
                            {tm('extractAllMaterialsLabel') || 'Tüm malzemeler'}
                        </span>
                    ) : null}
                    <span>{tm('dateRangeLabel') || 'Tarih Aralığı'}: {dateRangeDisplay}</span>
                    <span>•</span>
                    <span>{currency}</span>
                </div>
            </div>

            {/* Tablo — Malzeme / Envanter Listesi ile aynı DevExDataGrid */}
            <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
                {!reportReady && !loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center max-w-lg text-gray-400">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p>{tm('selectMaterialHint')}</p>
                        </div>
                    </div>
                ) : loading ? (
                    <div className="h-full flex items-center justify-center text-gray-400">
                        <div className="inline-flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            {tm('loading') || 'Yükleniyor...'}
                        </div>
                    </div>
                ) : (
                    <DevExDataGrid
                        data={gridRows}
                        columns={gridColumns}
                        {...REPORT_GRID_DEFAULTS}
                        autoFooterSums={false}
                        height="100%"
                        excelFileName={tm('materialExtractReport') || 'malzeme_ekstresi'}
                        printTitle={tm('materialExtractReport') || 'Malzeme Ekstresi'}
                        onPrint={() => void openPrintModal()}
                        printDisabled={!canExport}
                        enableExcelExport={canExport}
                        enableGrouping
                        groupByColumnId={gridGroupByColumnId}
                        onGroupByColumnIdChange={handleGridGroupByChange}
                        footerLabel={tm('totalUppercase') || 'Toplam'}
                        footerSumColumns={[
                            {
                                columnId: 'inQty',
                                getValue: (r) => Number(r.inQty) || 0,
                                format: (sum) => (
                                    <span className="text-green-700">{formatNumber(sum, 2)}</span>
                                ),
                            },
                            {
                                columnId: 'inAmt',
                                getValue: (r) => Number(r.inAmt) || 0,
                                format: (sum) => (
                                    <span className="text-green-700">{formatLedgerAmount(sum, currency)}</span>
                                ),
                            },
                            {
                                columnId: 'outQty',
                                getValue: (r) => Number(r.outQty) || 0,
                                format: (sum) => (
                                    <span className="text-red-700">{formatNumber(sum, 2)}</span>
                                ),
                            },
                            {
                                columnId: 'outAmt',
                                getValue: (r) => Number(r.outAmt) || 0,
                                format: (sum) => (
                                    <span className="text-red-700">{formatLedgerAmount(sum, currency)}</span>
                                ),
                            },
                        ]}
                    />
                )}
            </div>

            {printOpen && (
                <PercentBodyModal
                    onClose={() => setPrintOpen(false)}
                    size="wide"
                    ariaLabel={tm('extractPrintSelectDesign') || tm('specialPrint')}
                >
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black uppercase tracking-tight">
                                    {tm('extractPrint') || tm('print') || 'Yazdır'}
                                </h2>
                                <p className="text-blue-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90">
                                    {selectedProduct
                                        ? `${productCodeLabel}${selectedProduct.name ? ` — ${selectedProduct.name}` : ''}`
                                        : (tm('extractAllMaterialsLabel') || 'Tüm malzemeler')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPrintOpen(false)}
                                className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <PercentBodyModalScrollBody className="p-8 space-y-5">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                {tm('specialPrintDocumentType')}
                            </div>
                            <div className="text-base font-semibold text-slate-900">
                                {tm('materialExtractReport') || 'Malzeme Ekstresi'}
                            </div>
                        </div>

                        {printLoadingOptions ? (
                            <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
                                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
                                {tm('loading') || 'Yükleniyor...'}
                            </div>
                        ) : (
                            <>
                                <div>
                                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        {tm('extractPrintSelectDesign') || tm('specialPrintDesignSelect')}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setPrintSelection(BUILTIN_SELECTION)}
                                            className={`p-4 text-left border-2 rounded-2xl transition-all ${
                                                builtinActive
                                                    ? 'border-blue-600 bg-blue-50 shadow-sm'
                                                    : 'border-slate-200 hover:border-blue-200 bg-white'
                                            }`}
                                        >
                                            <FileText className={`w-5 h-5 mb-2 ${builtinActive ? 'text-blue-600' : 'text-slate-400'}`} />
                                            <div className="text-sm font-bold text-slate-900">
                                                {tm('extractPrintBuiltin') || 'Yerleşik A4 Malzeme Ekstresi'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {tm('extractPrintBuiltinDesc') || 'A4 · RetailEX yerleşik çıktı'}
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {designTemplates.length > 0 && (
                                    <div>
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <LayoutTemplate className="w-3.5 h-3.5" />
                                            {tm('extractPrintDesignCenter') || 'Dizayn Merkezi'}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {designTemplates.map((template) => {
                                                const active =
                                                    printSelection.kind === 'design_center' &&
                                                    printSelection.id === template.id;
                                                return (
                                                    <button
                                                        key={template.id}
                                                        type="button"
                                                        onClick={() =>
                                                            setPrintSelection({
                                                                kind: 'design_center',
                                                                id: template.id,
                                                                name: template.name,
                                                            })
                                                        }
                                                        className={`p-4 text-left border-2 rounded-2xl transition-all ${
                                                            active
                                                                ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                                                                : 'border-slate-200 hover:border-indigo-200 bg-white'
                                                        }`}
                                                    >
                                                        <LayoutTemplate className={`w-5 h-5 mb-2 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                                                        <div className="text-sm font-bold text-slate-900 line-clamp-2">{template.name}</div>
                                                        <div className="text-[11px] text-slate-500 mt-1">
                                                            {template.format} · {template.width}×{template.height} mm
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {frxOptions.length > 0 && (
                                    <div>
                                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Database className="w-3.5 h-3.5" />
                                            {tm('extractPrintFastReport') || 'FastReport .frx'}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {frxOptions.map((opt) => {
                                                const active =
                                                    printSelection.kind === 'fastreport_frx' &&
                                                    printSelection.id === opt.id;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() =>
                                                            setPrintSelection({
                                                                kind: 'fastreport_frx',
                                                                id: opt.id,
                                                                name: opt.name,
                                                            })
                                                        }
                                                        className={`p-4 text-left border-2 rounded-2xl transition-all ${
                                                            active
                                                                ? 'border-amber-500 bg-amber-50 shadow-sm'
                                                                : 'border-slate-200 hover:border-amber-200 bg-white'
                                                        }`}
                                                    >
                                                        <Database className={`w-5 h-5 mb-2 ${active ? 'text-amber-600' : 'text-slate-400'}`} />
                                                        <div className="text-sm font-bold text-slate-900 line-clamp-2">{opt.name}</div>
                                                        <div className="text-[11px] text-slate-500 mt-1">{opt.sourceLabel}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-2xl bg-white">
                            <input
                                type="checkbox"
                                checked={printMakeDefault}
                                onChange={(e) => setPrintMakeDefault(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                            />
                            <span className="text-sm text-slate-700 font-medium">
                                {tm('specialPrintMakeDefault')}
                            </span>
                        </label>
                    </PercentBodyModalScrollBody>
                    <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
                        <button
                            type="button"
                            onClick={() => setPrintOpen(false)}
                            className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98]"
                        >
                            {tm('cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleConfirmPrint()}
                            disabled={printBusy || printLoadingOptions}
                            className="flex-1 py-3 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] inline-flex items-center justify-center gap-2"
                        >
                            <Printer className="w-4 h-4" />
                            {printBusy ? tm('preparing') : (tm('extractPrint') || tm('print'))}
                        </button>
                    </div>
                </PercentBodyModal>
            )}

            {printPreview && (
                <ReportHtmlPrintPreviewModal
                    html={printPreview.html}
                    title={printPreview.title}
                    onClose={() => setPrintPreview(null)}
                    printLabel={tm('extractPrint') || tm('print') || 'Yazdır'}
                    closeLabel={tm('cancel')}
                    hintLabel={tm('extractPrintSelectDesign') || tm('specialPrintDesignSelect')}
                />
            )}

            {viewerState && (
                <ReportViewerModule
                    template={viewerState.template}
                    data={viewerState.data}
                    onClose={() => setViewerState(null)}
                />
            )}
        </div>
    );
}
