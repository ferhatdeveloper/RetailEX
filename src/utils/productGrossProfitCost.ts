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
