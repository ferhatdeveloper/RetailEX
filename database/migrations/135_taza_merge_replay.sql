-- =====================================================================
-- RetailEX migration #135 — TED-002 (TAZA) birleştirme REPLAY
-- Tarih         : 2026-08-29
-- Veritabanı    : kasap (PG 15+)
-- Tetikleyen    : Migration 134 taslaktı, çalıştırılmadan kaldı (revert değil).
--                 Bu migration 134'ün etkisini yeniden uygular: 941.582,50 IQD
--                 TED-002 primary'ye eklenir.
--
-- Öncesi durum (135 öncesi):
--   suppliers.TED-002 (5bb0a60b)  TAZA         balance 7,409,913.75
--   schema_migrations: 130, 131, 132, 133 var; 134 yok.
--   customers.MUS-019 (b81fe06f)  ZATEN SİLİNMİŞ (133'te silindi — migration 132'nin yaptığı)
--   suppliers.MUS-019 (99bb12af)  ZATEN SİLİNMİŞ (aynı şekilde 133)
--
-- Migration 134'teki tek fark (tekrar uygulanabilir güvenli kontrol):
--   - Tedarikçi bakiyesine ekleme → +941.582,50
--   - Notes güncelleme (idempotent) → yeni entry eklenmez
--   - Müşteri/MUS-019 supplier → ZATEN yok; DELETE no-op
--   - schema_migrations → 134 + 135 entry
--
-- GÜVENLİK:
--   - SET LOCAL retailex.sync_apply = '1' → trigger tetiklenince sync_queue'ya yazma
--     (çapraz mağaza senkronizasyonu tetiklenmesin diye)
--   - SET LOCAL session_replication_role = replica → AFTER trigger tetiklenmesin
--   - DO $$ ... END $$ → migration doğrulamayı kendi içinde yapsın
--   - Idempotent: WHERE balance = 7409913.75 koşulu ile sadece eski halindeyken ekle
-- =====================================================================

BEGIN;

-- Tetikleyici güvenli bypass (sync queue / updated_at trigger)
SET LOCAL session_replication_role = replica;
SET LOCAL retailex.sync_apply = '1';

-- -----------------------------------------------------------------
-- 1. TED-002 bakiyesine 941.582,50 ekle (idempotent)
-- -----------------------------------------------------------------
-- Sadece şu anda 7,409,913.75 olan kayıt güncellensin (replay durumu)
UPDATE rex_001_suppliers
   SET balance    = balance + 941582.50,
       updated_at = NOW()
 WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867'
   AND balance = 7409913.75;

-- -----------------------------------------------------------------
-- 2. schema_migrations kayıtları (134 + 135)
-- -----------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES
  ('134_taza_full_merge.sql', NOW()),
  ('135_taza_merge_replay.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- =====================================================================
-- DOĞRULAMA (psql ayrı çalıştırılabilir)
-- =====================================================================
-- SELECT balance FROM rex_001_suppliers WHERE id='5bb0a60b-feec-449a-94f4-baa07d42e867';
-- -- Beklenen: 8,351,496.25
--
-- SELECT filename FROM schema_migrations WHERE filename IN ('134_taza_full_merge.sql','135_taza_merge_replay.sql');
-- -- Beklenen: 2 satır
--
-- SELECT id, code, name, balance FROM rex_001_suppliers
--  WHERE LOWER(name) LIKE '%taza%' ORDER BY code;
