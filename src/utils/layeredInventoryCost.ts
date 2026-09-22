/**
 * Envanter maliyeti: FIFO katmanları (fiş / fatura satır birim fiyatı).
 * Kart alış fiyatı (items.purchase_price / products.cost) kullanılmaz.
 *
 * Yöntem: Girişler (alış fişi, alış faturası) birim maliyetle katman açar;
 * çıkışlar (satış, sarf, alış iade) en eski katmanı tüketir (FIFO).
 * Satılan malın maliyeti (COGS) = tüketilen katman tutarı.
 */

export type LayerDirection = 'in' | 'out';

export type LayerMovement = {
  id: string;
  productId: string;
  date: string;
  createdAt?: string;
  direction: LayerDirection;
  quantity: number;
  /** Girişte katman birim maliyeti (alış satırı). Çıkışta yok sayılır. */
  unitCost: number;
  source?: 'slip' | 'invoice';
  documentNo?: string;
  /** Satış çıkışı dönem SMM; satış iadesi SMM düşer. Ambar sarfı işaretlenmez. */
  cogsKind?: 'sale' | 'return';
};

export type RemainingLayer = {
  quantity: number;
  unitCost: number;
};

export type LayeredOnHand = {
  productId: string;
  /** FIFO sonrası kalan miktar (on-hand ile hizalanabilir) */
  quantity: number;
  layeredCost: number;
  avgUnitCost: number;
  layers: RemainingLayer[];
  todayCogs: number;
};

export type FifoApplyResult = {
  byProductId: Map<string, LayeredOnHand>;
  todayCogs: number;
  /** [cogsFromKey, cogsToKey] satış çıkışlarının FIFO SMM’si */
  periodCogsByProductId: Map<string, number>;
  periodCogs: number;
};

const QTY_EPS = 0.0000001;
const COST_EPS = 0.0000001;

export function movementSortKey(m: LayerMovement): string {
  const d = String(m.date || '').slice(0, 19);
  const c = String(m.createdAt || '').slice(0, 19);
  return `${d}\t${c}\t${m.id}`;
}

export function sortLayerMovements(movements: LayerMovement[]): LayerMovement[] {
  return [...movements].sort((a, b) => {
    const ka = movementSortKey(a);
    const kb = movementSortKey(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}

function consumeLayers(
  layers: RemainingLayer[],
  qtyOut: number,
): { cogs: number; remainingOut: number } {
  let remaining = Math.max(0, Number(qtyOut) || 0);
  let cogs = 0;
  while (remaining > QTY_EPS && layers.length > 0) {
    const layer = layers[0];
    const take = Math.min(remaining, layer.quantity);
    cogs += take * layer.unitCost;
    layer.quantity -= take;
    remaining -= take;
    if (layer.quantity <= QTY_EPS) layers.shift();
  }
  return { cogs, remainingOut: remaining };
}

function snapshotOnHand(productId: string, layers: RemainingLayer[], todayCogs: number): LayeredOnHand {
  const quantity = layers.reduce((s, l) => s + l.quantity, 0);
  const layeredCost = layers.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  return {
    productId,
    quantity,
    layeredCost,
    avgUnitCost: quantity > QTY_EPS ? layeredCost / quantity : 0,
    layers: layers.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost })),
    todayCogs,
  };
}

function alignLayersToTarget(layers: RemainingLayer[], onHand: number): RemainingLayer[] {
  const target = Math.max(0, Number(onHand) || 0);
  const current = layers.reduce((s, l) => s + l.quantity, 0);
  if (Math.abs(current - target) <= QTY_EPS) return layers;
  if (current > target) {
    consumeLayers(layers, current - target);
    return layers;
  }
  return layers;
}

function dateKeyOf(raw: LayerMovement): string {
  const d = String(raw.date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return d;
}

function inCogsRange(dateKey: string, fromKey: string, toKey: string): boolean {
  if (!fromKey && !toKey) return false;
  if (fromKey && dateKey < fromKey) return false;
  if (toKey && dateKey > toKey) return false;
  return dateKey.length >= 10;
}

/**
 * Hareketleri tarih sırasıyla FIFO uygular.
 * `onHandByProductId` verilirse kalan katman miktarı kart stokuna hizalanır
 * (eksik çıkış varsa FIFO tüketilir; fazla stok katmansız = maliyet 0).
 */
export function applyFifoLayers(
  movements: LayerMovement[],
  opts?: {
    todayKey?: string;
    onHandByProductId?: Map<string, number>;
    cogsFromKey?: string;
    cogsToKey?: string;
  },
): FifoApplyResult {
  const todayKey = String(opts?.todayKey || '').slice(0, 10);
  const fromKey = String(opts?.cogsFromKey || '').slice(0, 10);
  const toKey = String(opts?.cogsToKey || '').slice(0, 10);
  const layersByProduct = new Map<string, RemainingLayer[]>();
  const todayCogsByProduct = new Map<string, number>();
  const periodCogsByProductId = new Map<string, number>();

  const addPeriodCogs = (productId: string, amount: number) => {
    if (Math.abs(amount) <= COST_EPS) return;
    periodCogsByProductId.set(productId, (periodCogsByProductId.get(productId) || 0) + amount);
  };

  for (const raw of sortLayerMovements(movements)) {
    const productId = String(raw.productId || '').trim();
    const qty = Math.abs(Number(raw.quantity) || 0);
    if (!productId || qty <= QTY_EPS) continue;

    let layers = layersByProduct.get(productId);
    if (!layers) {
      layers = [];
      layersByProduct.set(productId, layers);
    }

    const dateKey = dateKeyOf(raw);
    const isToday = todayKey !== '' && dateKey === todayKey;
    const inRange = inCogsRange(dateKey, fromKey, toKey);

    if (raw.direction === 'in') {
      const unitCost = Math.max(0, Number(raw.unitCost) || 0);
      layers.push({ quantity: qty, unitCost });
      if (inRange && raw.cogsKind === 'return') {
        addPeriodCogs(productId, -(qty * unitCost));
      }
      continue;
    }

    const { cogs } = consumeLayers(layers, qty);
    if (isToday && cogs > COST_EPS && (raw.cogsKind === 'sale' || (raw.source === 'invoice' && !raw.cogsKind))) {
      todayCogsByProduct.set(productId, (todayCogsByProduct.get(productId) || 0) + cogs);
    }
    if (inRange && raw.cogsKind === 'sale') {
      addPeriodCogs(productId, cogs);
    }
  }

  const onHand = opts?.onHandByProductId;
  if (onHand) {
    for (const [pid, target] of onHand) {
      let layers = layersByProduct.get(pid);
      if (!layers) {
        layers = [];
        layersByProduct.set(pid, layers);
      }
      alignLayersToTarget(layers, target);
    }
  }

  const byProductId = new Map<string, LayeredOnHand>();
  let todayCogs = 0;
  const ids = new Set<string>([...layersByProduct.keys(), ...(onHand ? onHand.keys() : [])]);
  for (const pid of ids) {
    const layers = layersByProduct.get(pid) || [];
    const row = snapshotOnHand(pid, layers, todayCogsByProduct.get(pid) || 0);
    if (onHand?.has(pid)) {
      // Kart stoğu negatif olabilir (negatif satış izni); raporlarda eksi göster
      row.quantity = Number(onHand.get(pid)) || 0;
      row.avgUnitCost = row.quantity > QTY_EPS ? row.layeredCost / row.quantity : 0;
    }
    byProductId.set(pid, row);
    todayCogs += row.todayCogs;
  }

  let periodCogs = 0;
  for (const v of periodCogsByProductId.values()) periodCogs += v;
  return { byProductId, todayCogs, periodCogsByProductId, periodCogs };
}

/** Satış anı: mevcut kalan katmanlardan miktar tüket (kopya; stoku değiştirmez). */
export function consumeFifoForQuantity(
  remaining: RemainingLayer[] | undefined,
  quantity: number,
): { unitCost: number; totalCost: number; available: boolean } {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= QTY_EPS) return { unitCost: 0, totalCost: 0, available: false };
  const copy = (remaining || []).map((l) => ({ quantity: l.quantity, unitCost: l.unitCost }));
  const { cogs, remainingOut } = consumeLayers(copy, qty);
  const available = remainingOut <= QTY_EPS;
  return {
    unitCost: qty > QTY_EPS ? cogs / qty : 0,
    totalCost: cogs,
    available,
  };
}

export function lookupLayeredOnHand(
  byProductId: Map<string, LayeredOnHand>,
  product: { id?: string | null; code?: string | null; barcode?: string | null },
  aliases?: Map<string, string>,
): LayeredOnHand | undefined {
  const id = String(product.id || '').trim();
  if (id && byProductId.has(id)) return byProductId.get(id);
  const code = String(product.code || '').trim();
  if (code && aliases?.has(code)) {
    const mapped = aliases.get(code)!;
    if (byProductId.has(mapped)) return byProductId.get(mapped);
  }
  if (code && byProductId.has(code)) return byProductId.get(code);
  const barcode = String(product.barcode || '').trim();
  if (barcode && aliases?.has(barcode)) {
    const mapped = aliases.get(barcode)!;
    if (byProductId.has(mapped)) return byProductId.get(mapped);
  }
  return undefined;
}

/** Çift kayıt (aynı fiş hem ambar hem fatura) — fatura öncelikli. */
export function dedupeLayerMovements(movements: LayerMovement[]): LayerMovement[] {
  const invoiceKeys = new Set<string>();
  for (const m of movements) {
    if (m.source !== 'invoice') continue;
    const key = fingerprint(m);
    if (key) invoiceKeys.add(key);
  }
  const seen = new Set<string>();
  const out: LayerMovement[] = [];
  for (const m of movements) {
    const fp = fingerprint(m);
    const idKey = `${m.source || ''}|${m.id}`;
    if (seen.has(idKey)) continue;
    seen.add(idKey);
    if (m.source === 'slip' && fp && invoiceKeys.has(fp)) continue;
    out.push(m);
  }
  return out;
}

function fingerprint(m: LayerMovement): string {
  const pid = String(m.productId || '').trim();
  if (!pid) return '';
  const qty = Math.abs(Number(m.quantity) || 0).toFixed(4);
  const doc = String(m.documentNo || '').trim();
  if (doc) return `${pid}|${doc}|${m.direction}|${qty}`;
  const date = String(m.date || '').slice(0, 10);
  const cost = m.direction === 'in' ? (Number(m.unitCost) || 0).toFixed(2) : 'out';
  return `${pid}|${date}|${m.direction}|${qty}|${cost}`;
}

export function sumLayeredCost(byProductId: Map<string, LayeredOnHand>): number {
  let s = 0;
  for (const row of byProductId.values()) s += row.layeredCost;
  return s;
}

export type CostProfitLineKind = 'service' | 'product';

export type CostProfitAggLine = {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  /**
   * Malzeme: satır unit_cost × miktar (katman yoksa yedek; kart alış değil).
   * Hizmet: unit_cost → purchase_price → beauty cost_price → reçete × miktar.
   */
  fallbackCogs: number;
  /** Hizmet | Malzeme — stoklu FIFO yalnızca product için */
  lineKind?: CostProfitLineKind;
};

export type CostProfitRow = CostProfitAggLine & {
  cogs: number;
  profit: number;
  marginPercent: number;
  lineKind: CostProfitLineKind;
  costSource: 'fifo_layers' | 'movement_unit_cost' | 'service_cost' | 'none';
};

export function lookupPeriodCogs(
  periodCogsByProductId: Map<string, number>,
  aliases: Map<string, string> | undefined,
  productId: string,
  productCode: string,
): number {
  const pid = String(productId || '').trim();
  const code = String(productCode || '').trim();
  if (pid && periodCogsByProductId.has(pid)) return Number(periodCogsByProductId.get(pid)) || 0;
  if (code && aliases?.has(code)) {
    const mapped = aliases.get(code)!;
    if (periodCogsByProductId.has(mapped)) return Number(periodCogsByProductId.get(mapped)) || 0;
  }
  if (code && periodCogsByProductId.has(code)) return Number(periodCogsByProductId.get(code)) || 0;
  return 0;
}

/**
 * Satış satırları + SMM.
 * Malzeme: dönem FIFO katman; yoksa fallback. Hizmet: stok yok — yalnızca fallback (kart/reçete).
 * Katman 0 olsa bile gelir gösterilir.
 */
export function buildCostProfitRows(
  lines: CostProfitAggLine[],
  periodCogsByProductId: Map<string, number>,
  aliases?: Map<string, string>,
): CostProfitRow[] {
  return (lines || [])
    .map((line) => {
      const lineKind: CostProfitLineKind =
        line.lineKind === 'service' ? 'service' : 'product';
      const fallback = Number(line.fallbackCogs) || 0;
      let cogs = 0;
      let costSource: CostProfitRow['costSource'] = 'none';

      if (lineKind === 'service') {
        // Hizmet stok katmanı tüketmez; FIFO ile 0 ezilmesin.
        if (Math.abs(fallback) > COST_EPS) {
          cogs = fallback;
          costSource = 'service_cost';
        }
      } else {
        const layered = lookupPeriodCogs(
          periodCogsByProductId,
          aliases,
          line.productId,
          line.productCode,
        );
        if (Math.abs(layered) > COST_EPS) {
          cogs = layered;
          costSource = 'fifo_layers';
        } else if (Math.abs(fallback) > COST_EPS) {
          cogs = fallback;
          costSource = 'movement_unit_cost';
        }
      }

      const revenue = Number(line.revenue) || 0;
      const profit = revenue - cogs;
      const marginPercent = Math.abs(revenue) > 0.009 ? (profit / revenue) * 100 : 0;
      return {
        ...line,
        lineKind,
        quantity: Number(line.quantity) || 0,
        revenue,
        fallbackCogs: fallback,
        cogs,
        profit,
        marginPercent,
        costSource,
      };
    })
    .filter((r) => Math.abs(r.quantity) > QTY_EPS || Math.abs(r.revenue) > 0.009)
    .sort((a, b) => b.profit - a.profit);
}
