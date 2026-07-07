import { definitionAPI } from '../services/definitionAPI';
import type { MasterDataItem } from '../components/shared/MasterDataSelectionModal';

export type MasterDataQuickAddVariant = 'default' | 'taxRate';

export interface MasterDataQuickAddOptions {
  tableName: string;
  code: string;
  name: string;
  parentId?: string | null;
  variant?: MasterDataQuickAddVariant;
  extra?: Record<string, unknown>;
}

export function suggestQuickAddCode(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9ÇĞİÖŞÜ]/gi, '')
    .slice(0, 12);
  if (base) return base;
  return `YENI${Date.now().toString().slice(-6)}`;
}

export function mapRowToMasterDataItem(tableName: string, row: Record<string, unknown>): MasterDataItem {
  if (tableName === 'tax_rates') {
    const rate = Number(row.rate ?? 0);
    const desc = String(row.description ?? '').trim() || `%${rate} KDV`;
    return {
      id: String(row.id ?? ''),
      code: `%${rate}`,
      name: desc,
      description: desc,
    };
  }
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    description: row.description != null ? String(row.description) : undefined,
  };
}

export async function createMasterDataQuickAddItem(
  opts: MasterDataQuickAddOptions,
): Promise<MasterDataItem> {
  const { tableName, code, name, parentId = null, variant = 'default', extra = {} } = opts;
  const trimmedName = name.trim();
  const trimmedCode = code.trim();

  if (variant === 'taxRate') {
    const rate = parseFloat(trimmedCode.replace('%', '').replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('Geçerli bir vergi oranı girin.');
    }
    const payload = {
      rate,
      description: trimmedName || `%${rate} KDV`,
      is_active: true,
    };
    const created = await definitionAPI.create('tax_rates', payload as any);
    if (!created) throw new Error('Kayıt oluşturulamadı');
    return mapRowToMasterDataItem('tax_rates', created as Record<string, unknown>);
  }

  if (!trimmedCode || !trimmedName) {
    throw new Error('Kod ve ad zorunludur.');
  }

  const payload: Record<string, unknown> = {
    code: trimmedCode,
    name: trimmedName,
    is_active: true,
    ...extra,
  };

  if (tableName === 'categories' || tableName === 'product_groups') {
    if (parentId) payload.parent_id = parentId;
  }

  const created = await definitionAPI.create(tableName, payload as any);
  if (!created) throw new Error('Kayıt oluşturulamadı');
  return mapRowToMasterDataItem(tableName, created as Record<string, unknown>);
}

/** Ürün / hizmet formu seçim modalları için tablo ve ek alan eşlemesi */
export function resolveProductFormQuickAdd(
  type: string,
  ctx?: { parentGroupId?: string | null; specialCodeNum?: number },
): {
  definitionTableName?: string;
  parentId?: string | null;
  quickAddVariant?: MasterDataQuickAddVariant;
  quickAddExtra?: Record<string, unknown>;
} {
  switch (type) {
    case 'category':
      return { definitionTableName: 'categories' };
    case 'brand':
      return { definitionTableName: 'brands' };
    case 'productGroup':
      return { definitionTableName: 'product_groups' };
    case 'subGroup':
      return { definitionTableName: 'product_groups', parentId: ctx?.parentGroupId ?? null };
    case 'unit':
      return { definitionTableName: 'units' };
    case 'taxRate':
      return { definitionTableName: 'tax_rates', quickAddVariant: 'taxRate' };
    case 'model':
      return {
        definitionTableName: 'special_codes',
        quickAddExtra: { module_type: 'model' },
      };
    case 'supplier':
      return { definitionTableName: 'suppliers' };
    default:
      if (type.startsWith('specialCode')) {
        const num = ctx?.specialCodeNum ?? type.replace('specialCode', '');
        return {
          definitionTableName: 'special_codes',
          quickAddExtra: { module_type: `special_code_${num}` },
        };
      }
      return {};
  }
}
