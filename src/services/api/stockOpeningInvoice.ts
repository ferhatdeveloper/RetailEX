/**
 * Malzeme Açılış Faturası (slip_kind='invoice', trcode=14)
 *
 * Alış faturasına benzer kalıp, ancak **absolute replace** semantiği:
 *   - `products.stock`  ← satırdaki `qty` (mutlak; delta ekleme YASAK —
 *     açılış zaten o ürünün "mevcut miktar" beyanıdır).
 *   - `products.cost`   ← satırdaki `unitCostExclVat` (mutlak birim
 *     maliyet — açılış fişinden sonra ürün kartının standart maliyeti).
 *
 * Tedarikçi/cari/ledger/kasa etkisi YOK — yalnızca stok + maliyet.
 * Aynı (firm_nr, period_nr, product_id) için slip_kind='invoice' +
 * trcode=14 olan birden fazla fiş UNIQUE kısıtla engellenir
 * (migration 180_opening_invoice_unique_per_product.sql).
 *
 * Migration 179 zaten `stock_movements.slip_kind` ve
 * `stock_movement_items.{unit_cost_excl_vat,vat_rate,line_total}`
 * kolonlarını kurdu; bu modül onları dolar.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { productAPI } from './products';
import { STOCK_SLIP_TRCODES } from '../stockMovementAPI';
import { postgrest } from './postgrestClient';

// ─── Tipler ─────────────────────────────────────────────────────────────

export type StockOpeningInvoiceLineInput = {
  productId: string;
  productCode?: string;
  productName?: string;
  /** Miktar — ürün kartının birimi. Açılış sonrası ürün stoğu BU olur. */
  qty: number;
  /** KDV hariç birim maliyet — ürün kartı `cost` alanına yazılır. */
  unitCostExclVat: number;
  /** KDV yüzdesi (0, 1, 5, 10, 20 vb.). Sadece muhasebe/KDV raporu. */
  vatRate: number;
};

export type StockOpeningInvoiceInput = {
  firmNr: string;
  periodNr: string;
  /** Opsiyonel manuel belge no; boşsa otomatik `AF-OPEN-YYYYMMDD-####`. */
  documentNo?: string;
  /** Fiş tarihi (YYYY-MM-DD veya ISO). */
  date: string;
  /** Ambar UUID (opsiyonel; boşsa aktif ilk ambar). */
  warehouseId?: string;
  /** Fiş genel açıklaması. */
  notes?: string;
  lines: StockOpeningInvoiceLineInput[];
};

export type StockOpeningInvoiceLine = {
  productId: string;
  productCode?: string;
  productName?: string;
  qty: number;
  unitCostExclVat: number;
  vatRate: number;
  lineTotal: number;
  movementId: string;
  itemId: string;
};

export type StockOpeningInvoiceResult = {
  documentNo: string;
  movementId: string;
  lines: StockOpeningInvoiceLine[];
  subtotalExclVat: number;
  vatTotal: number;
  grandTotal: number;
  /** Satır başına (productId) {önceki stok, sonraki stok, önceki maliyet, sonraki maliyet}. */
  sideEffects: Array<{
    productId: string;
    prevStock: number;
    nextStock: number;
    prevCost: number;
    nextCost: number;
  }>;
};

/** Bir açılış faturasının kayıt görünümü (listeleme sekmesi). */
export type StockOpeningInvoiceRecord = {
  movementId: string;
  itemId: string;
  documentNo: string;
  movementDate: string;
  productId: string;
  productCode?: string;
  productName?: string;
  qty: number;
  unitCostExclVat: number;
  vatRate: number;
  lineTotal: number;
  notes?: string;
  status: string;
  /** Açılış sonrası ürün kartı maliyeti (snapshot). */
  productCurrentCost?: number;
};

// ─── Yardımcılar ────────────────────────────────────────────────────────

function periodPaths(firmNr: string, periodNr: string) {
  const fn = normalizeFirmTableNr(firmNr);
  const pn = String(periodNr ?? '01').padStart(2, '0');
  return {
    movements: `/rex_${fn}_${pn}_stock_movements`,
    items: `/rex_${fn}_${pn}_stock_movement_items`,
    products: `/rex_${fn}_products`,
  };
}

function productsTableName(firmNr: string) {
  return `rex_${normalizeFirmTableNr(firmNr)}_products`;
}

async function resolveDefaultWarehouseId(): Promise<string | null> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    try {
      const rows = (await postgrest.get(
        '/stores',
        { select: 'id', is_active: 'eq.true', order: 'name.asc', limit: 1 },
        { schema: 'public' },
      )) as any[];
      return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;
    } catch {
      return null;
    }
  }
  try {
    const { rows } = await postgres.query(
      `SELECT id FROM stores WHERE is_active = true ORDER BY name ASC LIMIT 1`,
      [],
    );
    return rows[0]?.id ? String(rows[0].id) : null;
  } catch {
    return null;
  }
}

async function generateOpeningInvoiceDocNo(
  firmNr: string,
  periodNr: string,
): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `AF-OPEN-${datePart}`;
  const paths = periodPaths(firmNr, periodNr);

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const rows = await postgrest
      .get(
        paths.movements,
        {
          select: 'document_no',
          document_no: `like.${prefix}-*`,
          order: 'document_no.desc',
          limit: 1,
        },
        { schema: 'public' },
      )
      .catch(() => [] as any);
    const last = Array.isArray(rows) && rows[0]?.document_no
      ? String(rows[0].document_no)
      : '';
    const tail = last.match(/-(\d+)$/)?.[1];
    const next = (tail ? parseInt(tail, 10) : 0) + 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  const { rows } = await postgres.query(
    `SELECT document_no FROM stock_movements
     WHERE trcode = $1 AND slip_kind = 'invoice' AND document_no LIKE $2
     ORDER BY document_no DESC LIMIT 1`,
    [STOCK_SLIP_TRCODES.OPENING, `${prefix}-%`],
    { firmNr, periodNr },
  );
  const last = rows[0]?.document_no ? String(rows[0].document_no) : '';
  const tail = last.match(/-(\d+)$/)?.[1];
  const next = (tail ? parseInt(tail, 10) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function computeInvoiceTotals(lines: StockOpeningInvoiceLineInput[]) {
  let subtotalExclVat = 0;
  let vatTotal = 0;
  let grandTotal = 0;
  for (const ln of lines) {
    const qty = Math.max(0, Number(ln.qty) || 0);
    const unit = Math.max(0, Number(ln.unitCostExclVat) || 0);
    const vat = Math.max(0, Number(ln.vatRate) || 0);
    const lineSubtotal = qty * unit;
    const lineVat = lineSubtotal * (vat / 100);
    subtotalExclVat += lineSubtotal;
    vatTotal += lineVat;
    grandTotal += lineSubtotal + lineVat;
  }
  return {
    subtotalExclVat: round2(subtotalExclVat),
    vatTotal: round2(vatTotal),
    grandTotal: round2(grandTotal),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Ürünün mevcut stok ve maliyetini getir (PostgREST + DB yolu). */
async function getProductStockAndCost(
  firmNr: string,
  productId: string,
): Promise<{ stock: number; cost: number }> {
  const table = productsTableName(firmNr);
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const rows = await postgrest
      .get<any[]>(
        `/${table}`,
        { select: 'id,stock,cost', id: `eq.${encodeURIComponent(productId)}`, limit: 1 },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const r = Array.isArray(rows) ? rows[0] : null;
    return {
      stock: parseFloat(String(r?.stock ?? 0)) || 0,
      cost: parseFloat(String(r?.cost ?? 0)) || 0,
    };
  }
  const { rows } = await postgres.query(
    `SELECT stock, cost FROM ${table} WHERE id = $1::uuid LIMIT 1`,
    [productId],
    { firmNr },
  );
  return {
    stock: parseFloat(String(rows[0]?.stock ?? 0)) || 0,
    cost: parseFloat(String(rows[0]?.cost ?? 0)) || 0,
  };
}

/**
 * Ürün kartını absolute set et: stock = qty, cost = unitCostExclVat.
 * productAPI.updateStock absolute çalışır (mevcut değer yerine set).
 */
async function applyProductCard(
  firmNr: string,
  productId: string,
  qty: number,
  unitCost: number,
): Promise<void> {
  const table = productsTableName(firmNr);
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    // PostgREST ile PATCH (id bazlı, firm filtresiz).
    await postgrest
      .patch(
        `/${table}?id=eq.${encodeURIComponent(productId)}`,
        { stock: qty, cost: unitCost },
        { schema: 'public', prefer: 'return=minimal' },
      )
      .catch(() => null);
    return;
  }
  await postgres.query(
    `UPDATE ${table}
        SET stock = $1::numeric,
            cost  = $2::numeric
      WHERE id = $3::uuid`,
    [qty, unitCost, productId],
    { firmNr },
  );
}

/**
 * Aynı ürün için aktif bir açılış faturası var mı? Varsa productId döner,
 * böylece UI/Service tek-ürün kuralını uygulayabilir.
 * UNIQUE kısıt (migration 180) DB tarafında da bunu engeller; burada
 * hızlı bir ön-kontrol ile daha anlamlı hata mesajı veririz.
 */
export async function findExistingOpeningInvoiceProductIds(
  productIds: string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const paths = periodPaths(firmNr, periodNr);
  const ids = [...new Set(productIds.map((x) => String(x).trim()).filter(Boolean))];

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const rows = await postgrest
      .get<any[]>(
        paths.items,
        {
          select: 'product_id,movement_id',
          product_id: `in.(${ids.join(',')})`,
          limit: 5000,
        },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const movIds = [...new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.movement_id)).filter(Boolean))];
    if (movIds.length === 0) return new Set();
    const movs = await postgrest
      .get<any[]>(
        paths.movements,
        {
          select: 'id,trcode,slip_kind,status',
          id: `in.(${movIds.join(',')})`,
          limit: 5000,
        },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const activeMovIds = new Set(
      (Array.isArray(movs) ? movs : [])
        .filter(
          (m) =>
            Number(m?.trcode) === STOCK_SLIP_TRCODES.OPENING &&
            String(m?.slip_kind || '') === 'invoice' &&
            String(m?.status || '') !== 'cancelled',
        )
        .map((m) => String(m.id)),
    );
    const used = new Set<string>();
    (Array.isArray(rows) ? rows : []).forEach((r) => {
      if (activeMovIds.has(String(r.movement_id))) used.add(String(r.product_id));
    });
    return used;
  }

  const { rows } = await postgres.query(
    `SELECT DISTINCT smi.product_id::text AS product_id
       FROM stock_movement_items smi
       JOIN stock_movements sm ON sm.id = smi.movement_id
      WHERE sm.trcode = $1
        AND COALESCE(sm.slip_kind, 'quantity') = 'invoice'
        AND COALESCE(sm.status, '') <> 'cancelled'
        AND smi.product_id = ANY($2::uuid[])`,
    [STOCK_SLIP_TRCODES.OPENING, ids],
    { firmNr, periodNr },
  );
  return new Set(rows.map((r) => String(r.product_id)));
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Açılış faturası oluştur (alış faturası benzeri slip_kind='invoice').
 *
 * Semantik:
 *   - Ürün kartı `stock`   ← satır qty (absolute; delta ekleme değil)
 *   - Ürün kartı `cost`    ← satır unitCostExclVat (absolute)
 *   - `stock_movements`    ← slip_kind='invoice', trcode=14
 *   - `stock_movement_items.{unit_cost_excl_vat,vat_rate,line_total}` dolar
 *
 * Bir ürün için zaten aktif açılış faturası varsa **toplu hata** fırlatır
 * (UNIQUE kısıt + UI uyarısı). Çoklu açılış fişi ENGELLENMELİ — yoksa
 * stok/maliyet bozulur.
 */
export async function createStockOpeningInvoiceSlip(
  input: StockOpeningInvoiceInput,
): Promise<StockOpeningInvoiceResult> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error('En az bir satır zorunlu');
  }
  const firmNr = normalizeFirmTableNr(input.firmNr || ERP_SETTINGS.firmNr);
  const periodNr = String(
    input.periodNr ?? (ERP_SETTINGS.periodNr ?? '01'),
  ).padStart(2, '0');
  const dateIso = input.date.includes('T')
    ? input.date
    : `${input.date}T12:00:00.000Z`;
  const paths = periodPaths(firmNr, periodNr);
  const warehouseId = input.warehouseId || (await resolveDefaultWarehouseId());

  // Çoklu açılış fişi engeli: ürün başına en fazla 1 aktif fiş.
  const requestedProductIds = input.lines
    .map((l) => String(l.productId || '').trim())
    .filter(Boolean);
  const alreadyUsed = await findExistingOpeningInvoiceProductIds(requestedProductIds);
  if (alreadyUsed.size > 0) {
    const list = input.lines
      .filter((l) => alreadyUsed.has(String(l.productId)))
      .map(
        (l) =>
          `${l.productCode || l.productName || l.productId} (zaten açılış faturası mevcut)`,
      )
      .join(', ');
    throw new Error(
      `Bu ürün(ler) için zaten açılış faturası kaydedilmiş: ${list}. Aynı ürün için yalnız bir açılış fişi girilebilir.`,
    );
  }

  const documentNo =
    input.documentNo?.trim() ||
    (await generateOpeningInvoiceDocNo(firmNr, periodNr));

  const totals = computeInvoiceTotals(input.lines);
  const desc = [input.notes, 'Açılış faturası benzeri stok devir (slip_kind=invoice)']
    .filter(Boolean)
    .join(' | ');

  // 1) Movement header
  const movementPayload: Record<string, unknown> = {
    firm_nr: String(firmNr),
    period_nr: periodNr,
    document_no: documentNo,
    trcode: STOCK_SLIP_TRCODES.OPENING,
    movement_type: 'in',
    warehouse_id: warehouseId,
    movement_date: dateIso,
    exchange_rate: 1,
    description: desc,
    status: 'completed',
    slip_kind: 'invoice',
  };

  let movementId = '';
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const movRows = await postgrest.post(
      paths.movements,
      movementPayload,
      { schema: 'public', prefer: 'return=representation' },
    );
    const mov = Array.isArray(movRows) ? movRows[0] : movRows;
    movementId = String(mov?.id || '');
  } else {
    const { rows } = await postgres.query(
      `INSERT INTO stock_movements (
        firm_nr, period_nr, document_no, trcode, movement_type, warehouse_id,
        movement_date, exchange_rate, description, status, slip_kind
      ) VALUES ($1, $2, $3, $4, 'in', $5::uuid, $6::timestamptz, 1, $7, 'completed', 'invoice')
      RETURNING id`,
      [
        String(firmNr),
        periodNr,
        documentNo,
        STOCK_SLIP_TRCODES.OPENING,
        warehouseId,
        dateIso,
        desc,
      ],
      { firmNr, periodNr },
    );
    movementId = String(rows[0]?.id || '');
  }
  if (!movementId) {
    throw new Error('Açılış faturası fişi oluşturulamadı');
  }

  // 2) Lines + ürün kartı absolute update
  const resultLines: StockOpeningInvoiceLine[] = [];
  const sideEffects: StockOpeningInvoiceResult['sideEffects'] = [];

  for (const ln of input.lines) {
    const qty = Math.max(0, Number(ln.qty) || 0);
    const unit = Math.max(0, Number(ln.unitCostExclVat) || 0);
    const vat = Math.max(0, Number(ln.vatRate) || 0);
    const lineSubtotal = Math.round(qty * unit * 10000) / 10000;
    const lineTotal = round2(lineSubtotal * (1 + vat / 100));

    // Önceki/sonraki stok + maliyet (snapshot, audit için).
    const before = await getProductStockAndCost(firmNr, ln.productId);

    // Absolute replace (delta ekleme değil).
    await applyProductCard(firmNr, ln.productId, qty, unit);

    // Ürün bilgisi (unit için).
    const all = await productAPI.getAll().catch(() => [] as any[]);
    const p = (Array.isArray(all) ? all : []).find(
      (x) => String(x?.id) === String(ln.productId),
    );

    const itemPayload: Record<string, unknown> = {
      movement_id: movementId,
      product_id: ln.productId,
      quantity: qty,
      unit_price: unit,
      cost_price: unit,
      unit_cost_excl_vat: unit,
      vat_rate: vat,
      line_total: lineTotal,
      exchange_rate: 1,
      unit_name: p?.unit || 'Adet',
      convert_factor: 1,
      notes: input.notes?.trim() || 'Açılış faturası devri',
    };

    let itemId = '';
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const itemRows = await postgrest.post(
        paths.items,
        itemPayload,
        { schema: 'public', prefer: 'return=representation' },
      );
      const it = Array.isArray(itemRows) ? itemRows[0] : itemRows;
      itemId = String(it?.id || '');
    } else {
      const { rows } = await postgres.query(
        `INSERT INTO stock_movement_items (
          movement_id, product_id, quantity, unit_price, cost_price,
          unit_cost_excl_vat, vat_rate, line_total,
          exchange_rate, unit_name, convert_factor, notes
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $4, $4, $5, $6, 1, $7, 1, $8)
        RETURNING id`,
        [
          movementId,
          ln.productId,
          qty,
          unit,
          vat,
          lineTotal,
          p?.unit || 'Adet',
          input.notes?.trim() || 'Açılış faturası devri',
        ],
        { firmNr, periodNr },
      );
      itemId = String(rows[0]?.id || '');
    }

    resultLines.push({
      productId: ln.productId,
      productCode: ln.productCode,
      productName: ln.productName ?? p?.name,
      qty,
      unitCostExclVat: unit,
      vatRate: vat,
      lineTotal,
      movementId,
      itemId,
    });

    sideEffects.push({
      productId: ln.productId,
      prevStock: before.stock,
      nextStock: qty,
      prevCost: before.cost,
      nextCost: unit,
    });
  }

  return {
    documentNo,
    movementId,
    lines: resultLines,
    subtotalExclVat: totals.subtotalExclVat,
    vatTotal: totals.vatTotal,
    grandTotal: totals.grandTotal,
    sideEffects,
  };
}

/** Açılış faturası kayıtları (slip_kind='invoice' aktif olanlar). */
export async function listStockOpeningInvoiceRecords(): Promise<StockOpeningInvoiceRecord[]> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const paths = periodPaths(firmNr, periodNr);
  const productsTable = `rex_${normalizeFirmTableNr(firmNr)}_products`;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const movs = await postgrest
      .get<any[]>(
        paths.movements,
        {
          select: 'id,document_no,movement_date,description,status,trcode,slip_kind',
          slip_kind: 'eq.invoice',
          status: 'neq.cancelled',
          order: 'movement_date.desc',
          limit: 5000,
        },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    const list = Array.isArray(movs) ? movs : [];
    if (list.length === 0) return [];
    const ids = list.map((m) => String(m.id)).filter(Boolean);
    const items: any[] = [];
    const chunk = 40;
    for (let i = 0; i < ids.length; i += chunk) {
      const part = ids.slice(i, i + chunk).join(',');
      const rows = await postgrest
        .get<any[]>(
          paths.items,
          {
            select:
              'id,movement_id,product_id,quantity,unit_cost_excl_vat,vat_rate,line_total',
            movement_id: `in.(${part})`,
            limit: 5000,
          },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      if (Array.isArray(rows)) items.push(...rows);
    }
    const productIds = [
      ...new Set(items.map((it) => String(it.product_id)).filter(Boolean)),
    ];
    const productMap = new Map<
      string,
      { code?: string; name?: string; cost?: number }
    >();
    for (let i = 0; i < productIds.length; i += chunk) {
      const part = productIds.slice(i, i + chunk).join(',');
      const prows = await postgrest
        .get<any[]>(
          productsTable,
          { select: 'id,code,name,cost', id: `in.(${part})`, limit: 5000 },
          { schema: 'public' },
        )
        .catch(() => [] as any[]);
      (Array.isArray(prows) ? prows : []).forEach((p) => {
        productMap.set(String(p.id), {
          code: p.code,
          name: p.name,
          cost: parseFloat(String(p.cost ?? 0)) || 0,
        });
      });
    }
    const movById = new Map(list.map((m) => [String(m.id), m]));
    return items.map((it) => {
      const m = movById.get(String(it.movement_id));
      const p = productMap.get(String(it.product_id));
      return {
        movementId: String(it.movement_id),
        itemId: String(it.id),
        documentNo: String(m?.document_no || ''),
        movementDate: String(m?.movement_date || ''),
        productId: String(it.product_id),
        productCode: p?.code,
        productName: p?.name,
        qty: parseFloat(String(it.quantity ?? 0)) || 0,
        unitCostExclVat: parseFloat(String(it.unit_cost_excl_vat ?? 0)) || 0,
        vatRate: parseFloat(String(it.vat_rate ?? 0)) || 0,
        lineTotal: parseFloat(String(it.line_total ?? 0)) || 0,
        notes: m?.description ? String(m.description) : undefined,
        status: String(m?.status || 'completed'),
        productCurrentCost: p?.cost,
      } satisfies StockOpeningInvoiceRecord;
    });
  }

  const { rows } = await postgres.query(
    `SELECT sm.id AS movement_id, smi.id AS item_id, sm.document_no, sm.movement_date,
            sm.description, sm.status, smi.product_id, smi.quantity,
            smi.unit_cost_excl_vat, smi.vat_rate, smi.line_total,
            p.code AS product_code, p.name AS product_name, p.cost AS product_cost
       FROM stock_movement_items smi
       JOIN stock_movements sm ON sm.id = smi.movement_id
       LEFT JOIN ${productsTable} p ON p.id = smi.product_id
      WHERE sm.trcode = $1
        AND COALESCE(sm.slip_kind, 'quantity') = 'invoice'
        AND COALESCE(sm.status, '') <> 'cancelled'
      ORDER BY sm.movement_date DESC`,
    [STOCK_SLIP_TRCODES.OPENING],
    { firmNr, periodNr },
  );

  return rows.map((r) => ({
    movementId: String(r.movement_id || ''),
    itemId: String(r.item_id || ''),
    documentNo: String(r.document_no || ''),
    movementDate: String(r.movement_date || ''),
    productId: String(r.product_id || ''),
    productCode: r.product_code ? String(r.product_code) : undefined,
    productName: r.product_name ? String(r.product_name) : undefined,
    qty: parseFloat(String(r.quantity ?? 0)) || 0,
    unitCostExclVat: parseFloat(String(r.unit_cost_excl_vat ?? 0)) || 0,
    vatRate: parseFloat(String(r.vat_rate ?? 0)) || 0,
    lineTotal: parseFloat(String(r.line_total ?? 0)) || 0,
    notes: r.description ? String(r.description) : undefined,
    status: String(r.status || 'completed'),
    productCurrentCost: parseFloat(String(r.product_cost ?? 0)) || 0,
  }));
}

/**
 * Açılış faturasını iptal et.
 *  - Movement `status = 'cancelled'`
 *  - Ürün kartı stoğu ve maliyeti **0**'a çekilir (açılış absolute idi;
 *    iptalde de absolute geri al = ürün kartı devir öncesi hali).
 *
 *  Not: Gerçek "önceki stok" bilgisi `sideEffects` ile tutulur; ancak
 *  burada "ürün açılıştan geliyordu" varsayımıyla sıfırlıyoruz. Çoklu
 *  dönem / ardışık açılış fişi mantığı zaten UNIQUE kısıtla engelleniyor.
 */
export async function cancelStockOpeningInvoiceSlip(
  movementId: string,
): Promise<{ productIds: string[] }> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const paths = periodPaths(firmNr, periodNr);

  // İptal edilecek satırların ürünlerini topla (henüz iptal değilse).
  let items: Array<{ id: string; product_id: string; quantity: number }> = [];
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const rows = await postgrest
      .get<any[]>(
        paths.items,
        {
          select: 'id,product_id,quantity',
          movement_id: `eq.${encodeURIComponent(movementId)}`,
          limit: 5000,
        },
        { schema: 'public' },
      )
      .catch(() => [] as any[]);
    items = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: String(r.id),
      product_id: String(r.product_id),
      quantity: parseFloat(String(r.quantity ?? 0)) || 0,
    }));
  } else {
    const { rows } = await postgres.query(
      `SELECT id::text AS id, product_id::text AS product_id, quantity::numeric AS quantity
         FROM stock_movement_items WHERE movement_id = $1::uuid`,
      [movementId],
      { firmNr, periodNr },
    );
    items = rows.map((r) => ({
      id: String(r.id),
      product_id: String(r.product_id),
      quantity: parseFloat(String(r.quantity ?? 0)) || 0,
    }));
  }

  if (items.length === 0) {
    throw new Error('İptal edilecek satır bulunamadı');
  }

  // Movement status = cancelled
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    await postgrest.patch(
      `${paths.movements}?id=eq.${encodeURIComponent(movementId)}`,
      { status: 'cancelled', updated_at: new Date().toISOString() },
      { schema: 'public', prefer: 'return=minimal' },
    );
  } else {
    await postgres.query(
      `UPDATE stock_movements SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1::uuid`,
      [movementId],
      { firmNr, periodNr },
    );
  }

  // Ürün kartı: stock=0, cost=0 (absolute geri al; açılış absolute idi).
  // Çoklu açılış fişi kuralı UNIQUE olduğu için sıfırlama güvenli.
  for (const it of items) {
    await applyProductCard(firmNr, it.product_id, 0, 0);
  }

  return { productIds: items.map((i) => i.product_id) };
}