# Migration / Kurulum Sırası

## Sıfırdan kurulum (Restoran modülü dahil)

1. **000_master_schema.sql** – Şemalar, rest.floors, firma/dönem init fonksiyonları (rest_tables, rest_orders, rest_order_items, rest_kitchen_orders, rest_kitchen_items vb.)
2. **001_demo_data.sql** – İsteğe bağlı demo veri.
3. **002_rest_return_log.sql** veya **SETUP_RESTAURANT_CHAT_ADDITIONS.sql** – İptal/iade raporu için `rest.return_log` tablosu (VoidReturnReport).
4. **003_user_allowed_firms_periods.sql** – `users` tablosuna `allowed_firm_nrs`, `allowed_periods`, `allowed_store_ids` (JSONB). Kullanıcı kaydı/güncellemesi için gerekli.
5. **004_roles_landing_route.sql** – `roles` tablosuna `landing_route` (giriş sonrası yönlendirme); garson rolü ve restoran yönlendirmesi.
6. **006_supabase_firm_and_product_cdn.sql** – `firms.supabase_firm_id` ve ürün CDN alanları (yalnızca 000’da ALTER yoksa gerekir; 000 güncel sürümde `ALTER TABLE firms ADD COLUMN IF NOT EXISTS supabase_firm_id` içerir).
7. **007_postgrest_anon_role.sql** – PostgREST için `anon` rolü ve şema izinleri (PostgREST kullanacaksanız çalıştırın; ayrıntı: `database/README_POSTGREST.md`).
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

**Mevcut veritabanı:** `config.db` (DeskApp ayarları) ile bekleyen migration’ları uygulamak için proje kökünde `npm run db:migrate` (ayrıntı: `.cursor/rules/database-migrate-config-db.mdc`).

Restoran sohbetinde eklenen tek yeni tablo: **rest.return_log**. Diğer özellikler (masa durumu senkronu, taşı/birleştir, ürün etiketi, tek ürün taşıma, Z-raporu, mutfak süresi vb.) mevcut tabloları kullanıyor.
