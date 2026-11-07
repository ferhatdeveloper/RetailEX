/**
 * Server / veritabanı girişinde yapı listesi — seçili işletme tipine göre.
 * Kayıtlar silinmez; yalnızca liste süzülür.
 */

export type StructureVertical = 'market' | 'restaurant' | 'wms' | 'beauty';

export type StructureNode = {
  id: string;
  screen?: string;
  children?: StructureNode[];
  items?: StructureNode[];
};

const VERTICAL_BY_ID: Record<string, StructureVertical> = {
  'retail-pos': 'market',
  pos: 'market',
  newsale: 'market',
  'cashier-scale': 'market',
  'scale-mgmt': 'market',
  'scale-management': 'market',
  pricing: 'market',
  wms: 'wms',
  'wms-hub': 'wms',
  stock: 'wms',
  stockcounting: 'wms',
  'wave-picking': 'wms',
  'mobile-inv': 'wms',
  'mobile-inventory-count': 'wms',
  restaurant: 'restaurant',
  'rest-retail': 'restaurant',
  'rest-tables': 'restaurant',
  'restaurant-tables': 'restaurant',
  'rest-orders': 'restaurant',
  'restaurant-orders': 'restaurant',
  'rest-delivery': 'restaurant',
  'restaurant-delivery': 'restaurant',
  'rest-takeaway': 'restaurant',
  'restaurant-takeaway': 'restaurant',
  'rest-schedule': 'restaurant',
  'restaurant-schedule': 'restaurant',
  'rest-kitchen': 'restaurant',
  'restaurant-kitchen': 'restaurant',
  'rest-reports': 'restaurant',
  'restaurant-reports': 'restaurant',
  'rest-settings': 'restaurant',
  'restaurant-settings': 'restaurant',
  'rest-z-report': 'restaurant',
  'restaurant-reports-z': 'restaurant',
  'rest-void-report': 'restaurant',
  'restaurant-reports-void': 'restaurant',
  'rest-product-qty': 'restaurant',
  'restaurant-reports-product': 'restaurant',
  'restaurant-retail': 'restaurant',
  'restaurant-channels': 'restaurant',
  'restaurant-firm': 'restaurant',
  'delivery-management': 'restaurant',
  logistics: 'restaurant',
  'delivery-live': 'restaurant',
  couriers: 'restaurant',
  beauty: 'beauty',
  clinic: 'beauty',
  appointment: 'beauty',
  'beauty-services': 'beauty',
  'beauty-specialists': 'beauty',
  'beauty-sales': 'beauty',
  'beauty-surveys': 'beauty',
};

const TYPE_ALIASES: Record<string, StructureVertical> = {
  market: 'market',
  retail: 'market',
  perakende: 'market',
  magaza: 'market',
  mağaza: 'market',
  restaurant: 'restaurant',
  restoran: 'restaurant',
  rest: 'restaurant',
  wms: 'wms',
  depo: 'wms',
  warehouse: 'wms',
  beauty: 'beauty',
  clinic: 'beauty',
  klinik: 'beauty',
  guzellik: 'beauty',
  güzellik: 'beauty',
};

function foldTypeKey(raw: string): string {
  return raw.trim().toLocaleLowerCase('tr-TR');
}

/** Boş / genel seçim dikey döndürmez — tüm yapılar listelenmez. */
export function normalizeBusinessType(
  raw: string | null | undefined,
): StructureVertical | null {
  const key = foldTypeKey(String(raw ?? ''));
  if (!key || key === 'general' || key === 'all' || key === 'none') return null;
  return TYPE_ALIASES[key] ?? null;
}

export function structureVertical(node: {
  id: string;
  screen?: string;
}): StructureVertical | 'shared' {
  return VERTICAL_BY_ID[node.id] ?? (node.screen ? VERTICAL_BY_ID[node.screen] : undefined) ?? 'shared';
}

function allowsVertical(
  vertical: StructureVertical | 'shared',
  selected: StructureVertical | null,
): boolean {
  if (vertical === 'shared') return true;
  return selected !== null && vertical === selected;
}

/**
 * Seçili tipe uymayan dikey yapıları çıkarır.
 * Tip yoksa yalnızca ortak (dikey olmayan) kayıtlar kalır.
 */
export function filterStructuresByBusinessType<T extends StructureNode>(
  structures: readonly T[],
  businessType: string | null | undefined,
): T[] {
  const selected = normalizeBusinessType(businessType);

  const walk = (node: T): T | null => {
    const vertical = structureVertical(node);
    if (!allowsVertical(vertical, selected)) return null;

    const items = node.items
      ?.map((child) => walk(child as T))
      .filter((child): child is T => child !== null);
    const children = node.children
      ?.map((child) => walk(child as T))
      .filter((child): child is T => child !== null);

    const nestedCount = (node.items?.length ?? 0) + (node.children?.length ?? 0);
    const keptNested = (items?.length ?? 0) + (children?.length ?? 0);
    if (nestedCount > 0 && keptNested === 0 && vertical === 'shared') return null;

    return {
      ...node,
      ...(node.items ? { items } : {}),
      ...(node.children ? { children } : {}),
    } as T;
  };

  return structures
    .map((node) => walk(node))
    .filter((node): node is T => node !== null);
}

function parseModuleIds(raw: unknown): string[] {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter((item) => item.length > 0);
}

/** Firma kartındaki modüllerden tek dikey. pos, restoran firmasını markete çevirmez. */
export function primaryFirmVertical(enabledModules: unknown): StructureVertical | null {
  const mods = parseModuleIds(enabledModules);
  if (mods.includes('beauty') || mods.includes('clinic')) return 'beauty';
  if (mods.includes('restaurant')) return 'restaurant';
  if (mods.includes('wms')) return 'wms';
  if (mods.includes('market') || mods.includes('retail') || mods.includes('pos')) return 'market';
  return null;
}

/**
 * Etiketli firmalar seçili dikeye göre süzülür.
 * Hiç etiket yoksa liste olduğu gibi kalır (giriş bozulmasın).
 * Etiket varken tip seçilmemişse etiketli firmalar dökülmez.
 */
export function filterFirmsByBusinessType<T extends { enabled_modules?: unknown }>(
  firms: readonly T[],
  businessType: string | null | undefined,
): T[] {
  const selected = normalizeBusinessType(businessType);
  const untagged: T[] = [];
  const tagged: T[] = [];
  for (const firm of firms) {
    if (primaryFirmVertical(firm.enabled_modules)) tagged.push(firm);
    else untagged.push(firm);
  }
  if (!selected) {
    if (tagged.length === 0) return [...firms];
    return untagged;
  }
  return [
    ...tagged.filter((firm) => primaryFirmVertical(firm.enabled_modules) === selected),
    ...untagged,
  ];
}
