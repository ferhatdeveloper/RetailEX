-- Backoffice: fatura kaydı sonrası otomatik yazdır
-- report_menu_params anahtarı `invoice-auto-print-after-save`
-- Varsayılan: açık (true) → UniversalInvoiceForm kayıt sonrası yazdırır (eski davranış)
-- Kapalı: kayıt biter, yazdırma açılmaz (POS autoPrint ayrı)
-- Kolon migration 153 ile var; yalnızca eksik JSON anahtarını ekler.

UPDATE public.system_settings
SET
  report_menu_params =
    COALESCE(report_menu_params, '{}'::jsonb)
    || jsonb_build_object(
      'invoice-auto-print-after-save', true
    ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND NOT (COALESCE(report_menu_params, '{}'::jsonb) ? 'invoice-auto-print-after-save');

COMMENT ON COLUMN public.system_settings.report_menu_params IS
  'Menü/özellik parametreleri: beauty-*, debt-aging, collection-due, stock-aging, virtual-pbx-caller-id, stock-price-change-slips, product-list-sales-purchase-totals, print-use-windows-printer-service, invoice-auto-print-after-save (varsayılan açık=backoffice fatura kaydı sonrası yazdır), block-negative-stock-sale (varsayılan kapalı=satılabilir), allow-pos-payment-back-to-sale (varsayılan açık=ödeme→satış geri dönüşe izin); daily-report-supplier-payments + daily-report-card-* + period-summary-card-* (varsayılan açık) → boolean.';

NOTIFY pgrst, 'reload schema';
