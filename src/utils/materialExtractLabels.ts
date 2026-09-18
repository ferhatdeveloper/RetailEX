/**
 * Malzeme ekstresi fiş tipi etiketi ve kaynak eşlemesi.
 * Logo alış trcode 1, ambar sarf fişi (çıkış slip) ile çakışır.
 */

/** Logo alış faturası trcode'ları — ambar fişi 1=Sarf / 5=Transfer / 26=Sayım fazlası ile çakışır. */
const PURCHASE_INVOICE_TRCODES = new Set([1, 4, 13, 26, 41, 42]);
const SALES_INVOICE_TRCODES = new Set([7, 8, 9, 14, 29, 30, 31, 32]);
const RETURN_INVOICE_TRCODES = new Set([2, 3, 6]);

function normKey(value: string): string {
    return String(value || '').trim().toLocaleLowerCase('tr');
}

export function isInboundMovement(movType: string): boolean {
    return normKey(movType) === 'in';
}

export function isOutboundMovement(movType: string): boolean {
    return normKey(movType) === 'out';
}

export function isInvoiceMovement(sourceType: string, ficheType: string): boolean {
    const src = normKey(sourceType);
    const fiche = normKey(ficheType);
    if (src === 'invoice' || src === 'sales' || src === 'sale') return true;
    return (
        fiche === 'purchase_invoice' ||
        fiche === 'sales_invoice' ||
        fiche === 'return_invoice' ||
        fiche === 'alis' ||
        fiche === 'a' ||
        fiche === 'purchase'
    );
}

export function isPurchaseInvoiceFiche(ficheType: string): boolean {
    const fiche = normKey(ficheType);
    return fiche === 'purchase_invoice' || fiche === 'alis' || fiche === 'a' || fiche === 'purchase';
}

export function isWarehouseSlip(sourceType: string): boolean {
    const src = normKey(sourceType);
    return src === 'slip' || src === 'warehouse' || src === 'ambar';
}

/**
 * Satınalma her zaman invoice / purchase_invoice.
 * Giriş + trcode 1 slip yazılmış olsa bile satınalma sayılır (sarf yalnızca çıkıştır).
 */
export function resolveExtractSourceMeta(row: {
    movement_type?: string;
    trcode?: number;
    source_type?: string;
    source_kind?: string;
    fiche_type?: string;
    ficheType?: string;
}): { source_type: string; fiche_type: string } {
    const fiche = String(row.fiche_type || row.ficheType || '').trim();
    const src = String(row.source_type || row.source_kind || '').trim();
    const mt = normKey(String(row.movement_type || ''));
    const tr = Number(row.trcode ?? 0);

    if (isPurchaseInvoiceFiche(fiche)) {
        return { source_type: 'invoice', fiche_type: 'purchase_invoice' };
    }
    if (isInvoiceMovement(src, fiche) && !isWarehouseSlip(src)) {
        if (tr === 1 && !fiche) {
            return { source_type: 'invoice', fiche_type: 'purchase_invoice' };
        }
        return { source_type: src || 'invoice', fiche_type: fiche };
    }
    if (mt === 'in' && tr === 1) {
        return { source_type: 'invoice', fiche_type: 'purchase_invoice' };
    }
    return { source_type: src, fiche_type: fiche };
}

/**
 * Fiş tipi etiketi — tm anahtarları: satinalmaFaturasi / consumption / salesInvoice …
 */
export function labelMaterialExtractFiche(
    tm: (key: string) => string,
    trcode: number,
    movType: string,
    sourceType: string,
    ficheType: string,
): string {
    const fiche = normKey(ficheType);
    const invoice = isInvoiceMovement(sourceType, ficheType);
    const warehouseSlip = isWarehouseSlip(sourceType);
    const satinalma = tm('satinalmaFaturasi') || 'Satınalma faturası';

    if (
        isPurchaseInvoiceFiche(ficheType) ||
        (invoice && !warehouseSlip && (PURCHASE_INVOICE_TRCODES.has(trcode) || trcode === 5))
    ) {
        return satinalma;
    }
    if (invoice && trcode === 1) {
        return satinalma;
    }
    // Giriş + trcode 1: slip olsa bile Sarf değil
    if (trcode === 1 && isInboundMovement(movType)) {
        return satinalma;
    }
    if (fiche === 'sales_invoice' || (invoice && SALES_INVOICE_TRCODES.has(trcode))) {
        return tm('salesInvoice') || 'Satış Faturası';
    }
    if (fiche === 'return_invoice' && (trcode === 3 || isInboundMovement(movType))) {
        return tm('salesReturn') || 'Satış İade';
    }
    if (fiche === 'return_invoice' || (invoice && RETURN_INVOICE_TRCODES.has(trcode) && trcode !== 3)) {
        return tm('purchaseReturn') || 'Alış İade';
    }
    // Sarf: yalnızca çıkış ambar fişi trcode 1
    if (trcode === 1 && isOutboundMovement(movType) && warehouseSlip) {
        return tm('consumption') || 'Sarf';
    }
    if (trcode === 2) return tm('productionEntry') || 'Üretim Girişi';
    if (trcode === 5) return tm('warehouseReceipt') || 'Ambar Fişi';
    if (trcode === 8) {
        return isOutboundMovement(movType) ? (tm('salesInvoice') || 'Satış Faturası') : satinalma;
    }
    return isInboundMovement(movType) ? (tm('in') || 'Giriş') : (tm('out') || 'Çıkış');
}
