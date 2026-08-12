/**
 * Fatura listesi trcode / fiche_type filtreleri — web InvoicesAPI.getPaginated ile uyumlu.
 */

export const SALES_RETURN_TRCODE = 3;
export const PURCHASE_RETURN_TRCODE = 6;

/** Logo trcode grupları — src/services/api/invoices.ts TRCODES_BY_INVOICE_CATEGORY */
export const TRCODES_BY_INVOICE_CATEGORY: Record<string, readonly number[]> = {
  Alis: [1, 4, 5, 6, 13, 26, 41, 42],
  Satis: [7, 8, 9, 14, 29, 30, 31, 32],
  Iade: [2, 3, 6],
  Irsaliye: [10, 11, 12, 13, 25],
  Siparis: [20, 21],
  Teklif: [30, 31],
  Hizmet: [4, 9, 21, 24],
};

export type InvoicesListPreset =
  | 'all'
  | 'sales-return'
  | 'purchase-return'
  | 'sales'
  | 'purchase'
  | 'service-given'
  | 'service-received'
  | 'waybill'
  | 'order'
  | 'quote'
  | 'purchase-request';

export type InvoiceListFilter =
  | { preset: 'all' }
  | { preset: InvoicesListPreset; trcode?: number; legacyFicheTypes?: string[] };

type FilterClause = { sql: string; params: unknown[] };

function legacyFicheTypesByInvoiceType(trcode: number): string[] {
  switch (trcode) {
    case 1:
      return ['purchase_invoice', 'A'];
    case 8:
      return ['sales_invoice', 'S'];
    case 3:
      return ['return_invoice', 'I'];
    default:
      return [];
  }
}

function legacyFicheTypesByCategory(category: string): string[] {
  switch (category) {
    case 'Alis':
      return ['purchase_invoice', 'A'];
    case 'Satis':
      return ['sales_invoice', 'S'];
    case 'Iade':
      return ['return_invoice', 'I'];
    default:
      return [];
  }
}

function trcodesForCategories(categories: string[]): number[] {
  const set = new Set<number>();
  for (const cat of categories) {
    for (const tc of TRCODES_BY_INVOICE_CATEGORY[cat] || []) set.add(tc);
  }
  return [...set];
}

function ficheTypesForCategories(categories: string[]): string[] {
  const set = new Set<string>();
  for (const cat of categories) {
    for (const ft of legacyFicheTypesByCategory(cat)) set.add(ft);
  }
  return [...set];
}

/** Menü screen id → liste filtresi + başlık */
export function resolveInvoicesRouteParams(screen: string): {
  filter?: InvoiceListFilter;
  title?: string;
} {
  switch (screen) {
    case 'sales-invoice-return':
      return {
        filter: { preset: 'sales-return', trcode: SALES_RETURN_TRCODE },
        title: 'Satış İade',
      };
    case 'purchase-invoice-return':
      return {
        filter: { preset: 'purchase-return', trcode: PURCHASE_RETURN_TRCODE },
        title: 'Alış İade',
      };
    case 'sales-invoice-retail':
      return { filter: { preset: 'sales', trcode: 7 }, title: 'Perakende Satış' };
    case 'sales-invoice-standard':
    case 'sales-invoice-wholesale':
    case 'sales-invoice-consignment':
    case 'salesinvoice':
      return { filter: { preset: 'sales' }, title: 'Satış Faturaları' };
    case 'purchase-invoice-standard':
    case 'purchaseinvoice':
      return { filter: { preset: 'purchase', trcode: 1 }, title: 'Alış Faturaları' };
    case 'serviceinvoice-given':
      return { filter: { preset: 'service-given', trcode: 9 }, title: 'Verilen Hizmet' };
    case 'serviceinvoice-received':
      return { filter: { preset: 'service-received', trcode: 4 }, title: 'Alınan Hizmet' };
    case 'salesorder':
      return { filter: { preset: 'order', trcode: 20 }, title: 'Satış Siparişi' };
    case 'purchase':
    case 'purchase-ord':
      return { filter: { preset: 'order', trcode: 21 }, title: 'Satınalma Siparişi' };
    case 'purchaserequest':
      return { filter: { preset: 'purchase-request', trcode: 20 }, title: 'Talep Fişleri' };
    case 'Teklifler':
      return { filter: { preset: 'quote', trcode: 30 }, title: 'Teklifler' };
    case 'waybill-sales':
      return { filter: { preset: 'waybill', trcode: 10 }, title: 'Satış İrsaliyesi' };
    case 'waybill-purchase':
      return { filter: { preset: 'waybill', trcode: 11 }, title: 'Alış İrsaliyesi' };
    case 'waybill-transfer':
      return { filter: { preset: 'waybill', trcode: 12 }, title: 'Depo Transfer İrsaliyesi' };
    case 'waybill-fire':
      return { filter: { preset: 'waybill', trcode: 13 }, title: 'Fire İrsaliyesi' };
    default:
      return {};
  }
}

export function invoiceFilterLabel(filter?: InvoiceListFilter): string | null {
  if (!filter || filter.preset === 'all') return null;
  switch (filter.preset) {
    case 'sales-return':
      return 'Satış İade';
    case 'purchase-return':
      return 'Alış İade';
    case 'sales':
      return 'Satış';
    case 'purchase':
      return 'Alış';
    case 'service-given':
      return 'Verilen Hizmet';
    case 'service-received':
      return 'Alınan Hizmet';
    case 'waybill':
      return 'İrsaliye';
    case 'order':
      return 'Sipariş';
    case 'quote':
      return 'Teklif';
    case 'purchase-request':
      return 'Talep';
    default:
      return null;
  }
}

export function trcodeBadgeLabel(trcode: number | null | undefined): string | null {
  const tc = Number(trcode ?? 0);
  if (tc === SALES_RETURN_TRCODE) return 'Satış İade';
  if (tc === PURCHASE_RETURN_TRCODE) return 'Alış İade';
  if (tc === 2) return 'Tedarikçi İade';
  if ([7, 8].includes(tc)) return 'Satış';
  if (tc === 1 || tc === 5) return 'Alış';
  if (tc === 9) return 'Verilen Hizmet';
  if (tc === 4) return 'Alınan Hizmet';
  if (tc === 10) return 'Satış İrsaliye';
  if (tc === 11) return 'Alış İrsaliye';
  if (tc === 12) return 'Transfer İrsaliye';
  if (tc === 13) return 'Fire İrsaliye';
  if (tc === 20) return 'Satış Sipariş';
  if (tc === 21) return 'Alış Sipariş';
  if (tc === 30 || tc === 31) return 'Teklif';
  return tc > 0 ? `TRCODE ${tc}` : null;
}

/** PostgREST istemci tarafı filtre — SQL `buildInvoiceFilterClause` ile aynı kurallar */
export function matchesInvoiceListFilter(
  row: {
    trcode?: number | null;
    fiche_type?: string | null;
  },
  filter?: InvoiceListFilter,
): boolean {
  if (!filter || filter.preset === 'all') return true;

  const tc = Number(row.trcode ?? 0);
  const ft = String(row.fiche_type ?? '').trim();
  const ftLower = ft.toLocaleLowerCase('tr-TR');

  if (filter.trcode != null && filter.trcode > 0) {
    if (tc === filter.trcode) return true;
    const legacy = (filter.legacyFicheTypes ?? legacyFicheTypesByInvoiceType(filter.trcode)).map(
      (x) => String(x).toLocaleLowerCase('tr-TR'),
    );
    return legacy.includes(ftLower);
  }

  switch (filter.preset) {
    case 'sales-return':
      return matchesInvoiceListFilter(row, { preset: 'sales-return', trcode: SALES_RETURN_TRCODE });
    case 'purchase-return':
      return matchesInvoiceListFilter(row, {
        preset: 'purchase-return',
        trcode: PURCHASE_RETURN_TRCODE,
      });
    case 'sales': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Satis;
      const ficheTypes = legacyFicheTypesByCategory('Satis').map((x) =>
        x.toLocaleLowerCase('tr-TR'),
      );
      return trcodes.includes(tc) || ficheTypes.includes(ftLower);
    }
    case 'purchase': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Alis.filter((c) => c !== PURCHASE_RETURN_TRCODE);
      const ficheTypes = legacyFicheTypesByCategory('Alis').map((x) =>
        x.toLocaleLowerCase('tr-TR'),
      );
      return trcodes.includes(tc) || ficheTypes.includes(ftLower);
    }
    case 'service-given':
      return matchesInvoiceListFilter(row, { preset: 'service-given', trcode: 9 });
    case 'service-received':
      return matchesInvoiceListFilter(row, { preset: 'service-received', trcode: 4 });
    case 'waybill':
      return TRCODES_BY_INVOICE_CATEGORY.Irsaliye.includes(tc);
    case 'order':
      return TRCODES_BY_INVOICE_CATEGORY.Siparis.includes(tc);
    case 'quote':
      return TRCODES_BY_INVOICE_CATEGORY.Teklif.includes(tc);
    case 'purchase-request':
      return matchesInvoiceListFilter(row, { preset: 'purchase-request', trcode: 20 });
    default: {
      const trcodes = trcodesForCategories(['Iade']);
      const ficheTypes = ficheTypesForCategories(['Iade']).map((x) =>
        x.toLocaleLowerCase('tr-TR'),
      );
      return trcodes.includes(tc) || ficheTypes.includes(ftLower);
    }
  }
}

/** SQL WHERE parçası — $1 tabanlı parametre indeksi verilir */
export function buildInvoiceFilterClause(
  filter: InvoiceListFilter | undefined,
  startParamIndex: number,
): FilterClause {
  if (!filter || filter.preset === 'all') {
    return { sql: '', params: [] };
  }

  if (filter.trcode != null && filter.trcode > 0) {
    const legacy = filter.legacyFicheTypes ?? legacyFicheTypesByInvoiceType(filter.trcode);
    if (legacy.length > 0) {
      return {
        sql: ` AND (COALESCE(trcode, 0) = $${startParamIndex} OR fiche_type::text = ANY($${startParamIndex + 1}::text[]))`,
        params: [filter.trcode, legacy],
      };
    }
    return {
      sql: ` AND COALESCE(trcode, 0) = $${startParamIndex}`,
      params: [filter.trcode],
    };
  }

  switch (filter.preset) {
    case 'sales-return':
      return buildInvoiceFilterClause(
        { preset: 'sales-return', trcode: SALES_RETURN_TRCODE },
        startParamIndex,
      );
    case 'purchase-return':
      return buildInvoiceFilterClause(
        { preset: 'purchase-return', trcode: PURCHASE_RETURN_TRCODE },
        startParamIndex,
      );
    case 'sales': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Satis;
      const ficheTypes = legacyFicheTypesByCategory('Satis');
      return {
        sql: ` AND (COALESCE(trcode, 0) IN (${trcodes.join(',')}) OR fiche_type::text = ANY($${startParamIndex}::text[]))`,
        params: [ficheTypes],
      };
    }
    case 'purchase': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Alis.filter((tc) => tc !== PURCHASE_RETURN_TRCODE);
      const ficheTypes = legacyFicheTypesByCategory('Alis');
      return {
        sql: ` AND (COALESCE(trcode, 0) IN (${trcodes.join(',')}) OR fiche_type::text = ANY($${startParamIndex}::text[]))`,
        params: [ficheTypes],
      };
    }
    case 'service-given':
      return buildInvoiceFilterClause({ preset: 'service-given', trcode: 9 }, startParamIndex);
    case 'service-received':
      return buildInvoiceFilterClause({ preset: 'service-received', trcode: 4 }, startParamIndex);
    case 'waybill': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Irsaliye;
      return {
        sql: ` AND COALESCE(trcode, 0) IN (${trcodes.join(',')})`,
        params: [],
      };
    }
    case 'order': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Siparis;
      return {
        sql: ` AND COALESCE(trcode, 0) IN (${trcodes.join(',')})`,
        params: [],
      };
    }
    case 'quote': {
      const trcodes = TRCODES_BY_INVOICE_CATEGORY.Teklif;
      return {
        sql: ` AND COALESCE(trcode, 0) IN (${trcodes.join(',')})`,
        params: [],
      };
    }
    case 'purchase-request':
      return buildInvoiceFilterClause({ preset: 'purchase-request', trcode: 20 }, startParamIndex);
    default: {
      const trcodes = trcodesForCategories(['Iade']);
      const ficheTypes = ficheTypesForCategories(['Iade']);
      return {
        sql: ` AND (COALESCE(trcode, 0) IN (${trcodes.join(',')}) OR fiche_type::text = ANY($${startParamIndex}::text[]))`,
        params: [ficheTypes],
      };
    }
  }
}
