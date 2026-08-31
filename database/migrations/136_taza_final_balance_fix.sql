-- =====================================================================
-- RetailEX migration #136 — TED-002 (TAZA) KALICI BAKİE DÜZELTMESİ
-- Tarih         : 2026-08-29
-- Veritabanı    : kasap (PG 15+)
-- Tetikleyen    : Migration 134 + 135 çalıştırıldı, ancak sync_queue'daki
--                 eski event apply_sync_queue_item tarafından işlenerek
--                 TED-002 bakiyesi 8,351,496.25'ten 7,409,913.75'e revert
--                 edildi. Migration 134 sync_apply bypass'ı kullanmadığı
--                 için trigger eski (pre-update) state'i sync_queue'ya
--                 kuyruğa almadı; ama var olan pending event
--                 (2a32e1be-293d-41e7-9647-34d769f4e889) zaten 7,409,913.75
--                 ile kuyruklanmıştı ve sync engine bunu uyguladı.
--
-- Kök neden:
--   - Migration 134 ve 135 doğrudan PG'ye psql ile uygulandı (DeskApp
--     sync engine'den geçmedi). Bu yüzden sync_queue'daki stale event,
--     migration sonrası sync engine tarafından işlenip revert etti.
--   - Stale event hala pending (a9dbdcea-2e44-447d-a1f6-fdbd7f30baf4)
--     — 19:27:31'de tetiklenen yeni revert işlemi.
--
-- Bu migration:
--   1. TED-002 için TÜM pending sync event'leri siler (kalıcı revert engeli)
--   2. TED-002 bakiyesini 8,351,496.25'e günceller (trigger bypass'lı)
--   3. notes alanına kalıcı audit mesajı ekler
--   4. schema_migrations'a 134/135/136 kayıtlarını ekler (idempotent)
-- =====================================================================

BEGIN;

-- -----------------------------------------------------------------
-- 0. Trigger'ı bypass et (sync queue'ya yazma, BEFORE updated_at da)
-- -----------------------------------------------------------------
SET LOCAL session_replication_role = replica;
SET LOCAL retailex.sync_apply = '1';

-- -----------------------------------------------------------------
-- 1. TED-002 için bekleyen sync_queue event'lerini SİL
--    (kalıcı revert kaynağı — sync engine bunları uygulayamaz)
-- -----------------------------------------------------------------
DELETE FROM sync_queue
WHERE record_id = '5bb0a60b-feec-449a-94f4-baa07d42e867'
  AND status = 'pending';

-- -----------------------------------------------------------------
-- 2. TED-002 bakiyesini kalıcı hedefe sabitle: 8,351,496.25 IQD
--    Idempotent: sadece 7,409,913.75 veya 6,293,803.75 ise güncelle
--    (eğer başka bir merge yapıldıysa manuel kontrol gerekir)
-- -----------------------------------------------------------------
UPDATE rex_001_suppliers
   SET balance    = 8351496.25,
       notes      = COALESCE(notes, '') ||
                    E'\n[2026-08-29 22:00] Migration 136 kalıcı düzeltme: '
                    || E'bakiye 8,351,496.25 IQD\'e sabitlendi. '
                    || E'Sync queue stale event\'leri silindi. '
                    || E'(134 + 135 + 131 birleşik etki).',
       updated_at = NOW()
 WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867'
   AND balance IN (7409913.75, 6293803.75, 8351496.25);

-- -----------------------------------------------------------------
-- 3. schema_migrations kayıtları (134 + 135 + 136 — idempotent)
-- -----------------------------------------------------------------
INSERT INTO public.schema_migrations (filename, applied_at)
VALUES
    ('134_taza_full_merge.sql', NOW()),
    ('135_taza_merge_replay.sql', NOW()),
    ('136_taza_final_balance_fix.sql', NOW())
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- =====================================================================
-- DOĞRULAMA (psql ayrı çalıştırılabilir)
-- =====================================================================
-- SELECT id, balance, updated_at FROM rex_001_suppliers
--   WHERE id = '5bb0a60b-feec-449a-94f4-baa07d42e867';
-- -- Beklenen: balance = 8,351,496.25
--
-- SELECT id, status, data->>'balance' AS bal
--   FROM sync_queue
--  WHERE record_id = '5bb0a60b-feec-449a-94f4-baa07d42e867';
-- -- Beklenen: sadece completed event'ler (pending olmamalı)
--
-- SELECT filename FROM schema_migrations
--  WHERE filename IN ('134_taza_full_merge.sql',
--                     '135_taza_merge_replay.sql',
--                     '136_taza_final_balance_fix.sql')
--  ORDER BY filename;
-- -- Beklenen: 3 satır
