import { formatNumber } from '../utils/formatNumber';

/** snake_case → camelCase */
export function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/gi, (_, c) => String(c).toUpperCase());
}

function formatScalarForContext(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'number') return formatNumber(value, 2, true);
  if (value instanceof Date) return value.toLocaleString('tr-TR');
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return value;
}

/**
 * DB satırını şablon bağlamına yayar: hem `fiche_no` hem `ficheNo`, isteğe `sales.fiche_no` vb.
 */
export function flattenDbRecord(
  record: Record<string, unknown>,
  options?: { prefix?: string; namespaces?: string[] },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const namespaces = options?.namespaces ?? [];
  if (options?.prefix) namespaces.push(options.prefix);

  for (const [key, raw] of Object.entries(record)) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'object' && !(raw instanceof Date) && !Array.isArray(raw)) continue;

    const val = formatScalarForContext(raw);
    const camel = snakeToCamel(key);
    out[key] = val;
    if (camel !== key) out[camel] = val;

    for (const ns of namespaces) {
      out[`${ns}.${key}`] = val;
      if (camel !== key) out[`${ns}.${camel}`] = val;
    }
  }
  return out;
}

export function mergeTemplateContexts(...parts: Record<string, unknown>[]): Record<string, unknown> {
  return Object.assign({}, ...parts);
}
