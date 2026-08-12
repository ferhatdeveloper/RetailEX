import { ERP_SETTINGS } from './postgres';
import type { TemplateType } from '../core/types/templates';
import type { TemplateFieldCategory, TemplateFieldDef } from './templateFieldCatalog';
import { flattenDbRecord } from './templateRecordContext';

export interface DbTableColumnMeta {
  tableName: string;
  logicalName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
}

export interface DbTableMeta {
  logicalName: string;
  physicalName: string;
  label: string;
  columns: DbTableColumnMeta[];
}

const SENSITIVE_COLUMNS = new Set([
  'encrypted_password',
  'password',
  'password_hash',
  'raw_user_meta_data',
  'refresh_token',
  'access_token',
]);

const COLUMN_LABELS_TR: Record<string, string> = {
  fiche_no: 'Fiş no',
  document_no: 'Belge no',
  fiche_type: 'Fiş tipi',
  trcode: 'İşlem kodu',
  customer_id: 'Cari ID',
  customer_name: 'Cari adı',
  store_id: 'Mağaza ID',
  total_net: 'Net toplam',
  total_vat: 'KDV toplam',
  total_gross: 'Brüt toplam',
  total_discount: 'İndirim toplam',
  net_amount: 'Net tutar',
  total_cost: 'Maliyet toplam',
  gross_profit: 'Brüt kâr',
  profit_margin: 'Kâr marjı',
  currency_rate: 'Kur',
  payment_method: 'Ödeme yöntemi',
  credit_amount: 'Veresiye tutarı',
  is_cancelled: 'İptal',
  logo_sync_status: 'Logo senkron',
  item_code: 'Stok kodu',
  item_name: 'Kalem adı',
  product_id: 'Ürün ID',
  unit_price: 'Birim fiyat',
  vat_rate: 'KDV oranı',
  discount_rate: 'İndirim oranı',
  discount_amount: 'İndirim tutarı',
  total_amount: 'Satır tutarı',
  unit_cost: 'Birim maliyet',
  unit_multiplier: 'Birim çarpan',
  base_quantity: 'Ana birim miktar',
  unit_price_fc: 'Döviz birim fiyat',
  category_code: 'Kategori kodu',
  group_code: 'Grup kodu',
  brand: 'Marka',
  manufacturer: 'Üretici',
  supplier: 'Tedarikçi',
  min_stock: 'Min stok',
  max_stock: 'Max stok',
  critical_stock: 'Kritik stok',
  tax_nr: 'Vergi no',
  tax_office: 'Vergi dairesi',
  special_code_1: 'Özel kod 1',
  special_code_2: 'Özel kod 2',
  price_list_1: 'Fiyat listesi 1',
  purchase_price: 'Alış fiyatı',
  sale_price_usd: 'Satış USD',
  firm_nr: 'Firma no',
  period_nr: 'Dönem no',
};

const TABLE_LABELS_TR: Record<string, string> = {
  sales: 'Satış / Fatura başlık',
  sale_items: 'Fatura satırları',
  products: 'Ürün kartı',
  customers: 'Müşteri / Cari',
  suppliers: 'Tedarikçi',
  stores: 'Mağaza',
  cash_lines: 'Kasa hareketi',
};

function firmPadded(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

function periodPadded(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

function physicalTableName(logical: string): string {
  const firm = firmPadded();
  const period = periodPadded();
  const periodTables = new Set([
    'sales',
    'sale_items',
    'cash_lines',
    'bank_lines',
    'stock_movements',
    'stock_movement_items',
  ]);
  if (logical === 'stores') return 'stores';
  if (periodTables.has(logical)) return `rex_${firm}_${period}_${logical}`;
  return `rex_${firm}_${logical}`;
}

function logicalTablesForType(type: TemplateType): string[] {
  if (type === 'invoice') {
    return ['sales', 'sale_items', 'customers', 'suppliers', 'stores', 'cash_lines'];
  }
  return ['products', 'customers', 'stores'];
}

function categoryForTable(logical: string): TemplateFieldCategory {
  if (logical === 'sales' || logical === 'cash_lines') return 'document';
  if (logical === 'sale_items') return 'items';
  if (logical === 'products') return 'product';
  if (logical === 'customers' || logical === 'suppliers') return 'customer';
  if (logical === 'stores') return 'store';
  return 'database';
}

function columnLabel(columnName: string, tableLogical: string): string {
  const base = COLUMN_LABELS_TR[columnName];
  if (base) return `${TABLE_LABELS_TR[tableLogical] ?? tableLogical} — ${base}`;
  const human = columnName.replace(/_/g, ' ');
  return `${TABLE_LABELS_TR[tableLogical] ?? tableLogical} — ${human}`;
}

function makeToken(tableLogical: string, columnName: string): string {
  return `{{${tableLogical}.${columnName}}}`;
}

function makeDataKey(tableLogical: string, columnName: string): string {
  return `${tableLogical}.${columnName}`;
}

export function dbColumnToFieldDef(
  col: DbTableColumnMeta,
  sampleValue?: string,
): TemplateFieldDef {
  return {
    token: makeToken(col.logicalName, col.columnName),
    label: columnLabel(col.columnName, col.logicalName),
    category: categoryForTable(col.logicalName),
    sampleValue: sampleValue ?? `(${col.dataType})`,
    description: `DB: ${col.tableName}.${col.columnName}`,
    dataKey: makeDataKey(col.logicalName, col.columnName),
    source: 'database',
    tableName: col.tableName,
    columnName: col.columnName,
    dataType: col.dataType,
  };
}

export async function discoverTemplateDbSchema(type: TemplateType): Promise<DbTableMeta[]> {
  const logicalList = logicalTablesForType(type);
  const physicalList = logicalList.map(physicalTableName);
  const logicalByPhysical = new Map(logicalList.map((l, i) => [physicalList[i]!, l]));

  try {
    const { postgres } = await import('./postgres');
    const placeholders = physicalList.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${placeholders})
      ORDER BY table_name, ordinal_position
    `;
    const { rows } = await postgres.query(sql, physicalList);
    const grouped = new Map<string, DbTableColumnMeta[]>();

    for (const row of rows as Record<string, unknown>[]) {
      const tableName = String(row.table_name ?? '');
      const columnName = String(row.column_name ?? '');
      if (!tableName || !columnName) continue;
      if (SENSITIVE_COLUMNS.has(columnName)) continue;

      const logicalName = logicalByPhysical.get(tableName) ?? tableName;
      const meta: DbTableColumnMeta = {
        tableName,
        logicalName,
        columnName,
        dataType: String(row.data_type ?? 'text'),
        isNullable: String(row.is_nullable ?? 'YES') === 'YES',
      };
      const list = grouped.get(logicalName) ?? [];
      list.push(meta);
      grouped.set(logicalName, list);
    }

    return logicalList
      .filter((logical) => grouped.has(logical))
      .map((logical) => ({
        logicalName: logical,
        physicalName: physicalTableName(logical),
        label: TABLE_LABELS_TR[logical] ?? logical,
        columns: grouped.get(logical) ?? [],
      }));
  } catch (err) {
    console.warn('[templateDbFieldDiscovery] schema discovery failed:', err);
    return buildFallbackSchema(type);
  }
}

/** PG şeması okunamazsa bilinen kolon listesi (master şema) */
function buildFallbackSchema(type: TemplateType): DbTableMeta[] {
  const defs: Record<string, string[]> = {
    sales: [
      'fiche_no', 'document_no', 'trcode', 'fiche_type', 'date', 'customer_id', 'customer_name',
      'store_id', 'total_net', 'total_vat', 'total_gross', 'total_discount', 'net_amount',
      'total_cost', 'gross_profit', 'profit_margin', 'currency', 'currency_rate', 'status',
      'payment_method', 'cashier', 'credit_amount', 'notes', 'firm_nr', 'period_nr', 'created_at',
    ],
    sale_items: [
      'item_code', 'item_name', 'product_id', 'quantity', 'unit', 'unit_price', 'vat_rate',
      'discount_rate', 'discount_amount', 'total_amount', 'net_amount', 'unit_cost', 'total_cost',
      'gross_profit', 'currency',
    ],
    products: [
      'code', 'barcode', 'name', 'name2', 'category_code', 'group_code', 'brand', 'model',
      'unit', 'vat_rate', 'price', 'cost', 'stock', 'min_stock', 'max_stock', 'currency',
      'special_code_1', 'special_code_2', 'purchase_price', 'price_list_1', 'price_list_2',
    ],
    customers: [
      'code', 'name', 'phone', 'email', 'tax_nr', 'tax_office', 'address', 'city', 'balance', 'notes',
    ],
    suppliers: ['code', 'name', 'phone', 'email', 'tax_nr', 'tax_office', 'address', 'city'],
    stores: ['code', 'name', 'address', 'phone'],
    cash_lines: ['fiche_no', 'date', 'amount', 'definition', 'transaction_type', 'currency_code'],
  };

  return logicalTablesForType(type)
    .filter((logical) => defs[logical])
    .map((logical) => ({
      logicalName: logical,
      physicalName: physicalTableName(logical),
      label: TABLE_LABELS_TR[logical] ?? logical,
      columns: (defs[logical] ?? []).map((columnName) => ({
        tableName: physicalTableName(logical),
        logicalName: logical,
        columnName,
        dataType: 'text',
        isNullable: true,
      })),
    }));
}

export async function loadDbSampleRow(
  logicalTable: string,
): Promise<Record<string, unknown> | null> {
  const physical = physicalTableName(logicalTable);
  const periodTables = new Set(['sales', 'sale_items', 'cash_lines', 'bank_lines']);
  const orderCol = logicalTable === 'products' ? 'name' : 'created_at';

  try {
    const { postgres } = await import('./postgres');
    const firm = firmPadded();
    let sql = `SELECT * FROM ${physical}`;
    const params: unknown[] = [];
    if (logicalTable !== 'stores') {
      sql += ` WHERE firm_nr = $1`;
      params.push(firm);
    }
    sql += ` ORDER BY ${orderCol} DESC NULLS LAST LIMIT 1`;

    const { rows } = await postgres.query(sql, params);
    const row = rows?.[0] as Record<string, unknown> | undefined;
    return row ?? null;
  } catch {
    if (periodTables.has(logicalTable)) {
      try {
        const { postgres } = await import('./postgres');
        const { rows } = await postgres.query(
          `SELECT * FROM ${logicalTable} ORDER BY ${orderCol} DESC NULLS LAST LIMIT 1`,
        );
        return (rows?.[0] as Record<string, unknown>) ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function loadDbSamplesForType(
  type: TemplateType,
): Promise<Record<string, unknown>> {
  const tables = logicalTablesForType(type);
  const merged: Record<string, unknown> = {};

  for (const logical of tables) {
    const row = await loadDbSampleRow(logical);
    if (!row) continue;
    const flat = flattenDbRecord(row, {
      prefix: logical,
      namespaces: logical === 'sales' ? ['sales', 'invoice'] : [logical],
    });
    Object.assign(merged, flat);
    if (logical === 'sales') {
      merged.invoice = row;
    }
    if (logical === 'products') {
      merged.product = row;
    }
    if (logical === 'customers') {
      merged.customer = row;
    }
  }

  if (type === 'invoice') {
    const lineRow = await loadDbSampleRow('sale_items');
    if (lineRow) {
      merged.line = lineRow;
      merged.item = lineRow;
      Object.assign(merged, flattenDbRecord(lineRow, { prefix: 'line', namespaces: ['line', 'item'] }));
    }
  }

  return merged;
}

export function formatSampleFromRow(row: Record<string, unknown> | null, columnName: string): string {
  if (!row) return '';
  const v = row[columnName];
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  return String(v).slice(0, 80);
}
