# Migration / Kurulum Sırası

## Sıfırdan kurulum (Restoran modülü dahil)

1. **000_master_schema.sql** – Şemalar, rest.floors, firma/dönem init fonksiyonları (rest_tables, rest_orders, rest_order_items, rest_kitchen_orders, rest_kitchen_items vb.)
2. **001_demo_data.sql** – İsteğe bağlı demo veri.
3. **002_rest_return_log.sql** veya **SETUP_RESTAURANT_CHAT_ADDITIONS.sql** – İptal/iade raporu için `rest.return_log` tablosu (VoidReturnReport).
4. **003_user_allowed_firms_periods.sql** – `users` tablosuna `allowed_firm_nrs`, `allowed_periods`, `allowed_store_ids` (JSONB). Kullanıcı kaydı/güncellemesi için gerekli.

Restoran sohbetinde eklenen tek yeni tablo: **rest.return_log**. Diğer özellikler (masa durumu senkronu, taşı/birleştir, ürün etiketi, tek ürün taşıma, Z-raporu, mutfak süresi vb.) mevcut tabloları kullanıyor.
