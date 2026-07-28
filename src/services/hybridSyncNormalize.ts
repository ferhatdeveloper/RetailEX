/**
 * Hibrit senkron — kuyruk satırı JSON normalize (NOT NULL varsayılanları, code birleştirme).
 */

const PRODUCT_BOOL_DEFAULTS: Record<string, boolean> = {
  expiry_tracking: false,
  is_scale_product: false,
  has_variants: false,
  is_active: true,
  auto_calculate_usd: false,
};

function isNullishJsonValue(value: unknown): boolean {
  return value === null || value === undefined || value === 'null';
}

/** rex_002_products → 002 */
export function firmNrFromSyncTableName(tableName: string): string | null {
  const m = String(tableName).match(/^rex_(\d{3})_/i);
  return m?.[1] ?? null;
}

/** PostgREST filtre öneki (eq.) UUID alanına sızmışsa temizle */
function stripEqPrefixFromUuidish(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!/^eq\./i.test(s)) return value;
  const raw = s.replace(/^(eq\.)+/i, '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  return value;
}

/** PostgREST / doğrudan UPSERT öncesi satır normalize */
export function normalizeSyncRow(
  tableName: string,
  data: Record<string, unknown>,
  recordId?: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };

  const cleanRecordId =
    recordId != null ? String(stripEqPrefixFromUuidish(recordId) ?? recordId) : undefined;

  if (cleanRecordId && (!('id' in out) || out.id == null || out.id === 'null')) {
    out.id = cleanRecordId;
  } else if ('id' in out) {
    out.id = stripEqPrefixFromUuidish(out.id);
  }

  const firmFromTable = firmNrFromSyncTableName(tableName);
  if (firmFromTable && (!('firm_nr' in out) || isNullishJsonValue(out.firm_nr))) {
    out.firm_nr = firmFromTable;
  }

  if (/_products$/i.test(tableName)) {
    for (const [key, defaultValue] of Object.entries(PRODUCT_BOOL_DEFAULTS)) {
      if (!(key in out) || isNullishJsonValue(out[key])) {
        out[key] = defaultValue;
      }
    }
  }

  for (const [key, value] of Object.entries(out)) {
    if (isNullishJsonValue(value)) {
      delete out[key];
    }
  }

  return out;
}

/** Müşteri/tedarikçi: aynı code farklı id ile gelirse mevcut id'ye yönlendir */
export function resolveSyncRecordId(
  tableName: string,
  recordId: string,
  data: Record<string, unknown>,
  existingIdByCode?: string | null,
): { recordId: string; data: Record<string, unknown> } {
  if (!/_((customers|suppliers))$/i.test(tableName)) {
    return { recordId, data };
  }
  const code = String(data.code ?? '').trim();
  if (!code || !existingIdByCode || existingIdByCode === recordId) {
    return { recordId, data };
  }
  return {
    recordId: existingIdByCode,
    data: { ...data, id: existingIdByCode },
  };
}
