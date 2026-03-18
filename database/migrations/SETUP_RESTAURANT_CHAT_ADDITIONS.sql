-- =============================================================================
-- RESTORAN MODÜLÜ — BU SOHBETTE EKLENEN SQL (Sıfırdan kurulumda çalıştırılacak)
-- =============================================================================
-- Bu dosya, restoran sohbetinde eklenen yeni alanların SQL'ini içerir.
-- Sıfırdan kurulum sırası:
--   1. 000_master_schema.sql  (rest şeması, rest.floors, firma/dönem tabloları)
--   2. 001_demo_data.sql      (isteğe bağlı demo veri)
--   3. 002_rest_return_log.sql veya aşağıdaki blok (iptal/iade raporu tablosu)
-- =============================================================================

-- rest şeması yoksa oluştur (000'da zaten var; güvenlik için)
CREATE SCHEMA IF NOT EXISTS rest;

-- -----------------------------------------------------------------------------
-- İade / iptal raporu için log tablosu (VoidReturnReport, iade sebebi zorunlu)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rest.return_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    return_number   VARCHAR(50) NOT NULL,
    original_receipt VARCHAR(100),
    product_id      UUID,
    product_name    VARCHAR(255) NOT NULL,
    quantity        DECIMAL(15,3) NOT NULL DEFAULT 1,
    unit_price      DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_amount    DECIMAL(15,2) NOT NULL DEFAULT 0,
    return_reason   TEXT NOT NULL,
    staff_name     VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_return_log_created_at ON rest.return_log(created_at);
CREATE INDEX IF NOT EXISTS idx_return_log_reason ON rest.return_log(return_reason);

-- =============================================================================
-- NOT: Aşağıdakiler bu sohbette YENİ KOLON/TABLO olarak eklenmedi, 000'da zaten var:
-- - rest_tables (status, waiter, total, start_time, linked_order_ids, color)
-- - rest_orders, rest_order_items (is_void, void_reason, is_complimentary)
-- - rest_kitchen_orders (sent_at), rest_kitchen_items
-- - getTableStatuses / moveOrderItemToTable sadece mevcut tabloları kullanıyor
-- =============================================================================
