/**
 * Bağlı kiracı (merkez_tenant_code) + seçili firma için DB tablo/kolon keşfi.
 * Sorgular mevcut postgres bağlantısı üzerinden gider (zaten kiracı DB’sine bağlı).
 */

import {
  DB_SETTINGS,
  ERP_SETTINGS,
  resolveEffectiveTenantDatabaseName,
} from './postgres';

const SENSITIVE_COLUMNS = new Set([
  'encrypted_password',
  'password',
  'password_hash',
  'raw_user_meta_data',
  'refresh_token',
  'access_token',
  'db_pass',
]);

export type TenantSchemaColumn = {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
};

export type TenantSchemaTable = {
  schemaName: string;
  tableName: string;
  /** rex_001_products → products */
  logicalName: string;
  kind: 'firm' | 'period' | 'shared' | 'other';
  columns: TenantSchemaColumn[];
};

export type TenantSchemaContext = {
  tenantCode: string;
  databaseName: string | null;
  firmNr: string;
  periodNr: string;
  tableCount: number;
};

function firmPadded(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

function periodPadded(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

export function getTenantReportContext(): TenantSchemaContext {
  const tenantCode = String(DB_SETTINGS.merkezTenantCode ?? '').trim();
  const databaseName = resolveEffectiveTenantDatabaseName();
  return {
    tenantCode,
    databaseName,
    firmNr: firmPadded(),
    periodNr: periodPadded(),
    tableCount: 0,
  };
}

function classifyTable(tableName: string, firm: string, period: string): {
  kind: TenantSchemaTable['kind'];
  logicalName: string;
} {
  const firmPeriodPrefix = `rex_${firm}_${period}_`;
  const firmPrefix = `rex_${firm}_`;
  if (tableName.startsWith(firmPeriodPrefix)) {
    return { kind: 'period', logicalName: tableName.slice(firmPeriodPrefix.length) };
  }
  if (tableName.startsWith(firmPrefix)) {
    // rex_001_01_sales already handled; rex_001_products
    const rest = tableName.slice(firmPrefix.length);
    if (/^\d{2}_/.test(rest)) {
      return { kind: 'period', logicalName: rest.replace(/^\d{2}_/, '') };
    }
    return { kind: 'firm', logicalName: rest };
  }
  const shared = new Set([
    'stores',
    'firms',
    'users',
    'roles',
    'units',
    'warehouses',
    'branches',
  ]);
  if (shared.has(tableName)) return { kind: 'shared', logicalName: tableName };
  return { kind: 'other', logicalName: tableName };
}

/**
 * Seçili firma için kiracı DB tabloları + kolonları.
 * Öncelik: rex_{firm}_* ve rex_{firm}_{period}_* ; şemalar: public, beauty, rest, wms, pos, logic
 */
export async function discoverTenantReportSchema(opts?: {
  includeOtherSchemas?: boolean;
  search?: string;
}): Promise<{ context: TenantSchemaContext; tables: TenantSchemaTable[] }> {
  const context = getTenantReportContext();
  const firm = context.firmNr;
  const period = context.periodNr;
  const search = String(opts?.search ?? '').trim().toLowerCase();

  try {
    await import('./postgres').then((m) => m.ensureTenantDatabaseFromRegistry?.()).catch(() => undefined);
  } catch {
    /* optional */
  }

  const { postgres } = await import('./postgres');

  const schemas = opts?.includeOtherSchemas
    ? ['public', 'beauty', 'rest', 'wms', 'pos', 'logic']
    : ['public', 'beauty', 'rest', 'wms', 'pos'];

  const sql = `
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.ordinal_position
    FROM information_schema.columns c
    INNER JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = ANY($1::text[])
      AND t.table_type = 'BASE TABLE'
      AND (
        c.table_name LIKE $2
        OR c.table_name LIKE $3
        OR c.table_name = ANY($4::text[])
      )
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `;

  const firmLike = `rex_${firm}_%`;
  const periodLike = `rex_${firm}_${period}_%`;
  const sharedTables = [
    'stores',
    'firms',
    'users',
    'warehouses',
    'branches',
    'unit_sets',
    'units',
  ];

  const { rows } = await postgres.query(sql, [schemas, firmLike, periodLike, sharedTables]);

  const byKey = new Map<string, TenantSchemaTable>();

  for (const row of rows as Record<string, unknown>[]) {
    const schemaName = String(row.table_schema ?? 'public');
    const tableName = String(row.table_name ?? '');
    const columnName = String(row.column_name ?? '');
    if (!tableName || !columnName) continue;
    if (SENSITIVE_COLUMNS.has(columnName)) continue;

    const { kind, logicalName } = classifyTable(tableName, firm, period);
    const key = `${schemaName}.${tableName}`;

    let table = byKey.get(key);
    if (!table) {
      table = {
        schemaName,
        tableName,
        logicalName,
        kind,
        columns: [],
      };
      byKey.set(key, table);
    }

    table.columns.push({
      columnName,
      dataType: String(row.data_type ?? 'text'),
      isNullable: String(row.is_nullable ?? 'YES') === 'YES',
      ordinalPosition: Number(row.ordinal_position ?? 0),
    });
  }

  let tables = Array.from(byKey.values()).filter((t) => t.columns.length > 0);

  if (search) {
    tables = tables
      .map((t) => {
        const tableHit =
          t.tableName.toLowerCase().includes(search) ||
          t.logicalName.toLowerCase().includes(search) ||
          t.schemaName.toLowerCase().includes(search);
        if (tableHit) return t;
        const cols = t.columns.filter((c) => c.columnName.toLowerCase().includes(search));
        if (cols.length === 0) return null;
        return { ...t, columns: cols };
      })
      .filter((t): t is TenantSchemaTable => t != null);
  }

  // kind order: period, firm, shared, other
  const kindOrder = { period: 0, firm: 1, shared: 2, other: 3 } as const;
  tables.sort((a, b) => {
    const kd = kindOrder[a.kind] - kindOrder[b.kind];
    if (kd !== 0) return kd;
    return a.tableName.localeCompare(b.tableName);
  });

  context.databaseName = resolveEffectiveTenantDatabaseName();
  context.tenantCode = String(DB_SETTINGS.merkezTenantCode ?? '').trim() || context.tenantCode;
  context.tableCount = tables.length;

  return { context, tables };
}

export function buildSelectSql(table: TenantSchemaTable, columns?: string[], limit = 100): string {
  const cols =
    columns && columns.length > 0
      ? columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')
      : '*';
  const fq =
    table.schemaName === 'public'
      ? `"${table.tableName.replace(/"/g, '""')}"`
      : `"${table.schemaName.replace(/"/g, '""')}"."${table.tableName.replace(/"/g, '""')}"`;
  const lim = Math.min(Math.max(1, limit), 500);
  return `SELECT ${cols}\nFROM ${fq}\nLIMIT ${lim}`;
}

/** Yalnızca SELECT — rapor oluşturucu güvenlik */
export function assertSafeSelectSql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const head = trimmed
    .replace(/^\/\*[\s\S]*?\*\//, '')
    .trim()
    .slice(0, 12)
    .toUpperCase();
  if (!head.startsWith('SELECT') && !head.startsWith('WITH')) {
    throw new Error('Yalnızca SELECT / WITH sorgularına izin verilir.');
  }
  if (/;\s*\S/.test(trimmed)) {
    throw new Error('Tek sorgu gönderin (çoklu ifade yok).');
  }
  const banned =
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO)\b/i;
  if (banned.test(trimmed)) {
    throw new Error('Yazma / DDL ifadeleri engellendi.');
  }
  return trimmed;
}

export async function runTenantReportQuery(
  sql: string
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const safe = assertSafeSelectSql(sql);
  const { postgres } = await import('./postgres');
  const { rows } = await postgres.query(safe);
  const list = (rows || []) as Record<string, unknown>[];
  const columns =
    list.length > 0
      ? Object.keys(list[0]!)
      : [];
  return { columns, rows: list };
}
