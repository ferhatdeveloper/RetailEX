/**
 * WMS Toplama (pick wave / pick task) servisi — gerçek şema: `wms.pick_waves`, `wms.pick_tasks`.
 * FEFO bin tahsisi `wms.allocate_fefo` ile; sipariş kaynağı dönem `rex_*_sale_items`.
 */
import { postgres, ERP_SETTINGS } from '../postgres';

export interface PickWave {
  id: string;
  wave_no: string;
  status: 'pending' | 'picking' | 'completed' | 'cancelled' | string;
  picker_id?: string;
  order_count: number;
  total_items: number;
  created_at: string;
}

export interface PickTask {
  id: string;
  wave_id: string;
  product_id: string;
  product_name: string;
  location_code: string;
  quantity: number;
  picked_quantity: number;
  status: 'pending' | 'completed';
  lot_no?: string | null;
  expiry_date?: string | null;
}

function firmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim();
}
function padFirm(): string {
  return firmNr().padStart(3, '0');
}
function padPeriod(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0');
}
function saleItemsTable(): string {
  return `rex_${padFirm()}_${padPeriod()}_sale_items`;
}

function mapTaskStatus(dbStatus: string): 'pending' | 'completed' {
  return dbStatus === 'done' || dbStatus === 'completed' ? 'completed' : 'pending';
}

class PickingService {
  /** Firma bazlı toplama dalgaları (gerçek) */
  async listWaves(): Promise<PickWave[]> {
    const { rows } = await postgres.query(
      `SELECT w.id, w.wave_no, w.status, w.total_lines, w.total_qty,
              COALESCE(array_length(w.sales_ids, 1), 0) AS order_count, w.created_at
       FROM wms.pick_waves w
       WHERE w.firm_nr = $1
       ORDER BY w.created_at DESC
       LIMIT 100`,
      [firmNr()]
    );
    return (rows || []).map((r: any) => ({
      id: String(r.id),
      wave_no: r.wave_no,
      status: r.status || 'draft',
      order_count: Number(r.order_count || 0),
      total_items: Number(r.total_lines || 0),
      created_at: r.created_at,
    }));
  }

  /**
   * Satış siparişlerinden (sales id listesi) toplama dalgası oluşturur.
   * Satırlar dönem sale_items'tan ürün bazında toplanır; bin FEFO ile atanır.
   */
  async createWaveFromSales(salesIds: string[]): Promise<string> {
    if (!salesIds?.length) throw new Error('Sipariş seçilmedi');
    const f = firmNr();
    const waveNo = `PW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
    const items = saleItemsTable();

    const { rows: waves } = await postgres.query(
      `INSERT INTO wms.pick_waves (wave_no, firm_nr, status, wave_type, sales_ids)
       VALUES ($1, $2, 'draft', 'sales', $3::uuid[])
       RETURNING id`,
      [waveNo, f, salesIds]
    );
    const waveId = waves[0].id;

    // Ürün bazında topla
    const { rows: agg } = await postgres.query(
      `SELECT product_id, MAX(item_code) AS product_code, MAX(item_name) AS product_name,
              MAX(unit) AS uom, SUM(quantity) AS qty
       FROM ${items}
       WHERE invoice_id = ANY($1::uuid[]) AND product_id IS NOT NULL
       GROUP BY product_id`,
      [salesIds]
    );

    let totalLines = 0;
    let totalQty = 0;
    for (const it of agg) {
      const qty = Number(it.qty || 0);
      if (qty <= 0) continue;
      // FEFO bin önerisi (varsa)
      let binCode: string | null = null;
      let binId: string | null = null;
      let lot: string | null = null;
      let expiry: string | null = null;
      try {
        const { rows: alloc } = await postgres.query(
          `SELECT * FROM wms.allocate_fefo($1, $2::uuid, $3, NULL, 'fefo') LIMIT 1`,
          [f, it.product_id, qty]
        );
        if (alloc?.[0]) {
          binCode = alloc[0].bin_code ?? null;
          binId = alloc[0].bin_id ?? null;
          lot = alloc[0].lot_no ?? null;
          expiry = alloc[0].expiry_date ?? null;
        }
      } catch {
        /* FEFO opsiyonel */
      }
      await postgres.query(
        `INSERT INTO wms.pick_tasks
           (wave_id, product_id, product_code, product_name, bin_code, bin_id, lot_no, expiry_date, qty_to_pick, uom, status, firm_nr)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, 'open', $11)`,
        [waveId, it.product_id, it.product_code, it.product_name, binCode, binId, lot, expiry, qty, it.uom || 'Adet', f]
      );
      totalLines += 1;
      totalQty += qty;
    }

    await postgres.query(
      `UPDATE wms.pick_waves SET total_lines = $2, total_qty = $3, status = 'picking' WHERE id = $1`,
      [waveId, totalLines, totalQty]
    );
    return waveId;
  }

  /** Dalga görevleri — bin sırasına göre (S-Shape) */
  async getOptimizedTasks(waveId: string): Promise<PickTask[]> {
    const { rows } = await postgres.query(
      `SELECT t.id, t.wave_id, t.product_id, t.product_name, t.product_code,
              COALESCE(t.bin_code, '') AS bin_code, t.qty_to_pick, t.qty_picked, t.status,
              t.lot_no, t.expiry_date
       FROM wms.pick_tasks t
       WHERE t.wave_id = $1
       ORDER BY COALESCE(t.bin_code, 'ZZZ') ASC`,
      [waveId]
    );
    return (rows || []).map((r: any) => ({
      id: String(r.id),
      wave_id: String(r.wave_id),
      product_id: String(r.product_id || ''),
      product_name: r.product_name || r.product_code || '—',
      location_code: r.bin_code || '—',
      quantity: Number(r.qty_to_pick || 0),
      picked_quantity: Number(r.qty_picked || 0),
      status: mapTaskStatus(String(r.status || 'open')),
      lot_no: r.lot_no ?? null,
      expiry_date: r.expiry_date ?? null,
    }));
  }

  /** Toplama kaydı — miktar ekler, tamamlanınca 'done' */
  async recordPick(taskId: string, quantity: number): Promise<void> {
    await postgres.query(
      `UPDATE wms.pick_tasks
         SET qty_picked = qty_picked + $1,
             status = CASE WHEN (qty_picked + $1) >= qty_to_pick THEN 'done' ELSE status END,
             updated_at = now()
       WHERE id = $2`,
      [quantity, taskId]
    );
  }

  /** Dalgayı tamamla */
  async completeWave(waveId: string): Promise<void> {
    await postgres.query(
      `UPDATE wms.pick_waves SET status = 'completed', completed_at = now() WHERE id = $1`,
      [waveId]
    );
  }
}

export const pickingService = new PickingService();
