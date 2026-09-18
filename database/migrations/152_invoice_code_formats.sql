-- Fatura kod formatı app_settings içinde key='invoice_code_formats' ile tutulur (yeni tablo yok).
-- value (JSONB) örnek:
-- {
--   "default": { "pattern": "FTR-{YYYY}-{SEQ:6}" },
--   "byType": { "7": { "pattern": "PS-{YYYY}-{SEQ:6}" } }
-- }
-- Boş pattern: mevcut YYYYMMDD + rastgele damga (UniversalInvoiceForm varsayılanı).
-- Tauri: DO $$ yok.

COMMENT ON TABLE app_settings IS 'Uygulama ayarları; key+firm_nr ile benzersiz. receipt_settings: fiş logosu ve firma bilgisi. invoice_code_formats: fatura kod formatı (default.pattern, byType.{trcode}.pattern). Boş pattern = YYYYMMDD+rastgele damga.';
