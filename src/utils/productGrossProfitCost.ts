/**
 * Ürün Brüt Kârı — satış ve satış iadesi maliyeti.
 *
 * Birim maliyet, alışlardan gelen ağırlıklı ortalamadır
 * (Σ alış tutarı / Σ alış miktarı). Alış faturası bu raporda satış satırı değildir.
 * Alış iadesi stok maliyetini burada ters çevirmeyiz; o tutar ortalamayı kurarken düşülür.
 *
 * Satır maliyeti = işaretli miktar × bu birim.
 * Satış iadesinde miktar eksi olduğu için maliyet de eksi olur: mal stoğa geri girer.
 * Brüt kâr = ciro − maliyet.
 * Birim maliyet yoksa (0) maliyet uydurulmaz; 0 kalır.
 */
import { productGrossProfitMarginPct } from './productGrossProfitMargin';
import { productCogsFromUnitPurchase } from './productSaleCogs';

const UNIT_EPS = 0.009;

export type ProductGrossProfitCostRow = {
  productId?: string;
  productCode?: string;
  productName?: string;
  quantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
  lineKind?: 'product' | 'service' | string;
};

export type ProductGrossProfitUnitRef = {
  productId?: string;
  productCode?: string;
  productName?: string;
};

export function grossProfitProductNameKey(name: unknown): string {
  return String(name ?? '').trim().toLocaleLowerCase('tr-TR');
}

/** Kod yok, çizgi veya boş. Ürün kimliği sayılmaz. */
export function isBlankGrossProfitProductCode(code: unknown): boolean {
  const text = String(code ?? '').trim();
  return !text || text === '—' || text === '-' || text === '–';
}

function positiveUnit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * İşaretli miktar × ağırlıklı ortalama birim maliyet.
 * Birim 0 ise maliyet 0; ciro kâr diye yazılmaz, brüt kâr = ciro − 0.
 */
export function productGrossProfitFromWeightedUnit(input: {
  quantity: number;
  revenue: number;
  unitCost: number;
}): { cost: number; grossProfit: number; marginPct: number } {
  const quantity = Number(input.quantity) || 0;
  const revenue = Number(input.revenue) || 0;
  const unit = positiveUnit(input.unitCost);
  const cost = unit > 0 ? productCogsFromUnitPurchase(quantity, unit) : 0;
  const grossProfit = revenue - cost;
  return {
    cost,
    grossProfit,
    marginPct: productGrossProfitMarginPct(revenue, grossProfit),
  };
}

/**
 * Malzeme satırına birim maliyeti yazar.
 * Kimlik (id / kod) birim verirse o kullanılır.
 * İade satırında kimlik yoksa, aynı addaki tek birim (kart veya kardeş satış satırı) uygulanır.
 * Aynı ad iki farklı birime gidiyorsa uydurma yapılmaz.
 * Hizmet satırı olduğu gibi kalır.
 */
export function applyProductGrossProfitWeightedCosts<T extends ProductGrossProfitCostRow>(
  rows: T[],
  unitOf: (ref: ProductGrossProfitUnitRef) => number,
): T[] {
  const directUnits = rows.map((row) => {
    if (row.lineKind === 'service') return 0;
    return positiveUnit(
      unitOf({
        productId: String(row.productId ?? '').trim(),
        productCode: isBlankGrossProfitProductCode(row.productCode)
          ? ''
          : String(row.productCode ?? '').trim(),
        productName: String(row.productName ?? '').trim(),
      }),
    );
  });

  const unitByName = new Map<string, number | null>();
  rows.forEach((row, index) => {
    const unit = directUnits[index];
    if (!(unit > 0)) return;
    const key = grossProfitProductNameKey(row.productName);
    if (!key) return;
    if (!unitByName.has(key)) {
      unitByName.set(key, unit);
      return;
    }
    const prev = unitByName.get(key);
    if (prev == null) return;
    if (Math.abs(prev - unit) > UNIT_EPS) unitByName.set(key, null);
  });

  return rows.map((row, index) => {
    if (row.lineKind === 'service') return row;
    let unit = directUnits[index];
    if (!(unit > 0)) {
      const named = unitByName.get(grossProfitProductNameKey(row.productName));
      if (named && named > 0) unit = named;
    }
    if (!(unit > 0)) {
      const revenue = Number(row.revenue) || 0;
      const cost = Number(row.cost) || 0;
      const grossProfit = revenue - cost;
      return {
        ...row,
        cost,
        grossProfit,
        marginPct: productGrossProfitMarginPct(revenue, grossProfit),
      };
    }
    const next = productGrossProfitFromWeightedUnit({
      quantity: row.quantity,
      revenue: row.revenue,
      unitCost: unit,
    });
    return {
      ...row,
      cost: next.cost,
      grossProfit: next.grossProfit,
      marginPct: next.marginPct,
    };
  });
}

/** Malzeme kartı — kod boş satırı ada göre bağlamak için. Stok kimliği değildir. */
export type ProductNameCardRef = {
  id?: string | null;
  code?: string | null;
  name?: string | null;
  name2?: string | null;
  name_tr?: string | null;
  name_en?: string | null;
  name_ar?: string | null;
  name_ku?: string | null;
};

function cardIdentity(card: ProductNameCardRef): string {
  const id = String(card.id ?? '').trim();
  if (id) return `id:${id}`;
  const code = String(card.code ?? '').trim();
  if (!isBlankGrossProfitProductCode(code)) return `code:${code}`;
  return '';
}

/**
 * Ad → tek kartın kodu.
 * Aynı ad iki farklı karta gidiyorsa değer null: kod uydurulmaz.
 * Kart yoksa anahtar yoktur.
 */
export function uniqueProductCodeByName(cards: ProductNameCardRef[]): Map<string, string | null> {
  const groups = new Map<string, Map<string, string>>();
  for (const card of cards || []) {
    const identity = cardIdentity(card);
    const code = String(card.code ?? '').trim();
    if (!identity || isBlankGrossProfitProductCode(code)) continue;
    const names = [card.name, card.name2, card.name_tr, card.name_en, card.name_ar, card.name_ku];
    const seen = new Set<string>();
    for (const raw of names) {
      const key = grossProfitProductNameKey(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = new Map();
        groups.set(key, bucket);
      }
      if (!bucket.has(identity)) bucket.set(identity, code);
    }
  }
  const out = new Map<string, string | null>();
  for (const [key, bucket] of groups) {
    if (bucket.size !== 1) {
      out.set(key, null);
      continue;
    }
    out.set(key, [...bucket.values()][0] || null);
  }
  return out;
}

/**
 * Kodu boş malzeme satırına, adı tek karta giden kodu yazar.
 * Satış satırının kodu kopyalanmaz. İki kart aynı addaysa satır boş kalır.
 * Satırlar birleştirilmez; stok miktarı değişmez.
 */
export function fillBlankProductCodeFromUniqueCard<T extends {
  productCode?: string;
  productName?: string;
  lineKind?: string;
}>(rows: T[], cards: ProductNameCardRef[]): T[] {
  const byName = uniqueProductCodeByName(cards);
  return (rows || []).map((row) => {
    if (row.lineKind === 'service') return row;
    if (!isBlankGrossProfitProductCode(row.productCode)) return row;
    const code = byName.get(grossProfitProductNameKey(row.productName));
    if (!code) return row;
    return { ...row, productCode: code };
  });
}
