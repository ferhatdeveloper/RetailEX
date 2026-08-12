import { postgres, ERP_SETTINGS } from './postgres';

export type PosCartAuditEventType = 'item_removed' | 'price_changed' | 'quantity_zero_removed';

export type PosCartAuditPayload = {
  receiptNumber: string;
  sessionId?: string;
  eventType: PosCartAuditEventType;
  productId?: string;
  productName?: string;
  productCode?: string;
  barcode?: string;
  quantity?: number;
  oldPrice?: number;
  newPrice?: number;
  userId?: string;
  userName?: string;
  staffName?: string;
  storeId?: string;
  metadata?: Record<string, unknown>;
};

let tableEnsured = false;

async function ensureAuditTable(): Promise<void> {
  if (tableEnsured) return;
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS public.pos_cart_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firm_nr VARCHAR(20),
      store_id VARCHAR(64),
      receipt_number VARCHAR(64) NOT NULL,
      session_id VARCHAR(64),
      event_type VARCHAR(40) NOT NULL,
      product_id VARCHAR(64),
      product_name TEXT,
      product_code VARCHAR(120),
      barcode VARCHAR(120),
      quantity NUMERIC(18,4),
      old_price NUMERIC(18,4),
      new_price NUMERIC(18,4),
      metadata JSONB DEFAULT '{}',
      user_id VARCHAR(64),
      user_name TEXT,
      staff_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_receipt ON public.pos_cart_audit(receipt_number)
  `);
  await postgres.query(`
    CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_created ON public.pos_cart_audit(created_at DESC)
  `);
  tableEnsured = true;
}

/** Sepet satırı iptali / fiyat değişikliği — fire-and-forget audit kaydı */
export async function logPosCartAudit(payload: PosCartAuditPayload): Promise<void> {
  try {
    await ensureAuditTable();
    const firmNr = ERP_SETTINGS.firmNr != null ? String(ERP_SETTINGS.firmNr) : null;
    await postgres.query(
      `INSERT INTO public.pos_cart_audit (
        firm_nr, store_id, receipt_number, session_id, event_type,
        product_id, product_name, product_code, barcode, quantity,
        old_price, new_price, metadata, user_id, user_name, staff_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)`,
      [
        firmNr,
        payload.storeId || null,
        payload.receiptNumber,
        payload.sessionId || payload.receiptNumber,
        payload.eventType,
        payload.productId || null,
        payload.productName || null,
        payload.productCode || null,
        payload.barcode || null,
        payload.quantity ?? null,
        payload.oldPrice ?? null,
        payload.newPrice ?? null,
        JSON.stringify(payload.metadata || {}),
        payload.userId || null,
        payload.userName || null,
        payload.staffName || null,
      ]
    );
  } catch (err) {
    console.warn('[posCartAudit] kayıt yazılamadı:', err);
  }
}
