/**
 * RetailEX dönem belgeleri → Logo REST (fatura / sipariş / irsaliye).
 * rex_{firm}_{period}_sales.logo_sync_status = 'pending' + fiche_type filtresi.
 */

import {
  extractLogoInternalRef,
  logoCreateResource,
  logoRefreshSession,
  loadLogoRestConfig,
  type LogoResourceName,
  type LogoRestConfig,
} from './logoRestApi';
import type { LogoSyncLogEntry } from './logoRestSync';
import { DB_SETTINGS, ERP_SETTINGS, postgres } from './postgres';

export type LogoDocumentPushResult = {
  processed: number;
  success: number;
  errors: number;
  messages: string[];
};

export type LogoDocumentPushKind =
  | 'salesInvoices'
  | 'purchaseInvoices'
  | 'salesOrders'
  | 'purchaseOrders'
  | 'salesDispatches'
  | 'purchaseDispatches';

type KindSpec = {
  resource: LogoResourceName;
  label: string;
  /** fiche_type IN (...) — boş/null satış faturası sayılır (POS) */
  ficheTypes: string[];
  includeNullFicheType: boolean;
  logoType: number;
};

const KIND_SPECS: Record<LogoDocumentPushKind, KindSpec> = {
  salesInvoices: {
    resource: 'salesInvoices',
    label: 'satış faturası',
    ficheTypes: ['sales_invoice', 'sale', 'retail', 'pos'],
    includeNullFicheType: true,
    logoType: 8,
  },
  purchaseInvoices: {
    resource: 'purchaseInvoices',
    label: 'alış faturası',
    ficheTypes: ['purchase_invoice'],
    includeNullFicheType: false,
    logoType: 1,
  },
  salesOrders: {
    resource: 'salesOrders',
    label: 'satış siparişi',
    ficheTypes: ['sales_order'],
    includeNullFicheType: false,
    logoType: 1,
  },
  purchaseOrders: {
    resource: 'purchaseOrders',
    label: 'alış siparişi',
    ficheTypes: ['purchase_order'],
    includeNullFicheType: false,
    logoType: 2,
  },
  salesDispatches: {
    resource: 'salesDispatches',
    label: 'satış irsaliyesi',
    ficheTypes: ['sales_dispatch'],
    includeNullFicheType: false,
    logoType: 8,
  },
  purchaseDispatches: {
    resource: 'purchaseDispatches',
    label: 'alış irsaliyesi',
    ficheTypes: ['purchase_dispatch'],
    includeNullFicheType: false,
    logoType: 1,
  },
};

function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
}

function periodNrPadded(): string {
  return String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
}

function salesTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_sales`;
}

function saleItemsTable(): string {
  return `rex_${firmNrPadded()}_${periodNrPadded()}_sale_items`;
}

function formatLogoDate(raw: unknown): string {
  const d = raw ? new Date(String(raw)) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function matchesKind(sale: Record<string, unknown>, spec: KindSpec): boolean {
  const ft = String(sale.fiche_type ?? '').trim().toLowerCase();
  if (!ft) return spec.includeNullFicheType;
  return spec.ficheTypes.some((x) => x.toLowerCase() === ft);
}

async function fetchPendingDocuments(
  spec: KindSpec,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const table = salesTable();
  const fetchLimit = Math.max(limit * 3, limit);

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      `/${table}`,
      {
        select: '*',
        logo_sync_status: 'eq.pending',
        is_cancelled: 'eq.false',
        order: 'date.asc',
        limit: fetchLimit,
      },
      { schema: 'public' },
    );
    const list = Array.isArray(rows) ? rows : [];
    return list.filter((r) => matchesKind(r, spec)).slice(0, limit);
  }

  const types = spec.ficheTypes;
  const nullClause = spec.includeNullFicheType
    ? ` OR fiche_type IS NULL OR TRIM(COALESCE(fiche_type,'')) = ''`
    : '';
  const { rows } = await postgres.query<Record<string, unknown>>(
    `SELECT * FROM ${table}
     WHERE logo_sync_status = 'pending'
       AND COALESCE(is_cancelled, false) = false
       AND (
         LOWER(TRIM(COALESCE(fiche_type,''))) = ANY($2::text[])
         ${nullClause}
       )
     ORDER BY date ASC
     LIMIT $1`,
    [limit, types.map((t) => t.toLowerCase())],
  );
  return rows;
}

async function fetchSaleItems(invoiceId: string): Promise<Record<string, unknown>[]> {
  const table = saleItemsTable();
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<Record<string, unknown>[]>(
      `/${table}`,
      {
        select: '*',
        invoice_id: `eq.${invoiceId}`,
        limit: 500,
      },
      { schema: 'public' },
    );
    return Array.isArray(rows) ? rows : [];
  }
  const { rows } = await postgres.query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE invoice_id = $1`,
    [invoiceId],
  );
  return rows;
}

async function resolveArpCode(sale: Record<string, unknown>): Promise<string> {
  const direct = String(sale.customer_code || '').trim();
  if (direct) return direct.slice(0, 50);
  const customerId = String(sale.customer_id || '').trim();
  if (!customerId) return String(sale.customer_name || 'PERAKENDE').trim().slice(0, 50);

  const firm = firmNrPadded();
  for (const table of [`rex_${firm}_customers`, `rex_${firm}_suppliers`]) {
    try {
      if (DB_SETTINGS.connectionProvider === 'rest_api') {
        const { postgrest } = await import('./api/postgrestClient');
        const rows = await postgrest.get<{ code?: string }[]>(
          `/${table}`,
          { select: 'code', id: `eq.${customerId}`, limit: 1 },
          { schema: 'public' },
        );
        const code = Array.isArray(rows) ? String(rows[0]?.code || '').trim() : '';
        if (code) return code.slice(0, 50);
      } else {
        const { rows } = await postgres.query<{ code: string }>(
          `SELECT code FROM ${table} WHERE id = $1 LIMIT 1`,
          [customerId],
        );
        const code = String(rows[0]?.code || '').trim();
        if (code) return code.slice(0, 50);
      }
    } catch {
      /* tablo yok / kolon yok */
    }
  }
  return String(sale.customer_name || 'PERAKENDE').trim().slice(0, 50);
}

async function markSaleSyncStatus(
  saleId: string,
  status: 'success' | 'error' | 'pending',
  error?: string,
  refId?: number | null,
): Promise<void> {
  const table = salesTable();
  const patch: Record<string, unknown> = {
    logo_sync_status: status,
    logo_sync_error: error || null,
    logo_sync_date: new Date().toISOString(),
  };
  if (refId != null && refId > 0) patch.ref_id = refId;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(`/${table}?id=eq.${encodeURIComponent(saleId)}`, patch, {
      schema: 'public',
      prefer: 'return=minimal',
    });
    return;
  }
  if (refId != null && refId > 0) {
    await postgres.query(
      `UPDATE ${table}
       SET logo_sync_status = $2,
           logo_sync_error = $3,
           logo_sync_date = NOW(),
           ref_id = COALESCE($4, ref_id)
       WHERE id = $1`,
      [saleId, status, error || null, refId],
    );
    return;
  }
  await postgres.query(
    `UPDATE ${table}
     SET logo_sync_status = $2,
         logo_sync_error = $3,
         logo_sync_date = NOW()
     WHERE id = $1`,
    [saleId, status, error || null],
  );
}

function buildDocumentRecord(
  sale: Record<string, unknown>,
  lines: Record<string, unknown>[],
  arpCode: string,
  logoType: number,
): Record<string, unknown> {
  const ficheNo = String(sale.fiche_no || sale.document_no || '').trim();
  const trLines = lines.map((ln, idx) => ({
    TYPE: 0,
    MASTER_CODE: String(ln.item_code || '').trim(),
    QUANTITY: Number(ln.quantity) || 1,
    PRICE: Number(ln.unit_price) || 0,
    TOTAL: Number(ln.net_amount ?? ln.total_amount) || 0,
    VAT_RATE: Number(ln.vat_rate) || 0,
    UNIT_CODE: String(ln.unit || 'AD').slice(0, 10),
    LINE_NO: idx + 1,
  }));

  return {
    TYPE: logoType,
    NUMBER: ficheNo || `REX-${String(sale.id || '').slice(0, 8)}`,
    DATE: formatLogoDate(sale.date),
    ARP_CODE: arpCode.slice(0, 50),
    SOURCE_WH: 0,
    SOURCEINDEX: 9,
    TOTAL_NET: Number(sale.total_net ?? sale.net_amount) || 0,
    TOTAL_GROSS: Number(sale.total_gross) || 0,
    TOTAL_VAT: Number(sale.total_vat) || 0,
    NOTES1: String(sale.notes || 'RetailEX'),
    TRANSACTIONS: { items: trLines },
  };
}

export async function pushPendingDocumentsToLogo(
  kind: LogoDocumentPushKind,
  cfg?: LogoRestConfig,
  opts: {
    limit?: number;
    onLog?: (entry: LogoSyncLogEntry) => void;
    refreshSession?: boolean;
  } = {},
): Promise<LogoDocumentPushResult> {
  const spec = KIND_SPECS[kind];
  const config = cfg ?? loadLogoRestConfig();
  const limit = opts.limit ?? 20;
  const messages: string[] = [];
  let success = 0;
  let errors = 0;
  const log = (entry: LogoSyncLogEntry) => opts.onLog?.(entry);

  try {
    if (opts.refreshSession !== false) {
      await logoRefreshSession(config);
    }

    const pending = await fetchPendingDocuments(spec, limit);
    messages.push(`${pending.length} bekleyen ${spec.label} bulundu.`);

    for (const sale of pending) {
      const saleId = String(sale.id || '');
      const ficheNo = String(sale.fiche_no || sale.document_no || saleId).trim();

      try {
        const lines = saleId ? await fetchSaleItems(saleId) : [];
        const arpCode = await resolveArpCode(sale);
        const restRecord = buildDocumentRecord(sale, lines, arpCode, spec.logoType);
        const created = await logoCreateResource(config, spec.resource, restRecord);
        const logoRef = extractLogoInternalRef(created);
        await markSaleSyncStatus(saleId, 'success', undefined, logoRef);
        success += 1;
        log({
          at: new Date().toISOString(),
          entity: 'invoice',
          action: 'create',
          code: ficheNo,
          name: String(sale.customer_name || ''),
          detail: logoRef
            ? `${spec.label}: ${lines.length} satır (ref ${logoRef})`
            : `${spec.label}: ${lines.length} satır Logo'ya yazıldı`,
          ok: true,
        });
        messages.push(`${spec.label} ${ficheNo} → Logo OK`);
      } catch (e: unknown) {
        errors += 1;
        const msg = e instanceof Error ? e.message : String(e);
        if (saleId) await markSaleSyncStatus(saleId, 'error', msg).catch(() => {});
        log({
          at: new Date().toISOString(),
          entity: 'invoice',
          action: 'error',
          code: ficheNo,
          name: String(sale.customer_name || ''),
          detail: msg,
          ok: false,
        });
        messages.push(`${spec.label} ${ficheNo} hata: ${msg}`);
      }
    }

    return { processed: pending.length, success, errors, messages };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/logo_sync_status|42703|does not exist/i.test(msg)) {
      messages.push(`${spec.label}: logo_sync kolonları eksik — ${msg}`);
      return { processed: 0, success: 0, errors: 1, messages };
    }
    messages.push(`${spec.label} aktarımı başarısız: ${msg}`);
    return { processed: 0, success, errors: errors + 1, messages };
  }
}
