/**
 * Ağırlıklı ortalama birim maliyet — alış (ve açılış) satırlarından:
 * Σ tutar / Σ miktar. Alış iadesi düşülür.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from './postgres';
import {
  isPurchaseFiche,
  PURCHASE_RETURN_TRCODE,
  unitCostFromPurchaseLine,
  resolveLineProductId,
} from '../utils/lastPurchaseCostSql';
import {
  finalizeWeightedAvgUnitCost,
  mergeWeightedAvgMaps,
  type WeightedAvgAccumulator,
} from '../utils/weightedAverageUnitCost';

function padFirm(raw?: string | number | null): string {
  return String(raw || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0');
}

function padPeriod(raw?: string | number | null): string {
  return String(raw || ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0');
}

function isPurchaseReturnRow(row: { fiche_type?: unknown; trcode?: unknown }): boolean {
  const tc = Number(row.trcode ?? 0);
  // trcode 2/3 = satış iadesi — alış ortalamasına girmez
  if (tc === 2 || tc === 3) return false;
  if (tc === PURCHASE_RETURN_TRCODE) return true;
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  // Yalnızca açık alış iadesi (trcode 6); belirsiz return_invoice satış iadesi sayılır
  return ft === 'return_invoice' && tc === PURCHASE_RETURN_TRCODE;
}

function isOpeningOrPurchase(row: { fiche_type?: unknown; trcode?: unknown }): boolean {
  const ft = String(row.fiche_type || '')
    .trim()
    .toLowerCase();
  if (ft === 'opening_balance') return true;
  if (isPurchaseReturnRow(row)) return true;
  return isPurchaseFiche(row);
}

function finalizeMap(accByKey: Map<string, WeightedAvgAccumulator>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, acc] of accByKey) {
    const avg = finalizeWeightedAvgUnitCost(acc);
    if (avg > 0) out.set(k, avg);
  }
  return out;
}

/**
 * Ürün id + kod anahtarlarıyla ağırlıklı ortalama birim maliyet haritası.
 * @param asOfDate YYYY-MM-DD — bu tarihe kadar (dahil) alışlar; boşsa tümü
 */
export async function fetchWeightedAverageUnitCosts(opts?: {
  firmNr?: string | number | null;
  periodNr?: string | number | null;
  asOfDate?: string | null;
}): Promise<{ byProductId: Map<string, number>; byCode: Map<string, number> }> {
  const firmNr = padFirm(opts?.firmNr);
  const periodNr = padPeriod(opts?.periodNr);
  const asOf = String(opts?.asOfDate || '').slice(0, 10);
  const empty = { byProductId: new Map<string, number>(), byCode: new Map<string, number>() };

  const accById = new Map<string, WeightedAvgAccumulator>();
  const accByCode = new Map<string, WeightedAvgAccumulator>();

  const ingestLine = (
    inv: { fiche_type?: unknown; trcode?: unknown; date?: unknown; is_cancelled?: unknown; status?: unknown },
    it: Record<string, unknown>,
    productIdByCode?: Map<string, string>,
  ) => {
    if (inv.is_cancelled === true || inv.is_cancelled === 'true') return;
    const st = String(inv.status || '').toLowerCase().trim();
    if (['iptal', 'silindi', 'cancelled', 'canceled', 'deleted'].includes(st)) return;
    if (!isOpeningOrPurchase(inv)) return;
    if (asOf) {
      const d = String(inv.date || '').slice(0, 10);
      if (d && d > asOf) return;
    }
    const itemType = String(it.item_type || 'Malzeme');
    if (itemType === 'Promosyon' || itemType === 'İndirim') return;
    if (itemType === 'Hizmet' || itemType === 'Service') return;

    const qty = Number(it.quantity ?? 0) || 0;
    const unitCost = unitCostFromPurchaseLine(it);
    const amount = Math.abs(Number(it.net_amount ?? 0)) || unitCost * Math.abs(qty);
    const isReturn = isPurchaseReturnRow(inv);
    const pid =
      resolveLineProductId(it) ||
      (String(it.item_code || '').trim() && productIdByCode?.get(String(it.item_code || '').trim())) ||
      '';
    const code = String(it.item_code || '').trim();
    const line = { quantity: qty, unitCost, amount, isReturn };
    if (pid) mergeWeightedAvgMaps(accById, pid, line);
    if (code) mergeWeightedAvgMaps(accByCode, code, line);
  };

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./api/postgrestClient');
    const fn = firmNr;
    const pn = periodNr;
    const [sales, items, products] = await Promise.all([
      postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_${pn}_sales`,
          {
            select: 'id,date,fiche_type,is_cancelled,status,trcode',
            order: 'date.asc',
            limit: '12000',
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]),
      postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_${pn}_sale_items`,
          {
            select: 'invoice_id,product_id,item_code,item_type,quantity,net_amount,unit_price,unit_cost',
            limit: '20000',
          },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]),
      postgrest
        .get<Record<string, unknown>[]>(
          `/rex_${fn}_products`,
          { select: 'id,code,barcode', limit: '8000' },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]),
    ]);

    const salesById = new Map((sales || []).map((s) => [String(s.id), s]));
    const productIdByCode = new Map<string, string>();
    for (const p of products || []) {
      const id = String(p.id);
      const code = String(p.code || '').trim();
      const barcode = String(p.barcode || '').trim();
      if (code) productIdByCode.set(code, id);
      if (barcode) productIdByCode.set(barcode, id);
    }

    for (const it of items || []) {
      const inv = salesById.get(String(it.invoice_id));
      if (!inv) continue;
      ingestLine(inv, it, productIdByCode);
    }
  } else {
    const asOfClause = asOf
      ? `AND (s.date::timestamptz AT TIME ZONE 'UTC')::date <= $2::date`
      : '';
    const params: unknown[] = [firmNr];
    if (asOf) params.push(asOf);
    const { rows } = await postgres.query(
      `
      SELECT
        s.fiche_type,
        s.trcode,
        s.date,
        s.is_cancelled,
        s.status,
        si.product_id,
        si.item_code,
        si.item_type,
        si.quantity,
        si.net_amount,
        si.unit_price,
        si.unit_cost
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.invoice_id
      WHERE s.firm_nr = $1
        AND COALESCE(s.is_cancelled, false) = false
        AND LOWER(TRIM(COALESCE(s.status, ''))) NOT IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')
        AND (
          s.fiche_type IN ('purchase_invoice', 'a', 'opening_balance')
          OR COALESCE(s.trcode, 0) IN (1, 4, 5, 13, 26, 41, 42)
          OR COALESCE(s.trcode, 0) = ${PURCHASE_RETURN_TRCODE}
          OR (s.fiche_type = 'return_invoice' AND COALESCE(s.trcode, 0) = ${PURCHASE_RETURN_TRCODE})
        )
        AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim', 'Hizmet', 'Service')
        ${asOfClause}
      `,
      params,
    );

    for (const r of rows || []) {
      ingestLine(r as any, r as any);
    }
  }

  return {
    byProductId: finalizeMap(accById),
    byCode: finalizeMap(accByCode),
  };
}

export function lookupWeightedAvgUnitCost(
  maps: { byProductId: Map<string, number>; byCode: Map<string, number> } | null | undefined,
  product: { id?: string | null; code?: string | null; barcode?: string | null },
): number {
  if (!maps) return 0;
  const id = String(product.id || '').trim();
  if (id && maps.byProductId.has(id)) return maps.byProductId.get(id) || 0;
  const code = String(product.code || '').trim();
  if (code && maps.byCode.has(code)) return maps.byCode.get(code) || 0;
  const barcode = String(product.barcode || '').trim();
  if (barcode && maps.byCode.has(barcode)) return maps.byCode.get(barcode) || 0;
  return 0;
}
