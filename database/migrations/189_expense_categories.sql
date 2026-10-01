-- ============================================================================
-- Migration 189: Gider Kategorileri Tanımları (expense_categories)
-- ----------------------------------------------------------------------------
-- Amaç:
--   Gider kayıtlarında kullanılan `category` kolonu VARCHAR(50) serbest metin
--   olarak duruyor (sabit list EXPENSE_CATEGORIES frontend tarafında).
--   Bu tablo artık kullanıcı tanımlı kategorileri tutar; modal/filtre/dropdown
--   bu tablodan beslenir.
--
-- Yapı:
--   public.expense_categories (id, code, name, color, sort_order, is_active,
--     description, firm_nr VARCHAR(10), created_at, updated_at)
--     UNIQUE(code, firm_nr)
--   master: 000_master_schema.sql CREATE_FIRM_TABLES ile firm kurulumunda
--     otomatik 8 default kategori seed'lenir.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.expense_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_nr     VARCHAR(10) NOT NULL,
    code        VARCHAR(50) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    color       VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-700',
    description TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 100,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, firm_nr)
);

CREATE INDEX IF NOT EXISTS expense_categories_firm_idx
    ON public.expense_categories (firm_nr, is_active, sort_order);

COMMENT ON TABLE public.expense_categories IS
    'Gider kategorileri tanımları (firma başına). Frontend CRUD + dropdown besleme kaynağı.';