/**
 * Birim kartı (units) + birim seti satırları (unitsetl) birleşik seçenek listesi.
 * Ürün / fatura / sipariş vb. tüm arayüzlerde aynı kaynak mantığı için kullanılır.
 */

export type UnitMasterRow = { id?: string; code?: string; name?: string };
export type UnitSetLineLike = {
  id?: string;
  code?: string;
  name?: string;
  conv_fact1?: number | string;
  multiplier1?: number | string;
  main_unit?: boolean;
};
export type UnitSetLike = { id: string; lines?: UnitSetLineLike[] };

export type UnitSelectOption = { id: string; code: string; name: string };

export type ProductUnitConversionLike = {
  from_unit?: string;
  to_unit?: string;
  factor?: number | string;
};

const FALLBACK: UnitSelectOption[] = [{ id: 'fallback-adet', code: 'ADET', name: 'Adet' }];

function trimUnitName(raw: string | null | undefined): string {
  return String(raw ?? '').trim();
}

function parseUnitMultiplier(raw: unknown, fallback = 1): number {
  const n = parseFloat(String(raw ?? ''));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Kart birimleri + tüm birim seti satırlarındaki isimler (tekrarsız, Türkçe sıralı). */
export function buildUnitSelectOptions(
  masterUnits: UnitMasterRow[] | null | undefined,
  unitSets: UnitSetLike[] | null | undefined
): UnitSelectOption[] {
  const byName = new Map<string, UnitSelectOption>();

  for (const u of masterUnits || []) {
    const name = String(u.name || '').trim();
    if (!name) continue;
    if (byName.has(name)) continue;
    byName.set(name, {
      id: String(u.id ?? `m:${name}`),
      code: String(u.code || '').trim() || name,
      name,
    });
  }

  for (const us of unitSets || []) {
    for (const line of us.lines || []) {
      const name = String(line.name || '').trim();
      if (!name || byName.has(name)) continue;
      const code = String(line.code || '').trim() || name;
      byName.set(name, {
        id: String(line.id || `unitset-line:${us.id}:${code}`),
        code,
        name,
      });
    }
  }

  const list = [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' })
  );
  return list.length > 0 ? list : FALLBACK;
}

/** Satırda kayıtlı birim, listede yoksa (eski veri) seçilebilir kalsın diye eklenir. */
export function withMissingUnitValue(
  options: UnitSelectOption[],
  currentUnit: string | null | undefined
): UnitSelectOption[] {
  const u = String(currentUnit || '').trim();
  if (!u || options.some((o) => o.name === u)) return options;
  return [...options, { id: `orphan:${u}`, code: u, name: u }];
}

/** Kod + açıklama doluysa satırda ürün/hizmet seçilmiş kabul edilir (arama yazısı yetmez). */
export function invoiceLineHasSelectedItem(item: {
  code?: string | null;
  description?: string | null;
}): boolean {
  return Boolean(trimUnitName(item.code)) && Boolean(trimUnitName(item.description));
}

function unitSetLinesAsOptions(
  unitSets: UnitSetLike[] | null | undefined,
  unitsetId: string | null | undefined,
): UnitSelectOption[] {
  const id = String(unitsetId || '').trim();
  if (!id) return [];
  const lines = (unitSets || []).find((us) => String(us.id) === id)?.lines || [];
  const out: UnitSelectOption[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const name = String(line.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const code = String(line.code || '').trim() || name;
    out.push({
      id: String(line.id || `unitset-line:${id}:${code}`),
      code,
      name,
    });
  }
  return out;
}

function putUnitOption(byName: Map<string, UnitSelectOption>, option: UnitSelectOption): void {
  if (!option.name || byName.has(option.name)) return;
  byName.set(option.name, option);
}

/**
 * Ürün baz birimi + birim seti satırları + çarpanlı çevrim/barkod birimleri.
 * Çevrimi olmayan rastgele barkod birimleri eklenmez.
 */
export function collectProductInvoiceUnits(opts: {
  baseUnit?: string | null;
  unitsetLines?: UnitSetLineLike[] | null;
  conversions?: ProductUnitConversionLike[] | null;
  barcodeUnits?: string[] | null;
}): { units: string[]; multipliers: Record<string, number> } {
  const units: string[] = [];
  const multipliers: Record<string, number> = {};
  const add = (raw: string | null | undefined, multiplier?: number) => {
    const name = trimUnitName(raw);
    if (!name) return;
    if (!units.includes(name)) units.push(name);
    if (multiplier != null && Number.isFinite(multiplier) && multiplier > 0) {
      multipliers[name] = multiplier;
    } else if (multipliers[name] == null) {
      multipliers[name] = 1;
    }
  };

  const base = trimUnitName(opts.baseUnit);
  if (base) add(base, 1);

  for (const line of opts.unitsetLines || []) {
    add(
      line.name || line.code,
      parseUnitMultiplier(line.conv_fact1 ?? line.multiplier1, 1),
    );
  }

  const convertible = new Set(units);
  for (const conv of opts.conversions || []) {
    const from = trimUnitName(conv.from_unit);
    const to = trimUnitName(conv.to_unit);
    const factor = parseUnitMultiplier(conv.factor, 1);
    if (from) {
      add(from, factor);
      convertible.add(from);
    }
    if (to) {
      add(to, to === base || !from ? 1 : multipliers[to] ?? 1);
      convertible.add(to);
    }
  }

  for (const barcodeUnit of opts.barcodeUnits || []) {
    const name = trimUnitName(barcodeUnit);
    if (name && convertible.has(name)) add(name);
  }

  return { units, multipliers };
}

export type InvoiceLineUnitFields = {
  unit?: string;
  unitsetId?: string;
  productId?: string;
  productUnit?: string;
  allowedUnits?: string[];
  unitMultipliers?: Record<string, number>;
};

export type InvoiceProductUnitStamp = {
  id?: string;
  unit?: string;
  unitsetId?: string;
  unitset_id?: string;
};

/** Seçilen ürünün birim setini / baz birimini fatura satırına yazar (katalog dökülmez). */
export function applyProductUnitsToInvoiceItem<T extends InvoiceLineUnitFields>(
  item: T,
  product: InvoiceProductUnitStamp,
  unitSets?: UnitSetLike[] | null,
): T {
  const unitsetId = trimUnitName(product.unitsetId || product.unitset_id || item.unitsetId) || undefined;
  const lines = unitsetId
    ? (unitSets || []).find((us) => String(us.id) === unitsetId)?.lines || []
    : [];
  const base = trimUnitName(product.unit || item.productUnit || item.unit) || 'Adet';
  const collected = collectProductInvoiceUnits({
    baseUnit: base,
    unitsetLines: lines,
  });
  const allowed = [...collected.units];
  for (const extra of item.allowedUnits || []) {
    const name = trimUnitName(extra);
    if (name && !allowed.includes(name)) allowed.push(name);
  }

  return {
    ...item,
    productId: product.id || item.productId,
    productUnit: base,
    unitsetId: unitsetId || item.unitsetId,
    allowedUnits: allowed,
    unitMultipliers: { ...item.unitMultipliers, ...collected.multipliers },
  };
}

/**
 * Fatura satırı birim listesi: ürünün baz birimi, birim seti ve çarpanlı alternatifler.
 * Tüm firma birim kartı kataloğu (Aset, Dakika, Kg…) satıra dökülmez.
 */
export function buildInvoiceLineUnitOptions(opts: {
  hasProduct?: boolean;
  productUnit?: string | null;
  unitsetId?: string | null;
  unitSets?: UnitSetLike[] | null;
  currentUnit?: string | null;
  extraUnits?: string[] | null;
}): UnitSelectOption[] {
  if (opts.hasProduct === false) return [];

  const byName = new Map<string, UnitSelectOption>();
  const productUnit = trimUnitName(opts.productUnit);
  if (productUnit) {
    putUnitOption(byName, {
      id: `product:${productUnit}`,
      code: productUnit,
      name: productUnit,
    });
  }

  for (const option of unitSetLinesAsOptions(opts.unitSets, opts.unitsetId)) {
    putUnitOption(byName, option);
  }

  for (const raw of opts.extraUnits || []) {
    const name = trimUnitName(raw);
    if (!name) continue;
    putUnitOption(byName, { id: `extra:${name}`, code: name, name });
  }

  if (byName.size > 0) {
    return withMissingUnitValue(
      [...byName.values()],
      opts.hasProduct === false ? '' : opts.currentUnit,
    );
  }

  const inferred = productUnit || (opts.hasProduct ? trimUnitName(opts.currentUnit) : '');
  if (inferred) {
    return withMissingUnitValue(
      [{ id: `product:${inferred}`, code: inferred, name: inferred }],
      opts.currentUnit,
    );
  }

  return [];
}
