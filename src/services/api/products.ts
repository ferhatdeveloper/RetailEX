/**
 * Product API - Direct PostgreSQL Implementation
 * Note: Uses rex_{firm}_products table
 */

import { shouldUsePostgrestForCrud, shouldUseTenantPostgrestApi } from '../../config/postgrest.config';
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import type { Product } from '../../core/types';
import { expandBarcodeLookupKeys } from '../../utils/barcodeParser';
import { useAuthStore } from '../../store/useAuthStore';

/** Malzeme listesi: uzun metin kolonları hariç (ağ payload + parse maliyeti) */
const PRODUCT_LIST_SELECT =
  'id,firm_nr,code,barcode,name,name2,description_tr,description_en,description_ar,description_ku,image_url,image_url_cdn,category_code,group_code,sub_group_code,brand,model,manufacturer,supplier,origin,material_type,unit,unitset_id,vat_rate,price,cost,stock,min_stock,max_stock,critical_stock,is_active,has_variants,special_code_1,special_code_2,special_code_3,special_code_4,special_code_5,special_code_6,price_list_1,price_list_2,price_list_3,price_list_4,price_list_5,price_list_6,currency,purchase_price_usd,purchase_price_eur,sale_price_usd,sale_price_eur,custom_exchange_rate,auto_calculate_usd,follow_up_reminder_days,is_scale_product,plu_code,expiry_date,expiry_tracking,shelf_life_days,created_at,updated_at';
const PRODUCT_LIST_SELECT_SQL = PRODUCT_LIST_SELECT.replace(/,/g, ', ');
/** Migration 035/047/104 öncesi tenant şemaları */
const PRODUCT_LIST_SELECT_FALLBACK = PRODUCT_LIST_SELECT
  .replace(',expiry_date,expiry_tracking,shelf_life_days', '')
  .replace(',plu_code', '')
  .replace(',is_scale_product', '')
  .replace(',follow_up_reminder_days', '');
const PRODUCT_LIST_SELECT_FALLBACK_SQL = PRODUCT_LIST_SELECT_FALLBACK.replace(/,/g, ', ');

/** Malzeme / stok raporları: yalnızca rapor kolonları (payload ve parse süresini kısaltır). */
const PRODUCT_REPORT_LIST_SELECT =
  'id,firm_nr,code,barcode,name,name2,category_code,stock,min_stock,max_stock,price,cost,unit,brand,is_active';
const PRODUCT_REPORT_LIST_SELECT_SQL = PRODUCT_REPORT_LIST_SELECT.replace(/,/g, ', ');
/** Eski tenant şemalarında eksik kolona takılmamak için güvenli fallback select listesi. */
const PRODUCT_REPORT_LIST_SELECT_FALLBACK =
  'id,firm_nr,code,barcode,name,name2,category_code,stock,min_stock,max_stock,price,cost,unit,brand';
const PRODUCT_REPORT_LIST_SELECT_FALLBACK_SQL = PRODUCT_REPORT_LIST_SELECT_FALLBACK.replace(/,/g, ', ');

/** `rex_001_products` tablo eki — postgres rewriter ile uyumlu */
function firmNrPadded(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

/** DB firm_nr: hem 001 hem 1 formatı (Tauri/web firma seçimi) */
function firmNrMatchValues(): { eq: string; raw: string } {
  const raw = String(ERP_SETTINGS.firmNr ?? '').trim();
  const eq = firmNrPadded();
  return { eq, raw: raw || eq };
}

function periodNrPadded(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

/** Tartılı barkod PLU — kod/barkod/özel kod varyantları (10 hane: 1000000009). */
export function scalePluLookupVariants(plu: string): string[] {
  const t = String(plu ?? '').trim();
  if (!t) return [];
  const stripped = t.replace(/^0+/, '') || '0';
  const out = new Set<string>([
    t,
    stripped,
    stripped.padStart(4, '0'),
    stripped.padStart(5, '0'),
    stripped.padStart(6, '0'),
    stripped.padStart(10, '0'),
    t.padStart(4, '0'),
    t.padStart(5, '0'),
    t.padStart(6, '0'),
    t.padStart(10, '0'),
  ]);

  // 10 haneli sabit tartı kodu (code10): dept+PLU6 varyantları gereksiz — sorgu yükünü azaltır
  if (t.length < 10) {
    for (const dept of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      out.add(`${dept}${stripped.padStart(8, '0')}`);
      out.add(`${dept}${t.padStart(8, '0')}`);
    }
    if (stripped.length > 0 && stripped.length <= 6) {
      out.add(`1${stripped.padStart(8, '0')}`);
    }
  } else if (t.length > 6) {
    out.add(t.slice(-6));
  }

  return [...out].filter(Boolean);
}

/** camelCase → snake_case (create / update / bulkUpdate) */
const PRODUCT_DB_FIELD_MAPPING: Record<string, string> = {
  minStock: 'min_stock',
  maxStock: 'max_stock',
  criticalStock: 'critical_stock',
  category: 'category_code',
  categoryCode: 'category_code',
  groupCode: 'group_code',
  subGroupCode: 'sub_group_code',
  specialCode1: 'special_code_1',
  specialCode2: 'special_code_2',
  specialCode3: 'special_code_3',
  specialCode4: 'special_code_4',
  specialCode5: 'special_code_5',
  specialCode6: 'special_code_6',
  priceList1: 'price_list_1',
  priceList2: 'price_list_2',
  priceList3: 'price_list_3',
  priceList4: 'price_list_4',
  priceList5: 'price_list_5',
  priceList6: 'price_list_6',
  taxRate: 'vat_rate',
  vatRate: 'vat_rate',
  materialType: 'material_type',
  isActive: 'is_active',
  hasVariants: 'has_variants',
  customExchangeRate: 'custom_exchange_rate',
  autoCalculateUSD: 'auto_calculate_usd',
  salePriceUSD: 'sale_price_usd',
  purchasePriceUSD: 'purchase_price_usd',
  salePriceEUR: 'sale_price_eur',
  purchasePriceEUR: 'purchase_price_eur',
  unitsetId: 'unitset_id',
  image_url_cdn: 'image_url_cdn',
  followUpReminderDays: 'follow_up_reminder_days',
  isScaleProduct: 'is_scale_product',
  pluCode: 'plu_code',
  expiryTracking: 'expiry_tracking',
  expiryDate: 'expiry_date',
  shelfLifeDays: 'shelf_life_days',
  description_tr: 'description_tr',
  description_en: 'description_en',
  description_ar: 'description_ar',
  description_ku: 'description_ku',
  price: 'price',
  cost: 'cost',
  stock: 'stock',
  unit: 'unit',
  brand: 'brand',
  model: 'model',
  manufacturer: 'manufacturer',
  supplier: 'supplier',
  origin: 'origin',
  currency: 'currency',
  barcode: 'barcode',
  code: 'code',
  name: 'name',
};

/** UPDATE/PATCH'e yazılabilir kolonlar (frontend-only alanları eler) */
const PRODUCT_PATCHABLE_COLUMNS = new Set(
  PRODUCT_LIST_SELECT.split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== 'id' && c !== 'firm_nr' && c !== 'created_at'),
);

function resolveProductDbColumn(key: string): string | null {
  if (key === 'id' || key === 'firm_nr') return null;
  const mapped = PRODUCT_DB_FIELD_MAPPING[key];
  if (mapped) return mapped;
  if (PRODUCT_PATCHABLE_COLUMNS.has(key)) return key;
  return null;
}

function productFirmFilterCandidates(): string[] {
  const { eq, raw } = firmNrMatchValues();
  const digits = eq.replace(/\D/g, '');
  const stripped = digits.replace(/^0+/, '') || digits;
  return [...new Set([eq, raw, stripped].filter(Boolean))];
}

function firmNrEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = String(a ?? '').replace(/\D/g, '');
  const nb = String(b ?? '').replace(/\D/g, '');
  if (!na || !nb) return false;
  const pa = na.padStart(3, '0');
  const pb = nb.padStart(3, '0');
  return pa === pb || na.replace(/^0+/, '') === nb.replace(/^0+/, '');
}

function activeProductFirmLabel(): string {
  return firmNrPadded();
}

async function getProductRowFirmNr(tableName: string, id: string): Promise<string | null> {
  if (shouldUsePostgrestForCrud()) {
    const { postgrest } = await import('./postgrestClient');
    for (const firmFilter of productFirmFilterCandidates()) {
      const rows = await postgrest.get<{ firm_nr?: string }[]>(
        `/${tableName}`,
        {
          select: 'firm_nr',
          id: `eq.${id}`,
          firm_nr: `eq.${firmFilter}`,
          limit: 1,
        },
        { schema: 'public' },
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.firm_nr != null) return String(row.firm_nr);
    }
    const rows = await postgrest.get<{ firm_nr?: string }[]>(
      `/${tableName}`,
      { select: 'firm_nr', id: `eq.${id}`, limit: 1 },
      { schema: 'public' },
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    const fn = row.firm_nr != null ? String(row.firm_nr).trim() : '';
    return fn || activeProductFirmLabel();
  }
  const { rows } = await postgres.query<{ firm_nr?: string }>(
    `SELECT firm_nr FROM ${tableName} WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const fn = rows[0].firm_nr != null ? String(rows[0].firm_nr).trim() : '';
  return fn || activeProductFirmLabel();
}

async function assertProductInActiveFirm(tableName: string, id: string): Promise<void> {
  const activeFirm = activeProductFirmLabel();
  const rowFirm = await getProductRowFirmNr(tableName, id);
  if (!rowFirm) {
    throw new Error(
      `Ürün firma ${activeFirm} tablosunda bulunamadı. Üst çubuktan doğru firmayı seçip ürün listesini yenileyin.`,
    );
  }
  if (!firmNrEquivalent(rowFirm, activeFirm)) {
    throw new Error(
      `Bu ürün firma ${rowFirm} kaydına ait; şu an firma ${activeFirm} seçili. Firma değiştirin veya doğru firmada açın.`,
    );
  }
}

/** PostgREST `or=(col.ilike.*x*)` içinde güvenli alt string */
function sanitizePostgrestIlike(q: string): string {
  return String(q || '')
    .trim()
    .replace(/[*%,().]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function isPostgrestMissingColumnError(error: unknown, column: string): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? '');
  return (
    message.includes('PGRST204') &&
    message.toLowerCase().includes(String(column).toLowerCase())
  );
}

/** Eski tenant şemalarında henüz migration uygulanmamış kolonlar (053, 047, 035) */
const OPTIONAL_PRODUCT_DB_COLUMNS = [
  'expiry_date',
  'expiry_tracking',
  'shelf_life_days',
  'is_scale_product',
  'plu_code',
  'follow_up_reminder_days',
] as const;

function stripOptionalProductColumns(row: Record<string, unknown>, column: string): Record<string, unknown> {
  const next = { ...row };
  delete next[column];
  return next;
}

function extractMissingPgColumn(error: unknown): string | null {
  const msg = String((error as { message?: string })?.message ?? error ?? '');
  const quoted = msg.match(/column "([^"]+)" (?:of relation )?does not exist/i);
  if (quoted?.[1]) return quoted[1];
  const unquoted = msg.match(/column ([a-z0-9_]+) does not exist/i);
  return unquoted?.[1] ?? null;
}

async function postgrestCreateProductRow(
  tableName: string,
  row: Record<string, unknown>
): Promise<unknown> {
  const { postgrest } = await import('./postgrestClient');
  try {
    return await postgrest.post<unknown>(`/${tableName}`, row, {
      schema: 'public',
      prefer: 'return=representation',
    });
  } catch (error) {
    for (const col of OPTIONAL_PRODUCT_DB_COLUMNS) {
      if (col in row && isPostgrestMissingColumnError(error, col)) {
        return postgrestCreateProductRow(tableName, stripOptionalProductColumns(row, col));
      }
    }
    throw error;
  }
}

async function postgrestPatchProductRow(
  tableName: string,
  id: string,
  patchBody: Record<string, unknown>
): Promise<unknown> {
  const { postgrest } = await import('./postgrestClient');

  const patchOnce = async (path: string, body: Record<string, unknown>): Promise<unknown> => {
    try {
      return await postgrest.patch<unknown[]>(path, body, {
        schema: 'public',
        prefer: 'return=representation',
      });
    } catch (error) {
      for (const col of OPTIONAL_PRODUCT_DB_COLUMNS) {
        if (col in body && isPostgrestMissingColumnError(error, col)) {
          return postgrestPatchProductRow(tableName, id, stripOptionalProductColumns(body, col));
        }
      }
      throw error;
    }
  };

  const hasRows = (patched: unknown): boolean =>
    Array.isArray(patched) ? patched.length > 0 : Boolean(patched);

  for (const firmFilter of productFirmFilterCandidates()) {
    const path = `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firmFilter)}`;
    const patched = await patchOnce(path, patchBody);
    if (hasRows(patched)) return patched;
  }

  const pathIdOnly = `/${tableName}?id=eq.${encodeURIComponent(id)}`;
  return patchOnce(pathIdOnly, patchBody);
}

async function postgrestPatchProductRowsBulk(
  tableName: string,
  idInList: string,
  patchBody: Record<string, unknown>
): Promise<unknown> {
  const { postgrest } = await import('./postgrestClient');

  const patchOnce = async (path: string, body: Record<string, unknown>): Promise<unknown> => {
    try {
      return await postgrest.patch<unknown[]>(path, body, {
        schema: 'public',
        prefer: 'return=representation',
      });
    } catch (error) {
      for (const col of OPTIONAL_PRODUCT_DB_COLUMNS) {
        if (col in body && isPostgrestMissingColumnError(error, col)) {
          return postgrestPatchProductRowsBulk(tableName, idInList, stripOptionalProductColumns(body, col));
        }
      }
      throw error;
    }
  };

  const hasRows = (patched: unknown): boolean =>
    Array.isArray(patched) ? patched.length > 0 : Boolean(patched);

  for (const firmFilter of productFirmFilterCandidates()) {
    const path = `/${tableName}?id=in.(${idInList})&firm_nr=eq.${encodeURIComponent(firmFilter)}`;
    const patched = await patchOnce(path, patchBody);
    if (hasRows(patched)) return patched;
  }

  const pathIdOnly = `/${tableName}?id=in.(${idInList})`;
  return patchOnce(pathIdOnly, patchBody);
}

async function insertProductRowSql(
  tableName: string,
  productData: Record<string, unknown>
): Promise<any | null> {
  let data = { ...productData };
  while (true) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    try {
      const { rows } = await postgres.query(query, values);
      return rows[0] ?? null;
    } catch (error) {
      if (!isUndefinedColumnError(error)) throw error;
      const missing = extractMissingPgColumn(error);
      if (
        !missing ||
        !(missing in data) ||
        !(OPTIONAL_PRODUCT_DB_COLUMNS as readonly string[]).includes(missing)
      ) {
        throw error;
      }
      data = stripOptionalProductColumns(data, missing);
      if (Object.keys(data).length === 0) throw error;
    }
  }
}

function isUndefinedColumnError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return message.includes('42703') || (message.includes('column') && message.includes('does not exist'));
}

async function fetchDeleteImpactViaPostgrest(productIds: string[]): Promise<{
  hasInvoiceRefs: boolean;
  saleRefs: { productId: string; invoiceNo: string }[];
  purchaseRefs: { productId: string; invoiceNo: string }[];
}> {
  const ids = (productIds || []).filter(Boolean);
  const empty = {
    hasInvoiceRefs: false,
    saleRefs: [] as { productId: string; invoiceNo: string }[],
    purchaseRefs: [] as { productId: string; invoiceNo: string }[],
  };
  if (ids.length === 0) return empty;
  const firm = firmNrPadded();
  const period = periodNrPadded();
  const saleRefs: { productId: string; invoiceNo: string }[] = [];
  const purchaseRefs: { productId: string; invoiceNo: string }[] = [];
  const inList = ids.join(',');
  try {
    const { postgrest } = await import('./postgrestClient');
    const saleItemsPath = `/rex_${firm}_${period}_sale_items`;
    const si = await postgrest.get<any[]>(
      saleItemsPath,
      { select: 'product_id,invoice_id', product_id: `in.(${inList})`, limit: 200 },
      { schema: 'public' }
    );
    const invoiceIds = [...new Set((si || []).map((r) => r.invoice_id).filter(Boolean))];
    const salesById: Record<string, any> = {};
    if (invoiceIds.length > 0) {
      const salesPath = `/rex_${firm}_${period}_sales`;
      const sales = await postgrest.get<any[]>(
        salesPath,
        { select: 'id,fiche_no,document_no', id: `in.(${invoiceIds.join(',')})`, limit: 200 },
        { schema: 'public' }
      );
      for (const s of sales || []) salesById[String(s.id)] = s;
    }
    for (const r of si || []) {
      const inv = salesById[String(r.invoice_id)];
      saleRefs.push({
        productId: String(r.product_id),
        invoiceNo: String(inv?.fiche_no || inv?.document_no || r.invoice_id || ''),
      });
    }

    const smiPath = `/rex_${firm}_${period}_stock_movement_items`;
    const mi = await postgrest.get<any[]>(
      smiPath,
      { select: 'product_id,movement_id', product_id: `in.(${inList})`, limit: 200 },
      { schema: 'public' }
    );
    const mids = [...new Set((mi || []).map((r) => r.movement_id).filter(Boolean))];
    const movById: Record<string, any> = {};
    if (mids.length > 0) {
      const mov = await postgrest.get<any[]>(
        `/rex_${firm}_${period}_stock_movements`,
        {
          select: 'id,document_no,movement_type',
          id: `in.(${mids.join(',')})`,
          limit: 200,
        },
        { schema: 'public' }
      );
      for (const m of mov || []) movById[String(m.id)] = m;
    }
    for (const r of mi || []) {
      const m = movById[String(r.movement_id)];
      const mt = String(m?.movement_type || '').toLowerCase();
      if (mt === 'in' || mt === 'purchase') {
        purchaseRefs.push({
          productId: String(r.product_id),
          invoiceNo: String(m?.document_no || r.movement_id || ''),
        });
      }
    }
  } catch (e) {
    console.warn('[ProductAPI] getDeleteImpact PostgREST:', e);
  }
  return {
    hasInvoiceRefs: saleRefs.length > 0 || purchaseRefs.length > 0,
    saleRefs,
    purchaseRefs,
  };
}

export const productAPI = {
  async verifyManagementPassword(password: string): Promise<boolean> {
    const pwd = String(password || '').trim();
    if (!pwd) return false;
    if (shouldUsePostgrestForCrud()) {
      console.warn(
        '[ProductAPI] Yönetici şifresi doğrulaması PostgREST üzerinden yapılmıyor; zorunlu silme için pg_bridge veya RPC eklenmelidir.'
      );
      return false;
    }
    try {
      const firmNr = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
      const { rows } = await postgres.query<{ ok: number }>(
        `SELECT 1 AS ok
         FROM public.users u
         LEFT JOIN public.roles r ON r.id = u.role_id
         WHERE LPAD(TRIM(COALESCE(u.firm_nr, '')), 3, '0') = LPAD(TRIM($1), 3, '0')
           AND u.is_active = true
           AND LOWER(COALESCE(NULLIF(u.role, ''), r.name, '')) IN ('admin', 'manager', 'yonetici', 'yönetici')
           AND u.password_hash IS NOT NULL
           AND (
             u.password_hash = crypt($2, u.password_hash)
             OR u.password_hash = $2
           )
         LIMIT 1`,
        [firmNr, pwd]
      );
      return rows.length > 0;
    } catch (error) {
      console.error('[ProductAPI] verifyManagementPassword failed:', error);
      return false;
    }
  },

  async getDeleteImpact(productIds: string[]): Promise<{
    hasInvoiceRefs: boolean;
    saleRefs: { productId: string; invoiceNo: string }[];
    purchaseRefs: { productId: string; invoiceNo: string }[];
  }> {
    const ids = (productIds || []).filter(Boolean);
    if (ids.length === 0) {
      return { hasInvoiceRefs: false, saleRefs: [], purchaseRefs: [] };
    }

    if (shouldUseTenantPostgrestApi()) {
      return fetchDeleteImpactViaPostgrest(ids);
    }

    const firmNr = String(ERP_SETTINGS.firmNr || '001').padStart(3, '0');
    const periodNr = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0');
    const salesTable = `rex_${firmNr}_${periodNr}_sales`;
    const saleItemsTable = `rex_${firmNr}_${periodNr}_sale_items`;
    const stockMovementsTable = `rex_${firmNr}_${periodNr}_stock_movements`;
    const stockMovementItemsTable = `rex_${firmNr}_${periodNr}_stock_movement_items`;

    const saleRefs: { productId: string; invoiceNo: string }[] = [];
    const purchaseRefs: { productId: string; invoiceNo: string }[] = [];

    try {
      const saleTableExists = await postgres.query<{ reg: string | null }>(
        'SELECT to_regclass($1) AS reg',
        [saleItemsTable]
      );
      if (saleTableExists.rows[0]?.reg) {
        const { rows } = await postgres.query<{ product_id: string; invoice_no: string }>(
          `SELECT si.product_id::text AS product_id,
                  COALESCE(s.fiche_no, s.document_no, s.id::text) AS invoice_no
           FROM ${saleItemsTable} si
           LEFT JOIN ${salesTable} s ON s.id = si.invoice_id
           WHERE si.product_id = ANY($1::uuid[])
           LIMIT 200`,
          [ids]
        );
        rows.forEach((r) => {
          saleRefs.push({ productId: r.product_id, invoiceNo: r.invoice_no });
        });
      }
    } catch (error) {
      console.warn('[ProductAPI] getDeleteImpact sales lookup skipped:', error);
    }

    try {
      const movementItemsExists = await postgres.query<{ reg: string | null }>(
        'SELECT to_regclass($1) AS reg',
        [stockMovementItemsTable]
      );
      if (movementItemsExists.rows[0]?.reg) {
        const { rows } = await postgres.query<{ product_id: string; invoice_no: string }>(
          `SELECT smi.product_id::text AS product_id,
                  COALESCE(sm.document_no, sm.id::text) AS invoice_no
           FROM ${stockMovementItemsTable} smi
           LEFT JOIN ${stockMovementsTable} sm ON sm.id = smi.movement_id
           WHERE smi.product_id = ANY($1::uuid[])
             AND COALESCE(sm.movement_type, '') IN ('in', 'purchase')
           LIMIT 200`,
          [ids]
        );
        rows.forEach((r) => {
          purchaseRefs.push({ productId: r.product_id, invoiceNo: r.invoice_no });
        });
      }
    } catch (error) {
      console.warn('[ProductAPI] getDeleteImpact purchase lookup skipped:', error);
    }

    return {
      hasInvoiceRefs: saleRefs.length > 0 || purchaseRefs.length > 0,
      saleRefs,
      purchaseRefs,
    };
  },

  /**
   * Dönem stok hareketlerinde (in / purchase) kaydı olmayan ürün id'leri.
   * `getDeleteImpact` ile parça parça taranır (PostgREST / PG uyumlu).
   */
  async filterIdsWithoutPurchaseHistory(productIds: string[]): Promise<string[]> {
    const ids = [...new Set((productIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!ids.length) return [];
    const withPurchase = new Set<string>();
    const CHUNK = 40;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      try {
        const impact = await this.getDeleteImpact(chunk);
        for (const r of impact.purchaseRefs) {
          withPurchase.add(String(r.productId));
        }
      } catch {
        /* devam */
      }
    }
    return ids.filter((id) => !withPurchase.has(id));
  },

  /**
   * Get all products
   */
  async getAll(context?: { firmNr?: string | number }): Promise<Product[]> {
    try {
      const contextFirmRaw = String(context?.firmNr ?? ERP_SETTINGS.firmNr ?? '').trim();
      const firmEq = (contextFirmRaw || firmNrPadded()).padStart(3, '0').slice(0, 10);
      const tableName = `rex_${firmEq}_products`;
      const firmRaw = contextFirmRaw;
      const firmCandidates = Array.from(new Set([firmEq, firmRaw].filter(Boolean)));
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const query: Record<string, string | number> = {
          select: PRODUCT_LIST_SELECT,
          order: 'name.asc',
          limit: 15000,
        };
        if (firmCandidates.length === 1) {
          query.firm_nr = `eq.${firmCandidates[0]}`;
        } else if (firmCandidates.length > 1) {
          query.or = `(${firmCandidates.map((f) => `firm_nr.eq.${f}`).join(',')})`;
        }
        let rows: any[] = [];
        try {
          const listRows = await postgrest.get<any[]>(
            `/${tableName}`,
            query,
            { schema: 'public' }
          );
          rows = Array.isArray(listRows) ? listRows : [];
        } catch (error) {
          if (!isUndefinedColumnError(error)) throw error;
          console.warn('[ProductAPI] getAll fallback select due to missing column:', error);
          const fallbackRows = await postgrest.get<any[]>(
            `/${tableName}`,
            { ...query, select: PRODUCT_LIST_SELECT_FALLBACK },
            { schema: 'public' }
          );
          rows = Array.isArray(fallbackRows) ? fallbackRows : [];
        }
        return (Array.isArray(rows) ? rows : [])
          .filter((r: any) => !(r?.is_active === false || r?.is_active === 0 || String(r?.is_active).toLowerCase() === 'false'))
          .map(mapDatabaseProductToProduct);
      }
      let rows: any[] = [];
      try {
        const result = await postgres.query(
          `SELECT ${PRODUCT_LIST_SELECT_SQL}
           FROM ${tableName}
           WHERE COALESCE(is_active, true) = true
             AND (
               LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
               OR TRIM(COALESCE(firm_nr, '')) = $2
             )
           ORDER BY name ASC`,
          [firmEq, firmRaw || firmEq]
        );
        rows = result.rows;
      } catch (error) {
        if (!isUndefinedColumnError(error)) throw error;
        console.warn('[ProductAPI] getAll SQL fallback select due to missing column:', error);
        const fallbackResult = await postgres.query(
          `SELECT ${PRODUCT_LIST_SELECT_FALLBACK_SQL}
           FROM ${tableName}
           WHERE COALESCE(is_active, true) = true
             AND (
               LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
               OR TRIM(COALESCE(firm_nr, '')) = $2
             )
           ORDER BY name ASC`,
          [firmEq, firmRaw || firmEq]
        );
        rows = fallbackResult.rows;
      }
      return rows.map(mapDatabaseProductToProduct);
    } catch (error) {
      console.error('[ProductAPI] getAll failed:', error);
      return [];
    }
  },

  /**
   * Aktif ürünler — rapor ekranları için hafif kolon seti (`getAll` yerine tercih edin).
   */
  async getAllForReports(context?: { firmNr?: string | number }): Promise<Product[]> {
    try {
      const contextFirmRaw = String(context?.firmNr ?? ERP_SETTINGS.firmNr ?? '').trim();
      const firmEq = (contextFirmRaw || firmNrPadded()).padStart(3, '0').slice(0, 10);
      const tableName = `rex_${firmEq}_products`;
      const firmRaw = contextFirmRaw;
      const firmCandidates = Array.from(new Set([firmEq, firmRaw].filter(Boolean)));
      if (shouldUseTenantPostgrestApi()) {
        const { postgrest } = await import('./postgrestClient');
        const query: Record<string, string | number> = {
          select: PRODUCT_REPORT_LIST_SELECT,
          order: 'name.asc',
          limit: 15000,
        };
        if (firmCandidates.length === 1) {
          query.firm_nr = `eq.${firmCandidates[0]}`;
        } else if (firmCandidates.length > 1) {
          query.or = `(${firmCandidates.map((f) => `firm_nr.eq.${f}`).join(',')})`;
        }
        let rows: any[] = [];
        try {
          const reportRows = await postgrest.get<any[]>(
            `/${tableName}`,
            query,
            { schema: 'public' }
          );
          rows = Array.isArray(reportRows) ? reportRows : [];
        } catch (error) {
          if (!isUndefinedColumnError(error)) throw error;
          console.warn('[ProductAPI] getAllForReports fallback select due to missing column:', error);
          const fallbackRows = await postgrest.get<any[]>(
            `/${tableName}`,
            { ...query, select: PRODUCT_REPORT_LIST_SELECT_FALLBACK },
            { schema: 'public' }
          );
          rows = Array.isArray(fallbackRows) ? fallbackRows : [];
        }
        return (Array.isArray(rows) ? rows : [])
          .filter((r: any) => !(r?.is_active === false || r?.is_active === 0 || String(r?.is_active).toLowerCase() === 'false'))
          .map(mapDatabaseProductToProduct);
      }
      let rows: any[] = [];
      try {
        const result = await postgres.query(
          `SELECT ${PRODUCT_REPORT_LIST_SELECT_SQL}
           FROM ${tableName}
           WHERE COALESCE(is_active, true) = true
             AND (
               LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
               OR TRIM(COALESCE(firm_nr, '')) = $2
             )
           ORDER BY name ASC
           LIMIT 25000`,
          [firmEq, firmRaw || firmEq]
        );
        rows = result.rows;
      } catch (error) {
        if (!isUndefinedColumnError(error)) throw error;
        console.warn('[ProductAPI] getAllForReports SQL fallback select due to missing column:', error);
        const fallbackResult = await postgres.query(
          `SELECT ${PRODUCT_REPORT_LIST_SELECT_FALLBACK_SQL}
           FROM ${tableName}
           WHERE (
             LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
             OR TRIM(COALESCE(firm_nr, '')) = $2
           )
           ORDER BY name ASC
           LIMIT 25000`,
          [firmEq, firmRaw || firmEq]
        );
        rows = fallbackResult.rows;
      }
      return rows.map(mapDatabaseProductToProduct);
    } catch (error) {
      console.error('[ProductAPI] getAllForReports failed:', error);
      return [];
    }
  },

  /**
   * Get product by ID
   */
  async getById(id: string): Promise<Product | null> {
    try {
        const tableName = `rex_${firmNrPadded()}_products`;
        const activeFirm = firmNrPadded();
        if (shouldUsePostgrestForCrud()) {
          const { postgrest } = await import('./postgrestClient');
          for (const firmFilter of productFirmFilterCandidates()) {
            const rows = await postgrest.get<any[]>(
              `/${tableName}`,
              {
                select: '*',
                id: `eq.${id}`,
                firm_nr: `eq.${firmFilter}`,
                limit: 1,
              },
              { schema: 'public' },
            );
            const row = Array.isArray(rows) ? rows[0] : null;
            if (row) return mapDatabaseProductToProduct(row);
          }
          const rows = await postgrest.get<any[]>(
            `/${tableName}`,
            { select: '*', id: `eq.${id}`, limit: 1 },
            { schema: 'public' },
          );
          const row = Array.isArray(rows) ? rows[0] : null;
          if (row && firmNrEquivalent(row.firm_nr, activeFirm)) {
            return mapDatabaseProductToProduct(row);
          }
          return null;
      }
      const { eq: firmEq, raw: firmRaw } = firmNrMatchValues();
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE id = $1
           AND (
             LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2
             OR TRIM(COALESCE(firm_nr, '')) = $3
             OR TRIM(COALESCE(firm_nr, '')) = ''
           )`,
        [id, firmEq, firmRaw || firmEq],
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getById failed:', error);
      return null;
    }
  },

  /**
   * Get product by code (for upsert / Excel import)
   */
  async getByCode(code: string): Promise<Product | null> {
    if (!code?.trim()) return null;
    try {
        const tableName = `rex_${firmNrPadded()}_products`;
        if (shouldUsePostgrestForCrud()) {
          const { postgrest } = await import('./postgrestClient');
          for (const firmFilter of productFirmFilterCandidates()) {
            const rows = await postgrest.get<any[]>(
              `/${tableName}`,
              {
                select: '*',
                code: `eq.${code.trim()}`,
                firm_nr: `eq.${firmFilter}`,
                limit: 1,
              },
              { schema: 'public' },
            );
            const row = Array.isArray(rows) ? rows[0] : null;
            if (row) return mapDatabaseProductToProduct(row);
          }
          return null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE code = $1 AND is_active = true
           AND (LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2 OR TRIM(COALESCE(firm_nr, '')) = $3)
         LIMIT 1`,
        [code.trim(), firmNrMatchValues().eq, firmNrMatchValues().raw],
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getByCode failed:', error);
      return null;
    }
  },

  /** Tartılı barkod PLU — special_code_1 veya kod varyantları */
  async getBySpecialCode(code: string): Promise<Product | null> {
    const c = String(code ?? '').trim();
    if (!c) return null;
    try {
      const tableName = `rex_${firmNrPadded()}_products`;
      const { eq: firmEq, raw: firmRaw } = firmNrMatchValues();
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        for (const variant of [c, c.replace(/^0+/, '') || '0', c.padStart(4, '0'), c.padStart(5, '0')]) {
          const rows = await postgrest.get<any[]>(
            `/${tableName}`,
            {
              select: '*',
              special_code_1: `eq.${variant}`,
              firm_nr: `eq.${firmEq}`,
              is_active: 'eq.true',
              limit: '1',
            },
            { schema: 'public' },
          );
          const row = Array.isArray(rows) ? rows[0] : null;
          if (row) return mapDatabaseProductToProduct(row);
        }
        return null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName}
         WHERE firm_nr = $1 AND is_active = true
           AND special_code_1 IN ($2, $3, $4, $5)
         LIMIT 1`,
        [ERP_SETTINGS.firmNr, c, c.replace(/^0+/, '') || '0', c.padStart(4, '0'), c.padStart(5, '0')],
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getBySpecialCode failed:', error);
      return null;
    }
  },

  /** Tartı ürünü — PLU/kod/barkod eşleşmesi (is_scale_product öncelikli) */
  async getScaleProductByPlu(plu: string): Promise<Product | null> {
    const uniq = scalePluLookupVariants(plu);
    if (uniq.length === 0) return null;
    try {
      const tableName = `rex_${firmNrPadded()}_products`;
      const { eq: firmEq, raw: firmRaw } = firmNrMatchValues();
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        for (const code of uniq) {
          for (const field of ['plu_code', 'code', 'barcode', 'special_code_1'] as const) {
            let rows = await postgrest.get<any[]>(
              `/${tableName}`,
              {
                select: '*',
                [field]: `eq.${code}`,
                firm_nr: `eq.${firmEq}`,
                is_active: 'eq.true',
                is_scale_product: 'eq.true',
                limit: '1',
              },
              { schema: 'public' },
            ).catch(() => []);
            let row = Array.isArray(rows) ? rows[0] : null;
            if (!row) {
              rows = await postgrest.get<any[]>(
                `/${tableName}`,
                {
                  select: '*',
                  [field]: `eq.${code}`,
                  firm_nr: `eq.${firmEq}`,
                  is_active: 'eq.true',
                  limit: '1',
                },
                { schema: 'public' },
              ).catch(() => []);
              row = Array.isArray(rows) ? rows[0] : null;
            }
            if (row) return mapDatabaseProductToProduct(row);
          }
        }
        return null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName}
         WHERE is_active = true
           AND (LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1 OR TRIM(COALESCE(firm_nr, '')) = $2)
           AND (plu_code = ANY($3::text[]) OR code = ANY($3::text[]) OR barcode = ANY($3::text[]) OR special_code_1 = ANY($3::text[]))
         ORDER BY CASE WHEN is_scale_product = true THEN 0 ELSE 1 END
         LIMIT 1`,
        [firmEq, firmRaw, uniq],
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getScaleProductByPlu failed:', error);
      // plu_code kolonu yoksa (migration öncesi) eski sorguya düş
      try {
        const tableName = `rex_${firmNrPadded()}_products`;
        const { eq: firmEq, raw: firmRaw } = firmNrMatchValues();
        const { rows } = await postgres.query(
          `SELECT * FROM ${tableName}
           WHERE is_active = true
             AND (LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1 OR TRIM(COALESCE(firm_nr, '')) = $2)
             AND (code = ANY($3::text[]) OR barcode = ANY($3::text[]) OR special_code_1 = ANY($3::text[]))
           ORDER BY CASE WHEN is_scale_product = true THEN 0 ELSE 1 END
           LIMIT 1`,
          [firmEq, firmRaw, uniq],
        );
        return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
      } catch {
        return null;
      }
    }
  },

  /**
   * Get product by barcode
   */
  async getByBarcode(barcode: string): Promise<Product | null> {
    try {
        const tableName = `rex_${firmNrPadded()}_products`;
        const { eq: firmEq, raw: firmRaw } = firmNrMatchValues();
        if (shouldUsePostgrestForCrud()) {
          const { postgrest } = await import('./postgrestClient');
          const rows = await postgrest.get<any[]>(
            `/${tableName}`,
            {
              select: '*',
              barcode: `eq.${barcode}`,
              firm_nr: `eq.${firmEq}`,
              is_active: 'eq.true',
              limit: 1,
            },
          { schema: 'public' }
        );
        const row = Array.isArray(rows) ? rows[0] : null;
        return row ? mapDatabaseProductToProduct(row) : null;
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} WHERE barcode = $1 AND is_active = true
           AND (LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2 OR TRIM(COALESCE(firm_nr, '')) = $3)
         LIMIT 1`,
        [barcode.trim(), firmEq, firmRaw],
      );
      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] getByBarcode failed:', error);
      return null;
    }
  },

  /**
   * Ürün kodu / barkod tekilliği — kayıt öncesi doğrulama
   */
  async assertUniqueProductIdentity(params: {
    excludeId?: string;
    code?: string;
    barcodes?: string[];
  }): Promise<{ ok: true } | { ok: false; field: 'code' | 'barcode'; message: string }> {
    const excludeId = params.excludeId?.trim() || undefined;
    const code = String(params.code ?? '').trim();
    if (code) {
      const existing = await this.getByCode(code);
      if (existing?.id && existing.id !== excludeId) {
        return {
          ok: false,
          field: 'code',
          message: `Ürün kodu zaten kullanılıyor: ${code}`,
        };
      }
    }

    const seen = new Set<string>();
    for (const raw of params.barcodes ?? []) {
      const bc = String(raw ?? '').trim();
      if (!bc) continue;
      if (seen.has(bc)) {
        return {
          ok: false,
          field: 'barcode',
          message: `Aynı barkod listede tekrar ediyor: ${bc}`,
        };
      }
      seen.add(bc);
      const existing = await this.getByBarcode(bc);
      if (existing?.id && existing.id !== excludeId) {
        return {
          ok: false,
          field: 'barcode',
          message: `Barkod başka üründe kayıtlı: ${bc}`,
        };
      }
    }
    return { ok: true };
  },

  /**
   * Deep lookup by any barcode (primary or unit-specific)
   */
  async lookupByBarcode(barcode: string): Promise<{ product: Product, unitInfo?: any } | null> {
    try {
      const lookupKeys = expandBarcodeLookupKeys(barcode);
      if (lookupKeys.length === 0) return null;

      for (const key of lookupKeys) {
        const product = await this.getByBarcode(key);
        if (product) return { product };
      }

      for (const key of lookupKeys) {
        const unitMatch = await this.lookupUnitBarcode(key);
        if (unitMatch) return unitMatch;
      }

      return null;
    } catch (error) {
      console.error('[ProductAPI] lookupByBarcode failed:', error);
      return null;
    }
  },

  async lookupUnitBarcode(barcode: string): Promise<{ product: Product, unitInfo?: any } | null> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const pbPath = `/rex_${firmNrPadded()}_product_barcodes`;
        const pbRows = await postgrest.get<any[]>(
          pbPath,
          {
            select: '*',
            barcode_code: `eq.${barcode}`,
            order: 'is_primary.desc',
            limit: 1,
          },
          { schema: 'public' }
        );
        const pb = Array.isArray(pbRows) ? pbRows[0] : null;
        if (!pb) return null;
        const foundProduct = await this.getById(pb.product_id);
        if (!foundProduct) return null;
        const unitName = pb.unit;
        const unitsetId = (foundProduct as any).unitsetId || (foundProduct as any).unitset_id;
        let multiplier = 1;

        if (unitName && unitsetId) {
          try {
            const ulPath = `/rex_${firmNrPadded()}_unitsetl`;
            let unitRows = await postgrest.get<any[]>(
              ulPath,
              {
                select: 'conv_fact1,multiplier1',
                unitset_id: `eq.${unitsetId}`,
                name: `eq.${unitName}`,
                limit: 1,
              },
              { schema: 'public' }
            );
            let ur = Array.isArray(unitRows) ? unitRows[0] : null;
            if (!ur) {
              unitRows = await postgrest.get<any[]>(
                ulPath,
                {
                  select: 'conv_fact1,multiplier1',
                  unitset_id: `eq.${unitsetId}`,
                  code: `eq.${unitName}`,
                  limit: 1,
                },
                { schema: 'public' }
              );
              ur = Array.isArray(unitRows) ? unitRows[0] : null;
            }
            if (ur) {
              multiplier = parseFloat(String(ur.conv_fact1 || ur.multiplier1 || 1)) || 1;
            }
          } catch (_) { /* ignore */ }
        }

        if (multiplier === 1 && unitName) {
          try {
            const cPath = `/rex_${firmNrPadded()}_product_unit_conversions`;
            const convRows = await postgrest.get<any[]>(
              cPath,
              {
                select: 'factor',
                product_id: `eq.${foundProduct.id}`,
                from_unit: `eq.${unitName}`,
                limit: 1,
              },
              { schema: 'public' }
            );
            const cr = Array.isArray(convRows) ? convRows[0] : null;
            if (cr) multiplier = parseFloat(String(cr.factor)) || 1;
          } catch (_) { /* ignore */ }
        }

        return {
          product: foundProduct,
          unitInfo: { ...pb, multiplier },
        };
      }

      const { rows } = await postgres.query(
        `SELECT * FROM product_barcodes WHERE barcode_code = $1 ORDER BY is_primary DESC LIMIT 1`,
        [barcode]
      );

      if (rows[0]) {
        const foundProduct = await this.getById(rows[0].product_id);
        if (foundProduct) {
          const unitName = rows[0].unit;
          const unitsetId = (foundProduct as any).unitsetId || (foundProduct as any).unitset_id;
          let multiplier = 1;

          // Öncelik 1: unitset_id varsa unitsetl tablosundan çarpan bul
          if (unitName && unitsetId) {
            try {
              const { rows: unitRows } = await postgres.query(
                `SELECT conv_fact1, multiplier1 FROM unitsetl WHERE unitset_id = $1 AND (name = $2 OR code = $2) LIMIT 1`,
                [unitsetId, unitName]
              );
              if (unitRows[0]) {
                multiplier = parseFloat(unitRows[0].conv_fact1 || unitRows[0].multiplier1) || 1;
              }
            } catch (_) { /* ignore */ }
          }

          // Öncelik 2: unitset_id yoksa product_unit_conversions tablosundan çarpan bul
          // (Kullanıcı ürünü manuel birim çevrimi ile kurmuş, unitset atamamış)
          if (multiplier === 1 && unitName) {
            try {
              const { rows: convRows } = await postgres.query(
                `SELECT factor FROM product_unit_conversions WHERE product_id = $1 AND from_unit = $2 LIMIT 1`,
                [foundProduct.id, unitName]
              );
              if (convRows[0]) {
                multiplier = parseFloat(convRows[0].factor) || 1;
              }
            } catch (_) { /* ignore */ }
          }

          return {
            product: foundProduct,
            unitInfo: { ...rows[0], multiplier }
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[ProductAPI] lookupUnitBarcode failed:', error);
      return null;
    }
  },

  /**
   * Internal: Generate next barcode from template
   */
  async generateNextBarcode(): Promise<string> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          '/barcode_templates',
          {
            select: '*',
            is_active: 'eq.true',
            order: 'created_at.asc',
            limit: 1,
          },
          { schema: 'public' }
        );
        if (!rows?.[0]) return '';
        const template = rows[0];
        const nextValue = BigInt(template.current_value) + 1n;
        const barcodeValue = `${template.prefix}${nextValue.toString().padStart(template.length - template.prefix.length, '0')}`;
        await postgrest.patch(
          `/barcode_templates?id=eq.${encodeURIComponent(template.id)}`,
          { current_value: nextValue.toString(), updated_at: new Date().toISOString() },
          { schema: 'public', prefer: 'return=minimal' }
        );
        return barcodeValue;
      }
      const { rows } = await postgres.query(
        'SELECT * FROM public.barcode_templates WHERE is_active = true ORDER BY created_at ASC LIMIT 1'
      );

      if (!rows[0]) return '';

      const template = rows[0];
      const nextValue = BigInt(template.current_value) + 1n;
      const barcodeValue = `${template.prefix}${nextValue.toString().padStart(template.length - template.prefix.length, '0')}`;

      await postgres.query(
        'UPDATE public.barcode_templates SET current_value = $1, updated_at = NOW() WHERE id = $2',
        [nextValue.toString(), template.id]
      );

      return barcodeValue;
    } catch (error) {
      console.error('[ProductAPI] generateNextBarcode failed:', error);
      return '';
    }
  },

  /**
   * Aktif barkod şablonunu döner (varsa). UI ayar ekranı için kullanılır.
   */
  async getActiveBarcodeTemplate(): Promise<{
    id: string;
    name: string;
    prefix: string;
    current_value: string;
    length: number;
    is_active: boolean;
  } | null> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          '/barcode_templates',
          { select: '*', is_active: 'eq.true', order: 'created_at.asc', limit: 1 },
          { schema: 'public' }
        );
        return rows?.[0] || null;
      }
      const { rows } = await postgres.query(
        'SELECT * FROM public.barcode_templates WHERE is_active = true ORDER BY created_at ASC LIMIT 1'
      );
      return rows[0] || null;
    } catch (error) {
      console.error('[ProductAPI] getActiveBarcodeTemplate failed:', error);
      return null;
    }
  },

  /**
   * Barkod şablonunu kaydet/güncelle. id verilmişse update; yoksa yeni kayıt eklenir.
   * Yeni kayıt aktifleştirilirse diğer şablonlar pasif edilir.
   *
   * NOT: `current_value` "bir sonraki üretilecek barkodun değeri - 1" olarak saklanır.
   * UI'da kullanıcıya gösterilen / aldığımız "başlangıç numarası" sıradaki üretilecek
   * barkodu temsil etmeli. Bu yüzden kaydederken `start - 1` olarak çeviriyoruz.
   */
  async upsertBarcodeTemplate(input: {
    id?: string;
    name: string;
    prefix: string;
    /** Sıradaki üretilecek barkod numarası (kullanıcı için anlamlı). */
    start: bigint | string;
    length: number;
    is_active?: boolean;
  }): Promise<boolean> {
    try {
      const startBig = typeof input.start === 'bigint' ? input.start : BigInt(String(input.start || '0'));
      const currentValue = (startBig > 0n ? startBig - 1n : 0n).toString();
      const isActive = input.is_active !== false;

      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        if (isActive) {
          // Diğer aktif şablonları pasif et
          await postgrest.patch(
            `/barcode_templates?is_active=eq.true${input.id ? `&id=neq.${encodeURIComponent(input.id)}` : ''}`,
            { is_active: false, updated_at: new Date().toISOString() },
            { schema: 'public', prefer: 'return=minimal' }
          );
        }
        if (input.id) {
          await postgrest.patch(
            `/barcode_templates?id=eq.${encodeURIComponent(input.id)}`,
            {
              name: input.name,
              prefix: input.prefix,
              current_value: currentValue,
              length: input.length,
              is_active: isActive,
              updated_at: new Date().toISOString(),
            },
            { schema: 'public', prefer: 'return=minimal' }
          );
        } else {
          await postgrest.post(
            '/barcode_templates',
            {
              name: input.name,
              prefix: input.prefix,
              current_value: currentValue,
              length: input.length,
              is_active: isActive,
            },
            { schema: 'public', prefer: 'return=minimal' }
          );
        }
        return true;
      }

      if (isActive) {
        await postgres.query(
          `UPDATE public.barcode_templates SET is_active = false, updated_at = NOW()
            WHERE is_active = true ${input.id ? 'AND id <> $1' : ''}`,
          input.id ? [input.id] : []
        );
      }
      if (input.id) {
        await postgres.query(
          `UPDATE public.barcode_templates
            SET name = $1, prefix = $2, current_value = $3, length = $4, is_active = $5, updated_at = NOW()
            WHERE id = $6`,
          [input.name, input.prefix, currentValue, input.length, isActive, input.id]
        );
      } else {
        await postgres.query(
          `INSERT INTO public.barcode_templates (name, prefix, current_value, length, is_active)
            VALUES ($1, $2, $3, $4, $5)`,
          [input.name, input.prefix, currentValue, input.length, isActive]
        );
      }
      return true;
    } catch (error) {
      console.error('[ProductAPI] upsertBarcodeTemplate failed:', error);
      return false;
    }
  },

  /**
   * Sıradaki barkodu önizler — şablon `current_value`'yu güncellemez.
   * UI yeni ürün formu açılırken kullanıcıya göstermek için kullanılır.
   * Kayıt anında `generateNextBarcode()` çağrılınca gerçek sayaç ilerletilir.
   */
  async peekNextBarcode(): Promise<string> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          '/barcode_templates',
          {
            select: '*',
            is_active: 'eq.true',
            order: 'created_at.asc',
            limit: 1,
          },
          { schema: 'public' }
        );
        if (!rows?.[0]) return '';
        const template = rows[0];
        const nextValue = BigInt(template.current_value) + 1n;
        return `${template.prefix}${nextValue.toString().padStart(template.length - template.prefix.length, '0')}`;
      }
      const { rows } = await postgres.query(
        'SELECT * FROM public.barcode_templates WHERE is_active = true ORDER BY created_at ASC LIMIT 1'
      );
      if (!rows[0]) return '';
      const template = rows[0];
      const nextValue = BigInt(template.current_value) + 1n;
      return `${template.prefix}${nextValue.toString().padStart(template.length - template.prefix.length, '0')}`;
    } catch (error) {
      console.error('[ProductAPI] peekNextBarcode failed:', error);
      return '';
    }
  },

  /**
   * Create new product
   */
  async create(product: Omit<Product, 'id'>): Promise<Product | null> {
    try {
      const uniqueCheck = await productAPI.assertUniqueProductIdentity({
        code: product.code,
        barcodes: product.barcode ? [product.barcode] : [],
      });
      if (!uniqueCheck.ok) {
        throw new Error(uniqueCheck.message);
      }

      const tableName = `rex_${firmNrPadded()}_products`;
      const p = product as any;
      const trunc = (s: unknown, max: number) => String(s ?? '').slice(0, max);

      const productData = {
        name: trunc(p.name ?? product.name, 255) || 'Ürün',
        code: trunc(product.code || '', 100),
        barcode: trunc(product.barcode || (await this.generateNextBarcode()), 100),
        // V2: 'category' kolonu kaldırıldı → category_code kullan
        category_code: trunc(
          p.categoryCode || p.category_code || product.category || '',
          50,
        ),
        price: product.price || 0,
        cost: product.cost || 0,
        stock: product.stock || 0,
        min_stock: product.minStock ?? product.min_stock ?? 0,
        max_stock: (product as any).maxStock ?? product.max_stock ?? 0,
        critical_stock: product.criticalStock || 0,
        unit: product.unit || 'Adet',
        unitset_id: (product as any).unitsetId || (product as any).unitset_id || null,
        is_active: true,
        firm_nr: firmNrPadded(),
        image_url: product.image_url || '',
        image_url_cdn: (product as any).image_url_cdn || '',
        description: product.description || '',
        description_tr: product.description_tr || '',
        description_en: product.description_en || '',
        description_ar: product.description_ar || '',
        description_ku: product.description_ku || '',
        group_code: trunc(p.groupCode || p.group_code || '', 50),
        sub_group_code: trunc(p.subGroupCode || p.sub_group_code || '', 50),
        brand: trunc(product.brand || '', 100),
        model: product.model || '',
        manufacturer: product.manufacturer || '',
        supplier: product.supplier || '',
        origin: product.origin || '',
        material_type: (product as any).materialType || (product as any).material_type || 'commercial_goods',
        vat_rate: product.taxRate || 0,
        special_code_1: trunc(product.specialCode1 || p.special_code_1 || '', 50),
        special_code_2: trunc(product.specialCode2 || p.special_code_2 || '', 50),
        special_code_3: trunc((product as any).specialCode3 || p.special_code_3 || '', 50),
        special_code_4: trunc((product as any).specialCode4 || p.special_code_4 || '', 50),
        special_code_5: trunc((product as any).specialCode5 || p.special_code_5 || '', 50),
        special_code_6: trunc((product as any).specialCode6 || p.special_code_6 || '', 50),
        unit2: (product as any).unit2 || '',
        unit3: (product as any).unit3 || '',
        has_variants: (product as any).hasVariants || (product as any).has_variants || false,
        // Yeni ürün INSERT'inde eksikti; USD/EUR ve kur alanları kayda hiç yazılmıyordu
        currency: (product as any).currency || 'IQD',
        purchase_price_usd: parseFloat(String((product as any).purchasePriceUSD ?? (product as any).purchase_price_usd ?? 0)) || 0,
        sale_price_usd: parseFloat(String((product as any).salePriceUSD ?? (product as any).sale_price_usd ?? 0)) || 0,
        purchase_price_eur: parseFloat(String((product as any).purchasePriceEUR ?? (product as any).purchase_price_eur ?? 0)) || 0,
        sale_price_eur: parseFloat(String((product as any).salePriceEUR ?? (product as any).sale_price_eur ?? 0)) || 0,
        custom_exchange_rate: parseFloat(String((product as any).customExchangeRate ?? (product as any).custom_exchange_rate ?? 0)) || 0,
        auto_calculate_usd: Boolean((product as any).autoCalculateUSD ?? (product as any).auto_calculate_usd ?? false),
        follow_up_reminder_days: normalizeProductFollowUpReminderDays(
          (product as any).followUpReminderDays ?? (product as any).follow_up_reminder_days,
        ),
        is_scale_product: Boolean((product as any).isScaleProduct ?? (product as any).is_scale_product ?? false),
        plu_code: (() => {
          const raw = (product as any).pluCode ?? (product as any).plu_code;
          if (raw == null || raw === '') return null;
          const s = String(raw).trim().slice(0, 20);
          return s || null;
        })(),
        expiry_tracking: Boolean((product as any).expiryTracking ?? (product as any).expiry_tracking ?? false),
        expiry_date: (product as any).expiryDate ?? (product as any).expiry_date ?? null,
        shelf_life_days: normalizeProductShelfLifeDays(
          (product as any).shelfLifeDays ?? (product as any).shelf_life_days,
        ),
      };

      // PostgREST: yalnızca GET değil; INSERT de aynı uç üzerinden (pg_bridge / SQL yok)
      if (shouldUsePostgrestForCrud()) {
        if (!productData.barcode || String(productData.barcode).trim() === '') {
          productData.barcode = `B${Date.now()}`.slice(0, 100);
        }
        const created = await postgrestCreateProductRow(tableName, productData as Record<string, unknown>);
        const first = Array.isArray(created) ? (created as any[])[0] : (created as any);
        return first ? mapDatabaseProductToProduct(first) : null;
      }

      const rows = await insertProductRowSql(tableName, productData as Record<string, unknown>);

      return rows ? mapDatabaseProductToProduct(rows) : null;
    } catch (error: any) {
      console.error('[ProductAPI] create failed:', error);
      const errCode = error?.code;
      const detail = String(error?.detail ?? error?.message ?? '');
      if (errCode === '23505' || /23505|unique|tekil|duplicate/i.test(detail || '')) {
        if (/barcode|barkod/i.test(detail)) {
          throw new Error(
            'Bu barkod başka bir üründe kayıtlı. Excel’de barkodu değiştirin veya çakışan ürünü kaldırın.',
          );
        }
        const match = detail.match(/\(code\)=\(([^)]+)\)/) || detail.match(/key is "([^"]+)"/);
        const codeValue = match ? match[1] : 'bu kod';
        throw new Error(`Bu ürün kodu zaten mevcut: ${codeValue}. Excel aktarımında aynı kod varsa kayıt güncellenir.`);
      }
      throw new Error(error?.message || 'Ürün kaydedilemedi.');
    }
  },

  /**
   * Add a new product
   */
  async addProduct(product: Product): Promise<Product | null> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const copy = { ...product } as Product & { id?: string };
        if (!copy.id || copy.id === '') delete (copy as any).id;
        return this.create(copy as Omit<Product, 'id'>);
      }
      const tableName = `rex_${firmNrPadded()}_products`;
      const productData = { ...product, firm_nr: firmNrPadded() };

      // Ensure id is not an empty string (let database generate it if new)
      if (!productData.id || productData.id === '') {
        delete (productData as any).id;
      }

      // Mapping for camelCase to snake_case (Shared with update)
      const fieldMapping: Record<string, string> = {
        minStock: 'min_stock',
        maxStock: 'max_stock',
        criticalStock: 'critical_stock',
        category: 'category_code',
        categoryCode: 'category_code',
        groupCode: 'group_code',
        groupcode: 'group_code',
        subGroupCode: 'sub_group_code',
        specialCode1: 'special_code_1',
        specialCode2: 'special_code_2',
        specialCode3: 'special_code_3',
        specialCode4: 'special_code_4',
        specialCode5: 'special_code_5',
        specialCode6: 'special_code_6',
        priceList1: 'price_list_1',
        priceList2: 'price_list_2',
        priceList3: 'price_list_3',
        priceList4: 'price_list_4',
        priceList5: 'price_list_5',
        priceList6: 'price_list_6',
        taxRate: 'vat_rate',
        vatRate: 'vat_rate',
        materialType: 'material_type',
        isActive: 'is_active',
        hasVariants: 'has_variants',
        customExchangeRate: 'custom_exchange_rate',
        autoCalculateUSD: 'auto_calculate_usd',
        salePriceUSD: 'sale_price_usd',
        purchasePriceUSD: 'purchase_price_usd',
        salePriceEUR: 'sale_price_eur',
        purchasePriceEUR: 'purchase_price_eur',
        unitsetId: 'unitset_id',
        image_url_cdn: 'image_url_cdn',
        followUpReminderDays: 'follow_up_reminder_days',
        isScaleProduct: 'is_scale_product',
        pluCode: 'plu_code',
      };

      const finalData: Record<string, any> = {};
      
      // Auto-barcode if empty
      if (!productData.barcode || productData.barcode === '') {
        productData.barcode = await this.generateNextBarcode();
      }

      Object.entries(productData).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbKey = fieldMapping[key] || key;
          if (dbKey === 'is_scale_product') {
            finalData[dbKey] = Boolean(value);
            return;
          }
          finalData[dbKey] = value;
        }
      });

      const columns = Object.keys(finalData);
      const values = Object.values(finalData);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

      const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`;
      const { rows } = await postgres.query(query, values);

      const newId = rows[0]?.id;
      return newId ? { ...product, id: newId } as Product : null;
    } catch (error) {
      console.error('[ProductAPI] addProduct failed:', error);
      throw error;
    }
  },

  /**
   * Update product
   */
  async update(id: string, updates: Partial<Product>): Promise<Product | null> {
    try {
      const tableName = `rex_${firmNrPadded()}_products`;
      await assertProductInActiveFirm(tableName, id);
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;

      const fieldValues = new Map<string, any>();

      if (updates.code || updates.barcode) {
        const unique = await productAPI.assertUniqueProductIdentity({
          excludeId: id,
          code: updates.code,
          barcodes: updates.barcode ? [updates.barcode] : undefined,
        });
        if (!unique.ok) {
          throw new Error(unique.message);
        }
      }

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined) return;
        const dbKey = resolveProductDbColumn(key);
        if (!dbKey) return;
        if (dbKey === 'is_scale_product' || dbKey === 'expiry_tracking') {
          fieldValues.set(dbKey, Boolean(value));
          return;
        }
        if (dbKey === 'plu_code') {
          const s = value == null || value === '' ? null : String(value).trim().slice(0, 20);
          fieldValues.set(dbKey, s || null);
          return;
        }
        if (dbKey === 'follow_up_reminder_days') {
          fieldValues.set(dbKey, normalizeProductFollowUpReminderDays(value));
          return;
        }
        if (dbKey === 'shelf_life_days') {
          fieldValues.set(dbKey, normalizeProductShelfLifeDays(value));
          return;
        }
        if (dbKey === 'expiry_date') {
          fieldValues.set(dbKey, value == null || String(value).trim() === '' ? null : String(value).slice(0, 10));
          return;
        }
        fieldValues.set(dbKey, value);
      });

      if (fieldValues.size === 0) return productAPI.getById(id);

      // Kur geçmişi
      if (fieldValues.has('custom_exchange_rate')) {
        try {
          const oldProduct = await productAPI.getById(id);
          const oldRate = oldProduct?.customExchangeRate || 0;
          const newRate = fieldValues.get('custom_exchange_rate');

          if (oldRate !== newRate) {
            const currentUser = useAuthStore.getState().user;
            const who = currentUser?.fullName || 'Sistem';
            if (shouldUsePostgrestForCrud()) {
              const { postgrest } = await import('./postgrestClient');
              await postgrest.post(
                '/product_exchange_rate_history',
                {
                  product_id: id,
                  old_rate: oldRate,
                  new_rate: newRate,
                  changed_by: who,
                },
                { schema: 'public', prefer: 'return=minimal' }
              );
            } else {
              await postgres.query(
                `INSERT INTO product_exchange_rate_history (product_id, old_rate, new_rate, changed_by) 
                 VALUES ($1, $2, $3, $4)`,
                [id, oldRate, newRate, who]
              );
            }
          }
        } catch (logErr) {
          console.error('[ProductAPI] Logging rate change failed:', logErr);
        }
      }

      if (shouldUsePostgrestForCrud()) {
        const patchBody: Record<string, unknown> = Object.fromEntries(fieldValues);
        const patched = await postgrestPatchProductRow(tableName, id, patchBody);
        const row = Array.isArray(patched) ? patched[0] : patched;
        if (row) return mapDatabaseProductToProduct(row);
        console.warn('[ProductAPI] update: PostgREST patch eşleşmedi', { id, firmNr: ERP_SETTINGS.firmNr });
        return productAPI.getById(id);
      }

      fieldValues.forEach((value, dbKey) => {
        fields.push(`${dbKey} = $${i++}`);
        values.push(value);
      });

      const firmEq = firmNrPadded();
      const firmRaw = String(ERP_SETTINGS.firmNr ?? '').trim();
      values.push(id);
      values.push(firmEq);
      values.push(firmRaw || firmEq);
      let query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} AND (
        LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $${i + 1}
        OR TRIM(COALESCE(firm_nr, '')) = $${i + 2}
      ) RETURNING *`;
      let { rows } = await postgres.query(query, values);

      if (!rows[0]) {
        const valuesIdOnly = [...values.slice(0, -3), id];
        query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`;
        ({ rows } = await postgres.query(query, valuesIdOnly));
      }

      return rows[0] ? mapDatabaseProductToProduct(rows[0]) : null;
    } catch (error) {
      console.error('[ProductAPI] update failed:', error);
      throw error;
    }
  },

  /**
   * Delete product
   */
  async delete(
    id: string,
    options?: { force?: boolean; adminPassword?: string }
  ): Promise<boolean> {
    try {
      const impact = await this.getDeleteImpact([id]);
      if (impact.hasInvoiceRefs && !options?.force) {
        throw new Error('Bu ürünün satış/alış faturalarında hareketi var. Devam için yönetici şifresi ile onaylayın.');
      }
      if (impact.hasInvoiceRefs && options?.force) {
        const ok = await this.verifyManagementPassword(options?.adminPassword || '');
        if (!ok) {
          throw new Error('Yönetici şifresi hatalı.');
        }
      }
      const tableName = `rex_${firmNrPadded()}_products`;
      await assertProductInActiveFirm(tableName, id);
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        for (const firmFilter of productFirmFilterCandidates()) {
          const patched = await postgrest.patch<any[]>(
            `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firmFilter)}`,
            { is_active: false },
            { schema: 'public', prefer: 'return=representation' },
          );
          if (Array.isArray(patched) ? patched.length > 0 : Boolean(patched)) {
            return true;
          }
        }
        const patched = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}`,
          { is_active: false },
          { schema: 'public', prefer: 'return=representation' },
        );
        return Array.isArray(patched) ? patched.length > 0 : Boolean(patched);
      }
      const firmEq = firmNrPadded();
      const firmRaw = String(ERP_SETTINGS.firmNr ?? '').trim();
      let { rowCount } = await postgres.query(
        `UPDATE ${tableName} SET is_active = false WHERE id = $1
           AND (
             LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2
             OR TRIM(COALESCE(firm_nr, '')) = $3
           )`,
        [id, firmEq, firmRaw || firmEq],
      );
      if (!rowCount) {
        ({ rowCount } = await postgres.query(
          `UPDATE ${tableName} SET is_active = false WHERE id = $1`,
          [id],
        ));
      }
      return rowCount > 0;
    } catch (error) {
      console.error('[ProductAPI] delete failed:', error);
      return false;
    }
  },

  /**
   * Search products
   */
  async search(query: string): Promise<Product[]> {
    try {
      const tableName = `rex_${firmNrPadded()}_products`;
      if (shouldUsePostgrestForCrud()) {
        const token = sanitizePostgrestIlike(query);
        if (!token) return [];
        const { postgrest } = await import('./postgrestClient');
        const wild = `*${token}*`;
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: '*',
            firm_nr: `eq.${ERP_SETTINGS.firmNr}`,
            is_active: 'eq.true',
            or: `(name.ilike.${wild},code.ilike.${wild},barcode.ilike.${wild})`,
            order: 'name.asc',
            limit: 50,
          },
          { schema: 'public' }
        );
        return (Array.isArray(rows) ? rows : []).map(mapDatabaseProductToProduct);
      }
      const { rows } = await postgres.query(
        `SELECT * FROM ${tableName} 
         WHERE (name ILIKE $1 OR barcode ILIKE $1 OR code ILIKE $1) AND firm_nr = $2 AND is_active = true 
         ORDER BY name ASC LIMIT 50`,
        [`%${query}%`, ERP_SETTINGS.firmNr]
      );
      return rows.map(mapDatabaseProductToProduct);
    } catch (error) {
      console.error('[ProductAPI] search failed:', error);
      return [];
    }
  },

  /**
   * Update product stock
   */
  async updateStock(id: string, quantity: number): Promise<boolean> {
    try {
      const tableName = `rex_${firmNrPadded()}_products`;
      const firmEq = firmNrPadded();
      const firmRaw = String(ERP_SETTINGS.firmNr ?? '').trim();
      const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const firmFilters = [...new Set([firmEq, firmRaw].filter(Boolean))];
        for (const firmFilter of firmFilters) {
          const patched = await postgrest.patch<any[]>(
            `/${tableName}?id=eq.${encodeURIComponent(id)}&firm_nr=eq.${encodeURIComponent(firmFilter)}`,
            { stock: normalizedQuantity },
            { schema: 'public', prefer: 'return=representation' }
          );
          if (Array.isArray(patched) ? patched.length > 0 : Boolean(patched)) {
            return true;
          }
        }
        // Bazı ortamlarda firm_nr formatı (1/001) tutmadığında id üzerinden son deneme.
        const patchedByIdOnly = await postgrest.patch<any[]>(
          `/${tableName}?id=eq.${encodeURIComponent(id)}`,
          { stock: normalizedQuantity },
          { schema: 'public', prefer: 'return=representation' }
        );
        return Array.isArray(patchedByIdOnly) ? patchedByIdOnly.length > 0 : Boolean(patchedByIdOnly);
      }
      const { rowCount } = await postgres.query(
        `UPDATE ${tableName}
         SET stock = $1::text::numeric
         WHERE id = $2
           AND (
             LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $3
             OR TRIM(COALESCE(firm_nr, '')) = $4
           )`,
        [normalizedQuantity.toString(), id, firmEq, firmRaw || firmEq]
      );
      if (rowCount > 0) return true;

      // Eski/bozuk firm_nr verilerinde id üzerinden son fallback.
      const byIdOnly = await postgres.query(
        `UPDATE ${tableName} SET stock = $1::text::numeric WHERE id = $2`,
        [normalizedQuantity.toString(), id]
      );
      return (byIdOnly.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('[ProductAPI] updateStock failed:', error);
      return false;
    }
  },

  async filterExistingProductIds(ids: string[]): Promise<Set<string>> {
    const normalized = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
    if (!normalized.length) return new Set<string>();
    const tableName = `rex_${firmNrPadded()}_products`;
    const firmEq = firmNrPadded();
    const firmRaw = String(ERP_SETTINGS.firmNr ?? '').trim();
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const inList = normalized.join(',');
        const rows = await postgrest.get<any[]>(
          `/${tableName}`,
          {
            select: 'id,firm_nr',
            id: `in.(${inList})`,
            limit: normalized.length + 5,
          },
          { schema: 'public' }
        );
        const set = new Set<string>();
        for (const row of Array.isArray(rows) ? rows : []) {
          const rowId = String(row?.id || '').trim();
          const rowFirm = String(row?.firm_nr || '').trim();
          if (!rowId) continue;
          if (rowFirm === firmRaw || rowFirm === firmEq || rowFirm.padStart(3, '0') === firmEq) {
            set.add(rowId);
          }
        }
        return set;
      }

      const { rows } = await postgres.query<{ id: string }>(
        `SELECT id::text AS id
         FROM ${tableName}
         WHERE id = ANY($1::uuid[])
           AND (
             LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2
             OR TRIM(COALESCE(firm_nr, '')) = $3
           )`,
        [normalized, firmEq, firmRaw || firmEq]
      );
      return new Set(rows.map((r) => String(r.id)));
    } catch (error) {
      console.warn('[ProductAPI] filterExistingProductIds failed:', error);
      return new Set<string>();
    }
  },

  /**
   * Bulk update products
   */
  async bulkUpdate(ids: string[], updates: Partial<Product>): Promise<number> {
    try {
      const tableName = `rex_${firmNrPadded()}_products`;
      const patchBody: Record<string, unknown> = {};

      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'id' || value === undefined) return;
        const dbKey = PRODUCT_DB_FIELD_MAPPING[key] || key;
        if (dbKey === 'is_scale_product' || dbKey === 'expiry_tracking' || dbKey === 'is_active' || dbKey === 'has_variants' || dbKey === 'auto_calculate_usd') {
          patchBody[dbKey] = Boolean(value);
          return;
        }
        if (dbKey === 'plu_code') {
          const s = value == null || value === '' ? null : String(value).trim().slice(0, 20);
          patchBody[dbKey] = s || null;
          return;
        }
        if (dbKey === 'follow_up_reminder_days') {
          patchBody[dbKey] = normalizeProductFollowUpReminderDays(value);
          return;
        }
        if (dbKey === 'shelf_life_days') {
          patchBody[dbKey] = normalizeProductShelfLifeDays(value);
          return;
        }
        if (dbKey === 'expiry_date') {
          patchBody[dbKey] = value == null || String(value).trim() === '' ? null : String(value).slice(0, 10);
          return;
        }
        if (dbKey === 'category_code') {
          patchBody[dbKey] = String(value ?? '').slice(0, 50);
          return;
        }
        patchBody[dbKey] = value;
      });

      if (Object.keys(patchBody).length === 0) return 0;
      if (!ids.length) return 0;

      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const inList = ids.map((x) => String(x).trim()).filter(Boolean).join(',');
        if (!inList) return 0;
        const patched = await postgrestPatchProductRowsBulk(tableName, inList, patchBody);
        return Array.isArray(patched) ? patched.length : patched ? 1 : 0;
      }

      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      Object.entries(patchBody).forEach(([dbKey, value]) => {
        fields.push(`${dbKey} = $${i++}`);
        values.push(value);
      });

      const firmEq = firmNrPadded();
      const firmRaw = String(ERP_SETTINGS.firmNr ?? '').trim();
      values.push(ids);
      values.push(firmEq);
      values.push(firmRaw || firmEq);
      const query = `UPDATE ${tableName} SET ${fields.join(', ')} WHERE id = ANY($${i})
        AND (
          LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $${i + 1}
          OR TRIM(COALESCE(firm_nr, '')) = $${i + 2}
        )`;
      const { rowCount } = await postgres.query(query, values);

      return rowCount || 0;
    } catch (error) {
      console.error('[ProductAPI] bulkUpdate failed:', error);
      throw error;
    }
  },
  /**
   * Get product exchange rate history
   */
  async getExchangeRateHistory(productId: string): Promise<any[]> {
    try {
      if (shouldUsePostgrestForCrud()) {
        const { postgrest } = await import('./postgrestClient');
        const rows = await postgrest.get<any[]>(
          '/product_exchange_rate_history',
          {
            select: '*',
            product_id: `eq.${productId}`,
            order: 'changed_at.desc',
          },
          { schema: 'public' }
        );
        return Array.isArray(rows) ? rows : [];
      }
      const { rows } = await postgres.query(
        `SELECT * FROM product_exchange_rate_history 
         WHERE product_id = $1 
         ORDER BY changed_at DESC NULLS LAST`,
        [productId]
      );
      return rows;
    } catch (error) {
      console.error('[ProductAPI] getExchangeRateHistory failed:', error);
      return [];
    }
  },
};

/**
 * Helper: Map database product
 */
function mapDatabaseProductToProduct(dbProduct: any): Product {
  const name =
    [dbProduct.name, dbProduct.name2, dbProduct.code, dbProduct.barcode]
      .map((x) => (x == null ? '' : String(x).trim()))
      .find((s) => s.length > 0) || 'İsimsiz ürün';
  return {
    id: dbProduct.id,
    name,
    name2: dbProduct.name2,
    code: dbProduct.code,
    barcode: dbProduct.barcode,
    category: dbProduct.category || dbProduct.category_code || '',
    price: parseFloat(dbProduct.price || 0),
    /** Kart maliyeti: `cost` boş/0 iken çoğu kurulumda alış `purchase_price` kolonundadır */
    cost: (() => {
      const c = parseFloat(String(dbProduct.cost ?? 0)) || 0;
      if (c !== 0) return c;
      return parseFloat(String(dbProduct.purchase_price ?? 0)) || 0;
    })(),
    stock: parseFloat(dbProduct.stock || 0),
    minStock: parseFloat(dbProduct.min_stock || 0),
    min_stock: parseFloat(dbProduct.min_stock || 0),
    maxStock: parseFloat(dbProduct.max_stock || 0),
    max_stock: parseFloat(dbProduct.max_stock || 0),
    criticalStock: parseFloat(dbProduct.critical_stock ?? dbProduct.criticalStock ?? 0),
    unit: dbProduct.unit,
    isActive: dbProduct.is_active,
    hasVariants: dbProduct.has_variants,
    description: dbProduct.description,
    description_tr: dbProduct.description_tr,
    description_en: dbProduct.description_en,
    description_ar: dbProduct.description_ar,
    description_ku: dbProduct.description_ku,
    image_url: dbProduct.image_url,
    image_url_cdn: dbProduct.image_url_cdn,
    taxRate: parseFloat(dbProduct.vat_rate || 0),
    categoryCode: dbProduct.category_code,
    groupCode: dbProduct.group_code,
    subGroupCode: dbProduct.sub_group_code,
    brand: dbProduct.brand,
    model: dbProduct.model,
    manufacturer: dbProduct.manufacturer,
    supplier: dbProduct.supplier,
    origin: dbProduct.origin,
    materialType: dbProduct.material_type as any,
    specialCode1: dbProduct.special_code_1,
    specialCode2: dbProduct.special_code_2,
    specialCode3: dbProduct.special_code_3,
    specialCode4: dbProduct.special_code_4,
    specialCode5: dbProduct.special_code_5,
    specialCode6: dbProduct.special_code_6,
    priceList1: parseFloat(dbProduct.price_list_1 || 0),
    priceList2: parseFloat(dbProduct.price_list_2 || 0),
    priceList3: parseFloat(dbProduct.price_list_3 || 0),
    priceList4: parseFloat(dbProduct.price_list_4 || 0),
    priceList5: parseFloat(dbProduct.price_list_5 || 0),
    priceList6: parseFloat(dbProduct.price_list_6 || 0),
    currency: dbProduct.currency || 'IQD',
    salePriceUSD: parseFloat(dbProduct.sale_price_usd || 0),
    purchasePriceUSD: parseFloat(dbProduct.purchase_price_usd || 0),
    salePriceEUR: parseFloat(dbProduct.sale_price_eur || 0),
    purchasePriceEUR: parseFloat(dbProduct.purchase_price_eur || 0),
    customExchangeRate: parseFloat(dbProduct.custom_exchange_rate || 0),
    autoCalculateUSD: dbProduct.auto_calculate_usd === true,
    unitsetId: dbProduct.unitset_id || dbProduct.unit_set_id,
    followUpReminderDays: normalizeProductFollowUpReminderDaysForProduct(dbProduct.follow_up_reminder_days),
    isScaleProduct: dbProduct.is_scale_product === true,
    pluCode: dbProduct.plu_code != null && String(dbProduct.plu_code).trim() !== ''
      ? String(dbProduct.plu_code).trim()
      : undefined,
    expiryTracking: dbProduct.expiry_tracking === true,
    expiryDate: dbProduct.expiry_date != null ? String(dbProduct.expiry_date).slice(0, 10) : null,
    shelfLifeDays: normalizeProductShelfLifeDaysForProduct(dbProduct.shelf_life_days),
    created_at: dbProduct.created_at != null ? String(dbProduct.created_at) : undefined,
    updated_at: dbProduct.updated_at != null ? String(dbProduct.updated_at) : undefined,
  };
}

/** DB → Product: yalnızca pozitif günleri sayı olarak döndür */
function normalizeProductFollowUpReminderDaysForProduct(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(3650, n);
}

/** INSERT/UPDATE: null = kapalı */
function normalizeProductFollowUpReminderDays(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(3650, n);
}

function normalizeProductShelfLifeDays(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(36500, n);
}

function normalizeProductShelfLifeDaysForProduct(v: unknown): number | undefined {
  const n = normalizeProductShelfLifeDays(v);
  return n == null ? undefined : n;
}
