/**
 * Stok devir fişi — eski programdan açılış stok miktarı devri.
 * `stock_movements` trcode=14 (OPENING) + ürün stok alanı güncellenir.
 *
 * 179 ile birlikte iki mod var:
 *   - `quantity` (eski davranış): yalnız hedef miktar; birim fiyat 0.
 *   - `invoice`  (alış faturası benzeri): miktar + birim fiyat (KDV hariç)
 *     + KDV % + satır toplam; `stock_movement_items` üzerinde
 *     `unit_cost_excl_vat` / `vat_rate` / `line_total` dolar.
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { productAPI } from './products';
import { STOCK_SLIP_TRCODES } from '../stockMovementAPI';
import { postgrest } from './postgrestClient';

export type StockDevirLineInput = {
  productId: string;
  productCode?: string;
  productName?: string;
  /** Hedef açılış stok (mutlak miktar) */
  targetStock: number;
  existingMovementId?: string;
  existingItemId?: string;
};

export type StockDevirBatchInput = {
  date: string;
  batchNotes?: string;
  replaceExisting?: boolean;
  warehouseId?: string;
  lines: StockDevirLineInput[];
};

export type StockDevirBatchResult = {
  created: number;
  updated: number;
  replaced: number;
  skipped: number;
  errors: { productId: string; message: string }[];
};

export type StockDevirRecord = {
  movementId: string;
  itemId: string;
  document_no: string;
  movement_date: string;
  product_id: string;
  product_code?: string;
  product_name?: string;
  quantity: number;
  description?: string;
  status: string;
};

function periodPaths(firmNr: string, periodNr: string) {
  const fn = normalizeFirmTableNr(firmNr);
  const pn = String(periodNr ?? '01').padStart(2, '0');
  return {
    movements: `/rex_${fn}_${pn}_stock_movements`,
    items: `/rex_${fn}_${pn}_stock_movement_items`,
    products: `/rex_${fn}_products`,
  };
}

async function resolveDefaultWarehouseId(): Promise<string | null> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.get<any[]>(
      '/stores',
      { select: 'id', is_active: 'eq.true', order: 'name.asc', limit: '1' },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;
  }
  const { rows } = await postgres.query(
    `SELECT id FROM stores WHERE is_active = true ORDER BY name ASC LIMIT 1`,
    [],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}

async function generateStockDevirDocNo(firmNr: string, periodNr: string): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SDEV-${datePart}`;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const path = periodPaths(firmNr, periodNr).movements;
    const rows = await postgrest.get<any[]>(
      path,
      {
        select: 'document_no',
        document_no: `like.${prefix}-*`,
        order: 'document_no.desc',
        limit: '1',
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    const last = Array.isArray(rows) && rows[0]?.document_no ? String(rows[0].document_no) : '';
    const tail = last.match(/-(\d+)$/)?.[1];
    const next = (tail ? parseInt(tail, 10) : 0) + 1;
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }

  const { rows } = await postgres.query(
    `SELECT document_no FROM stock_movements
     WHERE trcode = $1 AND document_no LIKE $2
     ORDER BY document_no DESC LIMIT 1`,
    [STOCK_SLIP_TRCODES.OPENING, `${prefix}-%`],
    { firmNr, periodNr },
  );
  const last = rows[0]?.document_no ? String(rows[0].document_no) : '';
  const tail = last.match(/-(\d+)$/)?.[1];
  const next = (tail ? parseInt(tail, 10) : 0) + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

async function cancelStockDevirForProduct(
  firmNr: string,
  periodNr: string,
  productId: string,
): Promise<number> {
  const records = await listStockDevirRecords();
  const forProduct = records.filter((r) => r.product_id === productId && r.status !== 'cancelled');
  let count = 0;
  for (const rec of forProduct) {
    await cancelStockDevirRecord(rec.movementId, rec.itemId);
    count += 1;
  }
  return count;
}

async function insertStockDevirSlip(
  firmNr: string,
  periodNr: string,
  line: StockDevirLineInput,
  docNo: string,
  dateIso: string,
  warehouseId: string | null,
  batchNotes?: string,
): Promise<{ movementId: string; itemId: string }> {
  const qty = Math.max(0, Number(line.targetStock) || 0);
  const desc = [batchNotes, `Stok devir — ${line.productCode || line.productName || line.productId}`]
    .filter(Boolean)
    .join(' | ');

  const movementPayload = {
    firm_nr: String(firmNr),
    period_nr: String(periodNr),
    document_no: docNo,
    trcode: STOCK_SLIP_TRCODES.OPENING,
    movement_type: 'in',
    warehouse_id: warehouseId,
    movement_date: dateIso,
    exchange_rate: 1,
    description: desc,
    status: 'completed',
  };

  const itemPayload = (movementId: string) => ({
    movement_id: movementId,
    product_id: line.productId,
    quantity: qty,
    unit_price: 0,
    cost_price: 0,
    exchange_rate: 1,
    unit_name: 'Adet',
    convert_factor: 1,
    notes: 'Açılış stok devri',
  });

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const paths = periodPaths(firmNr, periodNr);
    const movRows = await postgrest.post<any[]>(paths.movements, movementPayload, {
      schema: 'public',
      prefer: 'return=representation',
    });
    const mov = Array.isArray(movRows) ? movRows[0] : movRows;
    const movementId = String(mov?.id || '');
    if (!movementId) throw new Error('Stok devir fişi oluşturulamadı');
    const itemRows = await postgrest.post<any[]>(
      paths.items,
      itemPayload(movementId),
      { schema: 'public', prefer: 'return=representation' },
    );
    const item = Array.isArray(itemRows) ? itemRows[0] : itemRows;
    return { movementId, itemId: String(item?.id || '') };
  }

  const { rows: movIns } = await postgres.query(
    `INSERT INTO stock_movements (
      firm_nr, period_nr, document_no, trcode, movement_type, warehouse_id,
      movement_date, exchange_rate, description, status
    ) VALUES ($1, $2, $3, $4, 'in', $5::uuid, $6::timestamptz, 1, $7, 'completed')
    RETURNING id`,
    [String(firmNr), String(periodNr), docNo, STOCK_SLIP_TRCODES.OPENING, warehouseId, dateIso, desc],
    { firmNr, periodNr },
  );
  const movementId = String(movIns[0]?.id || '');
  const { rows: itemIns } = await postgres.query(
    `INSERT INTO stock_movement_items (
      movement_id, product_id, quantity, unit_price, cost_price, exchange_rate, unit_name, convert_factor, notes
    ) VALUES ($1::uuid, $2::uuid, $3, 0, 0, 1, 'Adet', 1, 'Açılış stok devri')
    RETURNING id`,
    [movementId, line.productId, qty],
    { firmNr, periodNr },
  );
  return { movementId, itemId: String(itemIns[0]?.id || '') };
}

/** Aktif stok devir kayıtları */
export async function listStockDevirRecords(): Promise<StockDevirRecord[]> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const fn = normalizeFirmTableNr(firmNr);
  const productsTable = `rex_${fn}_products`;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const paths = periodPaths(firmNr, periodNr);
    const movements = await postgrest.get<any[]>(
      paths.movements,
      {
        select: 'id,document_no,movement_date,description,status,trcode',
        trcode: `eq.${STOCK_SLIP_TRCODES.OPENING}`,
        status: 'neq.cancelled',
        order: 'movement_date.desc',
        limit: '5000',
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    const movList = Array.isArray(movements) ? movements : [];
    if (movList.length === 0) return [];

    const movIds = movList.map((m) => String(m.id)).filter(Boolean);
    const items: any[] = [];
    const chunk = 40;
    for (let i = 0; i < movIds.length; i += chunk) {
      const part = movIds.slice(i, i + chunk).join(',');
      const rows = await postgrest.get<any[]>(
        paths.items,
        { select: 'id,movement_id,product_id,quantity', movement_id: `in.(${part})`, limit: '5000' },
        { schema: 'public' },
      ).catch(() => [] as any[]);
      if (Array.isArray(rows)) items.push(...rows);
    }

    const productIds = [...new Set(items.map((it) => String(it.product_id)).filter(Boolean))];
    const productMap = new Map<string, { code?: string; name?: string }>();
    for (let i = 0; i < productIds.length; i += chunk) {
      const part = productIds.slice(i, i + chunk).join(',');
      const prows = await postgrest.get<any[]>(
        paths.products,
        { select: 'id,code,name', id: `in.(${part})`, limit: '5000' },
        { schema: 'public' },
      ).catch(() => [] as any[]);
      (Array.isArray(prows) ? prows : []).forEach((p) => {
        productMap.set(String(p.id), { code: p.code, name: p.name });
      });
    }

    const movById = new Map(movList.map((m) => [String(m.id), m]));
    return items.map((it) => {
      const m = movById.get(String(it.movement_id));
      const p = productMap.get(String(it.product_id));
      return {
        movementId: String(it.movement_id),
        itemId: String(it.id),
        document_no: String(m?.document_no || ''),
        movement_date: String(m?.movement_date || ''),
        product_id: String(it.product_id),
        product_code: p?.code,
        product_name: p?.name,
        quantity: parseFloat(String(it.quantity ?? 0)) || 0,
        description: m?.description ? String(m.description) : undefined,
        status: String(m?.status || 'completed'),
      } satisfies StockDevirRecord;
    });
  }

  const { rows } = await postgres.query(
    `SELECT sm.id AS movement_id, smi.id AS item_id, sm.document_no, sm.movement_date,
            sm.description, sm.status, smi.product_id, smi.quantity,
            p.code AS product_code, p.name AS product_name
     FROM stock_movement_items smi
     JOIN stock_movements sm ON sm.id = smi.movement_id
     LEFT JOIN ${productsTable} p ON p.id = smi.product_id
     WHERE sm.trcode = $1 AND COALESCE(sm.status, '') <> 'cancelled'
     ORDER BY sm.movement_date DESC`,
    [STOCK_SLIP_TRCODES.OPENING],
    { firmNr, periodNr },
  );

  return rows.map((r) => ({
    movementId: String(r.movement_id),
    itemId: String(r.item_id),
    document_no: String(r.document_no || ''),
    movement_date: String(r.movement_date || ''),
    product_id: String(r.product_id || ''),
    product_code: r.product_code ? String(r.product_code) : undefined,
    product_name: r.product_name ? String(r.product_name) : undefined,
    quantity: parseFloat(String(r.quantity ?? 0)) || 0,
    description: r.description ? String(r.description) : undefined,
    status: String(r.status || 'completed'),
  }));
}

export async function getStockDevirMapByProduct(): Promise<Map<string, StockDevirRecord>> {
  const list = await listStockDevirRecords();
  const map = new Map<string, StockDevirRecord>();
  for (const row of list) {
    if (!row.product_id) continue;
    if (!map.has(row.product_id)) map.set(row.product_id, row);
  }
  return map;
}

export async function updateStockDevirItem(
  movementId: string,
  itemId: string,
  productId: string,
  targetStock: number,
  options?: { date?: string; notes?: string },
): Promise<void> {
  const qty = Math.max(0, Number(targetStock) || 0);
  await productAPI.updateStock(productId, qty);

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const dateIso = options?.date
    ? (options.date.includes('T') ? options.date : `${options.date}T12:00:00.000Z`)
    : undefined;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const paths = periodPaths(firmNr, periodNr);
    await postgrest.patch(
      `${paths.items}?id=eq.${encodeURIComponent(itemId)}`,
      { quantity: qty },
      { schema: 'public', prefer: 'return=minimal' },
    );
    const movPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (dateIso) movPatch.movement_date = dateIso;
    if (options?.notes !== undefined) movPatch.description = options.notes;
    await postgrest.patch(
      `${paths.movements}?id=eq.${encodeURIComponent(movementId)}`,
      movPatch,
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }

  await postgres.query(
    `UPDATE stock_movement_items SET quantity = $1::numeric WHERE id = $2::uuid`,
    [qty, itemId],
    { firmNr, periodNr },
  );
  await postgres.query(
    `UPDATE stock_movements SET
      movement_date = COALESCE($1::timestamptz, movement_date),
      description = COALESCE($2, description),
      updated_at = NOW()
     WHERE id = $3::uuid`,
    [dateIso || null, options?.notes ?? null, movementId],
    { firmNr, periodNr },
  );
}

export async function cancelStockDevirRecord(movementId: string, itemId: string): Promise<void> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');

  let productId = '';
  let slipQty = 0;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const paths = periodPaths(firmNr, periodNr);
    const items = await postgrest.get<any[]>(
      paths.items,
      { select: 'product_id,quantity', id: `eq.${itemId}`, limit: '1' },
      { schema: 'public' },
    );
    const it = Array.isArray(items) ? items[0] : null;
    productId = String(it?.product_id || '');
    slipQty = parseFloat(String(it?.quantity ?? 0)) || 0;
    await postgrest.patch(
      `${paths.movements}?id=eq.${encodeURIComponent(movementId)}`,
      { status: 'cancelled', updated_at: new Date().toISOString() },
      { schema: 'public', prefer: 'return=minimal' },
    );
  } else {
    const { rows } = await postgres.query(
      `SELECT product_id, quantity FROM stock_movement_items WHERE id = $1::uuid`,
      [itemId],
      { firmNr, periodNr },
    );
    productId = String(rows[0]?.product_id || '');
    slipQty = parseFloat(String(rows[0]?.quantity ?? 0)) || 0;
    await postgres.query(
      `UPDATE stock_movements SET status = 'cancelled', updated_at = NOW() WHERE id = $1::uuid`,
      [movementId],
      { firmNr, periodNr },
    );
  }

  if (productId) {
    const products = await productAPI.getAll();
    const p = products.find((x) => x.id === productId);
    const current = parseFloat(String(p?.stock ?? 0)) || 0;
    const next = Math.max(0, current - slipQty);
    await productAPI.updateStock(productId, next);
  }
}

/** Toplu stok devir */
export async function createStockDevirBatch(input: StockDevirBatchInput): Promise<StockDevirBatchResult> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const dateIso = input.date.includes('T') ? input.date : `${input.date}T12:00:00.000Z`;
  const replaceExisting = input.replaceExisting !== false;
  const warehouseId = input.warehouseId || (await resolveDefaultWarehouseId());

  const result: StockDevirBatchResult = {
    created: 0,
    updated: 0,
    replaced: 0,
    skipped: 0,
    errors: [],
  };

  for (const line of input.lines) {
    const target = Math.max(0, Number(line.targetStock) || 0);
    if (!line.productId) {
      result.skipped += 1;
      continue;
    }
    try {
      if (line.existingItemId && line.existingMovementId && !replaceExisting) {
        await updateStockDevirItem(line.existingMovementId, line.existingItemId, line.productId, target, {
          date: input.date,
          notes: input.batchNotes,
        });
        result.updated += 1;
        continue;
      }
      if (replaceExisting) {
        result.replaced += await cancelStockDevirForProduct(firmNr, periodNr, line.productId);
      }
      await productAPI.updateStock(line.productId, target);
      const docNo = await generateStockDevirDocNo(firmNr, periodNr);
      await insertStockDevirSlip(firmNr, periodNr, { ...line, targetStock: target }, docNo, dateIso, warehouseId, input.batchNotes);
      result.created += 1;
    } catch (err: any) {
      result.errors.push({ productId: line.productId, message: err?.message || String(err) });
    }
  }

  return result;
}

// ============================================================================
// 179 — Açılış faturası benzeri slip_kind='invoice' devir
// Tedarikçi/cari ledger YOK — yalnız stok devir (muhasebe simetrisi korunur).
// =============================================================================

export type StockOpeningInvoiceLineInput = {
  productId: string;
  productCode?: string;
  productName?: string;
  /** Miktar (birim: ürün kartındaki `unit`) */
  qty: number;
  /** KDV hariç birim maliyet */
  unitCostExclVat: number;
  /** KDV yüzdesi (0, 1, 5, 10, 20 vb.) */
  vatRate: number;
};

export type StockOpeningInvoiceInput = {
  firmNr: string;
  periodNr: string;
  /** Opsiyonel manuel belge no; boşsa otomatik üretilir */
  documentNo?: string;
  /** Fiş tarihi (YYYY-MM-DD veya ISO) */
  date: string;
  /** Ambar (UUID) — verilmezse aktif ilk ambar */
  warehouseId?: string;
  /** Fiş genel açıklaması */
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
};

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
    subtotalExclVat: Math.round(subtotalExclVat * 100) / 100,
    vatTotal: Math.round(vatTotal * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}

/** Alış faturası benzeri stok devir fişi: slip_kind='invoice', KDV hariç birim fiyat + KDV % + satır toplam. */
export async function createStockOpeningInvoiceSlip(
  input: StockOpeningInvoiceInput,
): Promise<StockOpeningInvoiceResult> {
  if (!input.lines || input.lines.length === 0) {
    throw new Error('En az bir satır zorunlu');
  }
  const firmNr = normalizeFirmTableNr(input.firmNr || ERP_SETTINGS.firmNr);
  const periodNr = String(input.periodNr ?? (ERP_SETTINGS.periodNr ?? '01')).padStart(2, '0');
  const dateIso = input.date.includes('T') ? input.date : `${input.date}T12:00:00.000Z`;
  const paths = periodPaths(firmNr, periodNr);
  const warehouseId = input.warehouseId || (await resolveDefaultWarehouseId());
  const documentNo = input.documentNo?.trim() || (await generateStockDevirDocNo(firmNr, periodNr))
    .replace(/^SDEV-/, 'SDEV-INV-');

  const totals = computeInvoiceTotals(input.lines);
  const desc = [input.notes, 'Açılış faturası benzeri stok devir (slip_kind=invoice)']
    .filter(Boolean)
    .join(' | ');

  // Header
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
    const movRows = await postgrest.post<any[]>(
      paths.movements,
      movementPayload,
      { schema: 'public', prefer: 'return=representation' },
    );
    const mov = Array.isArray(movRows) ? movRows[0] : movRows;
    movementId = String(mov?.id || '');
    if (!movementId) throw new Error('Açılış faturası fişi oluşturulamadı');
  } else {
    const { rows: movIns } = await postgres.query(
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
    movementId = String(movIns[0]?.id || '');
    if (!movementId) throw new Error('Açılış faturası fişi oluşturulamadı');
  }

  // Lines + stok güncellemesi (mevcut quantity davranışıyla aynı: delta ekleme)
  const resultLines: StockOpeningInvoiceLine[] = [];
  for (const ln of input.lines) {
    const qty = Math.max(0, Number(ln.qty) || 0);
    const unit = Math.max(0, Number(ln.unitCostExclVat) || 0);
    const vat = Math.max(0, Number(ln.vatRate) || 0);
    const lineSubtotal = Math.round(qty * unit * 10000) / 10000;
    const lineTotal = Math.round((lineSubtotal * (1 + vat / 100)) * 100) / 100;

    // Stok güncelle: delta ekleme (mevcut hedef stok mantığı). Önce mevcut stoğu çek,
    // yeni miktar = mevcut + qty. purchase_invoice ile simetri (giren stok, +delta).
    const products = await productAPI.getAll();
    const p = products.find((x) => x.id === ln.productId);
    const currentStock = parseFloat(String(p?.stock ?? 0)) || 0;
    const nextStock = Math.max(0, currentStock + qty);
    await productAPI.updateStock(ln.productId, nextStock);

    const itemPayload = (movId: string) => ({
      movement_id: movId,
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
    });

    let itemId = '';
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const itemRows = await postgrest.post<any[]>(
        paths.items,
        itemPayload(movementId),
        { schema: 'public', prefer: 'return=representation' },
      );
      const it = Array.isArray(itemRows) ? itemRows[0] : itemRows;
      itemId = String(it?.id || '');
    } else {
      const { rows: itemIns } = await postgres.query(
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
      itemId = String(itemIns[0]?.id || '');
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
  }

  return {
    documentNo,
    movementId,
    lines: resultLines,
    subtotalExclVat: totals.subtotalExclVat,
    vatTotal: totals.vatTotal,
    grandTotal: totals.grandTotal,
  };
}

/** Açılış faturası benzeri fiş kayıtları (slip_kind='invoice'). */
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
};

export async function listStockOpeningInvoiceRecords(): Promise<StockOpeningInvoiceRecord[]> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const paths = periodPaths(firmNr, periodNr);
  const productsTable = `rex_${normalizeFirmTableNr(firmNr)}_products`;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const movList = await postgrest.get<any[]>(
      paths.movements,
      {
        select: 'id,document_no,movement_date,description,status,trcode,slip_kind',
        slip_kind: 'eq.invoice',
        status: 'neq.cancelled',
        order: 'movement_date.desc',
        limit: '5000',
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    const movs = Array.isArray(movList) ? movList : [];
    if (movs.length === 0) return [];
    const ids = movs.map((m) => String(m.id)).filter(Boolean);
    const items: any[] = [];
    const chunk = 40;
    for (let i = 0; i < ids.length; i += chunk) {
      const part = ids.slice(i, i + chunk).join(',');
      const rows = await postgrest.get<any[]>(
        paths.items,
        {
          select:
            'id,movement_id,product_id,quantity,unit_cost_excl_vat,vat_rate,line_total',
          movement_id: `in.(${part})`,
          limit: '5000',
        },
        { schema: 'public' },
      ).catch(() => [] as any[]);
      if (Array.isArray(rows)) items.push(...rows);
    }
    const productIds = [...new Set(items.map((it) => String(it.product_id)).filter(Boolean))];
    const productMap = new Map<string, { code?: string; name?: string }>();
    for (let i = 0; i < productIds.length; i += chunk) {
      const part = productIds.slice(i, i + chunk).join(',');
      const prows = await postgrest.get<any[]>(
        productsTable,
        { select: 'id,code,name', id: `in.(${part})`, limit: '5000' },
        { schema: 'public' },
      ).catch(() => [] as any[]);
      (Array.isArray(prows) ? prows : []).forEach((p) => {
        productMap.set(String(p.id), { code: p.code, name: p.name });
      });
    }
    const movById = new Map(movs.map((m) => [String(m.id), m]));
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
      } satisfies StockOpeningInvoiceRecord;
    });
  }

  const { rows } = await postgres.query(
    `SELECT sm.id AS movement_id, smi.id AS item_id, sm.document_no, sm.movement_date,
            sm.description, sm.status, smi.product_id, smi.quantity,
            smi.unit_cost_excl_vat, smi.vat_rate, smi.line_total,
            p.code AS product_code, p.name AS product_name
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
  }));
}
