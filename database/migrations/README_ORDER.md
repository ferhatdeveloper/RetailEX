# Migration / Kurulum Sırası

## Sıfırdan kurulum (Restoran modülü dahil)

1. **000_master_schema.sql** – Şemalar, rest.floors, firma/dönem init fonksiyonları (rest_tables, rest_orders, rest_order_items, rest_kitchen_orders, rest_kitchen_items vb.)
2. **001_demo_data.sql** – İsteğe bağlı demo veri.
3. **002_rest_return_log.sql** veya **SETUP_RESTAURANT_CHAT_ADDITIONS.sql** – İptal/iade raporu için `rest.return_log` tablosu (VoidReturnReport).
4. **003_user_allowed_firms_periods.sql** – `users` tablosuna `allowed_firm_nrs`, `allowed_periods`, `allowed_store_ids` (JSONB). Kullanıcı kaydı/güncellemesi için gerekli.
5. **004_roles_landing_route.sql** – `roles` tablosuna `landing_route` (giriş sonrası yönlendirme); garson rolü ve restoran yönlendirmesi.
6. **006_supabase_firm_and_product_cdn.sql** – `firms.supabase_firm_id` ve ürün CDN alanları (yalnızca 000’da ALTER yoksa gerekir; 000 güncel sürümde `ALTER TABLE firms ADD COLUMN IF NOT EXISTS supabase_firm_id` içerir).
7. **007_postgrest_anon_role.sql** – PostgREST için `anon` rolü ve şema izinleri (PostgREST kullanacaksanız çalıştırın; ayrıntı: `database/README_POSTGREST.md`).
7b. **008_postgrest_verify_login_rpc.sql** – PostgREST RPC: `logic.verify_login()` fonksiyonu (PostgREST ile login doğrulaması).
8. **009_firms_regulatory_region.sql** – `firms.regulatory_region` (TR/IQ; e-belge mevzuatı).
9. **010_system_settings.sql** – `system_settings` (web açılış: varsayılan para, birincil firma/dönem).
10. **011_gib_edocument_queue.sql** – `gib_edocument_queue` (E-Dönüşüm kuyruğu; GİB mock test).
11. **012_firms_gib_columns.sql** – `firms` GİB / entegratör alanları (TR firma kartı).
12. **013_gib_mode_nilvera_qnb_comments.sql** – `firms.gib_*` sütun açıklamaları (Nilvera / QNB modları).
13. **014_rest_orders_order_discount_pct.sql** – `rest_orders` (firma/dönem tabloları) için `order_discount_pct` — masa POS sipariş indirimi ön fiş / senkron sonrası kalıcı.
14. **017_beauty_satisfaction_surveys.sql** – Beauty memnuniyet anketleri (`beauty_satisfaction_surveys`, `beauty_satisfaction_questions`, çok dilli `labels_json`) ve dönem `beauty_customer_feedback` için `survey_id`, `survey_answers`.
15. **018_beauty_clinic_operations.sql** – Klinik genişletme: şube/oda, portal ayarları, kurumsal hesap, onam şablonları, üyelik, sarf tanımı, sağlık profili, parti/SKT, kampanya, entegrasyon; dönem: bekleme listesi, online randevu talepleri, bildirim kuyruğu, onam kayıtları, SOAP notları, hasta fotoğrafları, üyelik aboneliği, denetim logu, sarf kullanım logu; randevu kolonları (`branch_id`, `tele_meeting_url`, `booking_channel`, vb.).
16. **019_beauty_portal_messaging.sql** – `beauty_portal_settings`: Atak SMS (`sms_user`, `sms_password`, `sms_sender`) ve WhatsApp Evolution/Meta (`whatsapp_*`, `default_reminder_channel`).
17. **026_beauty_appointment_treatment_degree_shots.sql** – `beauty_appointments`: tedavi **derece** ve **atış** (`treatment_degree`, `treatment_shots`); takvim sağ paneli ve POS fişi ile senkron.
18. **027_beauty_appointment_clinical_data.sql** – `beauty_appointments.clinical_data` (JSONB): diş FDI, fizik bölge, gebelik haftası, diyet hedefi vb. klinik taslakların kalıcı kaydı.
19. **028_beauty_portal_allow_staff_slot_overlap.sql** – `beauty_portal_settings.allow_staff_slot_overlap`: aynı personele aynı saatte birden fazla randevu / işlem (iç POS slot kontrolü).
20. **029_rex_customers_gender_customer_tier.sql** – `rex_*_customers`: `gender` (female/male/other), `customer_tier` (`normal` / `vip`).
21. **031_rex_customers_heard_from.sql** – `rex_*_customers`: `heard_from` (müşteri edinim kaynağı / "Bizi nereden duydunuz?").
22. **032_beauty_specialist_product_unit_commission.sql** – `beauty_specialists.product_unit_commission`: ürün satışında personel için adet başı sabit prim tutarı.
23. **033_beauty_service_follow_up_reminder_days.sql** – `beauty_services.follow_up_reminder_days`: tamamlanan randevudan X gün sonra hatırlatma (Hizmet & tarih panosu + giriş toast).
24. **034_beauty_service_parent_category.sql** – `beauty_services.parent_category`: ana kategori; `category` alt kategori (Hizmet tanımları + POS hiyerarşik filtre).
25. **035_rex_products_follow_up_reminder_days.sql** – `rex_*_products.follow_up_reminder_days`: seçilen ürünlerde tamamlanan randevu + sarf loguna göre güzellik takip hatırlatması.
26. **036_rex_tax_rates_special_codes.sql** – `rex_{firm}_tax_rates` ve `rex_{firm}_special_codes` tabloları (PostgREST / masterData.ts API uyumu).
27. **037_beauty_follow_up_reminder_actions.sql** – `beauty.rex_{firm}_follow_up_reminder_actions`: takip hatırlatması notu, durum (ertelendi/görüşüldü/kapat), erteleme tarihi (Hizmet & tarih panosu).
28. **038_anket_role.sql** – `anket` sistem rolü: yalnızca `beauty.surveys` READ + EXECUTE; giriş sonrası `beauty` modülü.
29. **039_beauty_default_satisfaction_survey.sql** – Güzellik merkezi varsayılan memnuniyet anketi (TR/EN/AR/KU, 7 soru, aktif).
30. **040_beauty_satisfaction_survey_expand.sql** – Aynı ankete genişletilmiş soru seti (personel, işlem, ortam, fiyat; toplam ~24 soru).
31. **041_beauty_follow_up_reminder_actions_ensure.sql** – Eksik `beauty.rex_{firm}_follow_up_reminder_actions` tablolarını oluşturur (037 atlanmış veya boş döngüyle işaretlenmiş ortamlar için).
32. **042_messaging_whatsapp_queue.sql** – `rex_{firm}_messaging_settings` (WhatsApp/SMS ayarları) ve `rex_{firm}_{period}_notification_queue` (fatura/randevu bildirim kuyruğu).
33. **043_messaging_meta_templates.sql** – `messaging_settings`: Meta Cloud API onaylı şablon adı/dili (`meta_invoice_*`, `meta_appointment_*`).
34. **044_messaging_postgrest_sync.sql** – Eksik `messaging_settings` / `notification_queue` tablolarını oluşturur, `anon` yetkisi ve `NOTIFY pgrst` (API 404 düzeltmesi).
35. **045_stores_scale_bridge.sql** – `stores.scale_bridge_url` / `scale_bridge_token` (mağaza PC terazi köprüsü).
36. **046_sales_logo_sync_meta.sql** – `rex_*_*_sales.logo_sync_error`, `logo_sync_date` (Logo REST fatura aktarımı).
37. **047_rex_products_is_scale_product.sql** – `rex_*_products.is_scale_product` (tartı ürünü / terazi PLU aktarımı).
38. **048_hybrid_sync_apply.sql** – Hibrit PG senkronu: `apply_sync_queue_item`, `resolve_table_schema`, `enqueue_sync_event` döngü koruması.
39. **049_hybrid_sync_branch_scope.sql** – `sync_queue` şube/kasiyer kapsamı (`source_store_id`, `source_user_id`, `terminal_name`).
40. **050_beauty_follow_up_show_natural_when_postponed.sql** – Güzellik takip hatırlatması: ertelenince orijinal vade tarihinde isteğe bağlı gösterim (`show_natural_when_postponed`).
41. **051_system_health_sync_logs.sql** – `sync_logs`, `upsert_service_health()`, `cleanup_stale_services()` (Entegrasyonlar sistem sağlığı paneli).
42. **052_pos_cart_audit.sql** – POS sepet satır iptali ve fiyat değişikliği audit kayıtları (`pos_cart_audit`).
43. **053_rex_products_expiry_tracking.sql** – `rex_*_products`: `expiry_date`, `expiry_tracking`, `shelf_life_days` (SKT / raf ömrü).
44. **056_rex_customers_call_plan.sql** – `rex_*_customers`: haftalık müşteri arama planı, çoklu gün seçimi (`call_plan_weekdays`).
45. **057_rex_customers_call_plan_status.sql** – `rex_*_customers`: arama planı notu ve son durum (`call_plan_note`, `call_last_*`).
46. **058_sale_items_expiry_batch.sql** – `rex_*_*_sale_items`: alış faturası satır SKT/parti bilgisi (`expiry_date`, `batch_no`) ve SKT raporu indeksi.
47. **059_init_production_tables.sql** – mevcut firmalar için üretim reçete/emir tablolarını oluşturur (`INIT_PRODUCTION_TABLES`).
48. **060_ensure_create_firm_period_engine.sql** – `CREATE_FIRM_TABLES` / `CREATE_PERIOD_TABLES` fonksiyonlarını kurar (firma kurulum sihirbazı; 000 atlanmış eski DB'ler).
49. **061_rex_customers_suppliers_ref_id.sql** – Logo CLCARD senkronu: `rex_*_customers` / `suppliers` tablolarına `ref_id` (LOGICALREF).
50. **062_hybrid_sync_backfill.sql** – Hibrit: yerelde olup kuyruğa düşmemiş kayıtları `sync_queue`'ya ekleme (`enqueue_hybrid_backfill`) ve tükenmiş denemeleri sıfırlama.
51. **063_pos_terminal_registrations.sql** – Masaüstü kasa cihaz kaydı (`pos_terminal_registrations`), merkez web onayı, `register_pos_terminal` / `approve_pos_terminal` RPC.
52. **064_pos_terminal_device_info.sql** – Cihaz kaydı: bilgisayar adı, OS, IP, saat dilimi; `register_pos_terminal` metadata (JSONB) desteği.
53. **065_sync_queue_target_store_index.sql** – `sync_queue` inbound (merkez→kasa) indeksleri: `target_store_id`, `terminal_name`.
54. **066_terminal_sync_log_pos_quick_slots.sql** – MPOS `terminal_sync_log` (gönder/al geçmişi) ve `pos_quick_slots` (PLU/kısayol tuş).
55. **067_apply_sync_queue_item_result.sql** – `apply_sync_queue_item` insert/update/skip/delete sonucu döndürür (tekrarlı kayıt raporu).
56. **068_approve_pos_terminal_placement.sql** – Cihaz onayında işyeri (`store_id`) ve kasa (`terminal_name`) yerleştirmesi; `get_pos_terminal_status` store_id döndürür.
57. **069_register_pos_terminal_single_overload.sql** – PostgREST PGRST203: eski 8 parametreli `register_pos_terminal` kaldırılır.
58. **070_get_pos_terminal_status_text_cast.sql** – PostgREST 42804: `get_pos_terminal_status` dönüş kolonları TEXT cast.
59. **071_apply_sync_queue_item_normalize.sql** – Hibrit sync: NOT NULL varsayılan normalize (`expiry_tracking` vb.), müşteri/tedarikçi `code` çakışması birleştirme.
60. **072_firm_002_bootstrap.sql** – Firma 002, dönem 01, BAGHDAD mağazası ve `rex_002_*` tabloları (idempotent).
61. **073_apply_sync_queue_item_record_id.sql** – Sync JSON'da `id` yoksa `record_id` birleştirilir.
62. **074_provision_firm_schema_rpc.sql** – PostgREST RPC: yerel/merkez firma metadata + `rex_*` tabloları otomatik.
63. **075_tenant_websocket_hub.sql** – Kiracı WebSocket hub: `broadcast_messages`, `broadcast_delivery_queue`, `store_devices` (`api.retailex.app/{kiracı}/ws` + `/sync`).
64. **076_invoice_sales_header_fields.sql** – Dönem `sales` tablolarına `header_fields` JSONB (fatura formu başlık alanları listesi için).
66. **079_ensure_apply_sync_triggers.sql** – `enqueue_sync_event`, `apply_sync_triggers`, `try_apply_sync_triggers` (create_firm_tables 42883 düzeltmesi).
67. **081_fix_apply_sync_triggers_recursion.sql** – `APPLY_SYNC_TRIGGERS`/`apply_sync_triggers` isim cakismasi (54001 sonsuz dongu) duzeltmesi.
68. **082_wms_transfers_firm_nr_columns.sql** – `wms.transfers`: `firm_nr`, `source_store_id`/`target_store_id` (eski `from_store_id`/`to_store_id` yeniden adlandırma).
69. **083_hybrid_device_sync_log.sql** – Cihaz bazlı `device_sync_transfer_log`, `device_sync_cursor`; artımlı `enqueue_hybrid_backfill(..., p_changed_since)`.
70. **084_price_change_device_ack.sql** – `price_change_log` (eski/yeni fiyat diff), `device_price_ack` (A aldı / B almadı), `rex_*_products` trigger.
71. **085_device_sync_ack.sql** – Merkez `device_sync_ack`: cihaz alım/gönderim oturumu, fiyatlı ürün sayısı, bekleyen fiyat; alım sonrası otomatik bildirim.
72. **086_store_devices_ws_presence.sql** – `store_devices` PostgREST erişimi; WS heartbeat ile merkezde canlı cihaz (yedek: 24s aktivite).
73. **087_disassembly_carcass_breakdown.sql** – Kasap karkas parçalama: `disassembly_templates`, `disassembly_orders`, fire maliyet dağıtımı (`INIT_DISASSEMBLY_TABLES`).
74. **088_sync_queue_postgrest_anon.sql** – Merkez PostgREST: `sync_queue` anon SELECT/INSERT/UPDATE + `NOTIFY pgrst` (hibrit kuyruk önizlemesi).
75. **090_logo_mssql_sync_columns.sql** – Logo MSSQL: dönem `sales`/`sale_items`/`cash_lines` `ref_id`, `account_movements` (CLFLINE), güncel `CREATE_PERIOD_TABLES`.
76. **091_sync_incremental_dedup.sql** – Artımlı senkron: `prune_redundant_sync_queue`, tetikleyici tekrar kuyruk engeli, `apply_sync_queue_item` değişmeyen satırda `skip`.
77. **092_customer_call_plan_weekly.sql** – Müşteri arama planı haftalık arşivi (`customer_call_plan_weekly`) ve hafta başı sıfırlama (`customer_call_plan_rollover`).
78. **093_eticaret_settings.sql** – `system_settings.eticaret_settings` (online satış tema / demo kiracı JSONB).
79. **094_eticaret_web_orders.sql** – `eticaret_web_orders` tablosu; `eticaret_submit_web_order` RPC (demo kapalıyken trcode 20 sipariş fişi).
80. **095_eticaret_catalog_firm.sql** – Online vitrin firma seçimi: `eticaret_settings.catalogFirmNr` ve `payload.firm_nr` ile katalog/sipariş fişi firması.
81. **096_stock_movements_ref_id.sql** – Stok hareketleri (`stock_movements` / `stock_movement_items`) Logo `ref_id` kolonu ve tekrarsız içe aktarım indeksleri.
82. **097_fix_verify_login_param_shadowing.sql** – `logic.verify_login` parametre gölgeleme düzeltmesi (firma filtresi + güvenli giriş RPC).
83. **098_sale_items_item_type.sql** – `sale_items.item_type` (Malzeme / Hizmet / Promosyon / İndirim).
84. **099_system_settings_menu_preferences.sql** – `system_settings.menu_preferences` (statik menü gizleme/sıra JSONB).
85. **100_butcher_production.sql** – Kasap üretim: `butcher_settings`, `butcher_recipes`, `butcher_recipe_outputs`, `butcher_orders`, `butcher_order_outputs` (`INIT_BUTCHER_PRODUCTION_TABLES`).
86. **101_butcher_purchase_invoice.sql** – Üretim fişine bağlı alış faturası: `purchase_invoice_id` / `purchase_invoice_no`, `supplier_id` / `supplier_name` (`INIT_BUTCHER_PRODUCTION_TABLES` + ALTER).
87. **102_butcher_recipe_code.sql** – Kasap reçetesine `code` (üretim / reçete kodu) + benzersiz indeks; `INIT_BUTCHER_PRODUCTION_TABLES` güncellemesi.
88. **103_butcher_allow_without_stock.sql** – Kasap ayarı `allow_complete_without_stock` (alışsız / yetersiz stokla üretim tamamlanabilir; varsayılan true).
89. **104_rex_products_plu_code.sql** – Ürün kartı `plu_code` (terazi PLU numarası; tüm `rex_*_products`).
90. **105_logistics_delivery.sql** – Teslimat Yönetim: `logistics` şeması (araç, kurye, plan, deliveries/lines, POD, iade, bildirim); `wms.pick_tasks` + `pick_waves.delivery_id`; `sale_items.qty_shipped` / `qty_delivered`.
91. **106_wms_enterprise.sql** – WMS kurumsal katman: `wms.bin_inventory` (bin+lot+SKT bazlı stok), `putaway_tasks`, `packing_slips`/`cartons`/`carton_lines`, `stock_adjustments` (fire), `cross_dock_links`, `logo_sync_outbox`; `bins` hiyerarşi (rack/bin_type/barcode/firm_nr); receiving/dispatch/pick/transfer/counting lot-SKT-bin + Logo senkron kolonları; `wms.allocate_fefo` (FEFO/FIFO) ve `wms.upsert_bin_inventory` fonksiyonları.
92. **107_cash_lines_store_id.sql** – Dönem `cash_lines` tablolarına çok mağazalı filtre için `store_id` kolonu ve indeks.
93. **108_kitchen_print_jobs.sql** – Restoran mutfak yazıcı servis kuyruğu: dönem bazlı `kitchen_print_jobs` tabloları + pending/failed indeks.
94. **109_unified_print_jobs.sql** – RetailEX_Printer birleşik yazıcı kuyruğu: dönem bazlı `print_jobs` tabloları, job type/payload alanları ve eski `kitchen_print_jobs.job_type`.
95. **110_print_design_bindings.sql** – Sistem → Yazdırma Seçenekleri: belge türü bazında FastReport `.frx`, Dizayn Merkezi veya yerleşik yazdırma eşleştirmeleri (`public.print_design_bindings`).

**099 tüm kiracılara (tek dosya):**
```bash
PGHOST=... PGUSER=postgres PGPASSWORD='...' bash database/scripts/apply-099-all-retail-tenants.sh
```
VPS: `npm run db:migrate:tenants` veya GitHub Actions → **Migrate tenant databases**.

**Kiracılara toplu uygulama (VPS / uzak PG):**
- `npm run db:migrate:tenants` — tüm RetailEX kiracı DB'ler (`ilsasupport`, `pagetin_kurye`, `siti_pdks` **hariç** — bkz. `.cursor/rules/database-non-retailex-exclude.mdc`)
- `bash database/scripts/apply-065-all-retail-tenants.sh` — yalnızca 065 (tenant_registry listesi)
- GitHub Actions: **Migrate tenant databases** (`migrate-tenants-db.yml`) — VPS SSH ile `berqenas-repo-pull-and-migrate.sh`

**Mevcut veritabanı:** `config.db` (DeskApp ayarları) ile bekleyen migration’ları uygulamak için proje kökünde `npm run db:migrate` (ayrıntı: `.cursor/rules/database-migrate-config-db.mdc`).

Restoran sohbetinde eklenen tek yeni tablo: **rest.return_log**. Diğer özellikler (masa durumu senkronu, taşı/birleştir, ürün etiketi, tek ürün taşıma, Z-raporu, mutfak süresi vb.) mevcut tabloları kullanıyor.
