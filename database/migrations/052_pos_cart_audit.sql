-- POS sepet audit: satır iptali, fiyat değişikliği (ödeme öncesi)

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
);

CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_receipt ON public.pos_cart_audit(receipt_number);
CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_created ON public.pos_cart_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_cart_audit_firm_created ON public.pos_cart_audit(firm_nr, created_at DESC);
