-- =============================================================================
-- Enterprise Master Tables (Logo-style Architecture)
-- =============================================================================

-- 1. FIRMS (Firmalar)
CREATE TABLE IF NOT EXISTS "public"."ROS_CAPIFIRM" (
    "logicalref" SERIAL PRIMARY KEY,
    "nr" smallint NOT NULL UNIQUE,  -- e.g., 1, 2, ...
    "name" varchar(100) NOT NULL,
    "title" varchar(200),
    "street" varchar(200),
    "door_nr" varchar(20),
    "district" varchar(50),
    "city" varchar(50),
    "country" varchar(50),
    "tax_nr" varchar(20),
    "tax_office" varchar(50),
    "phone1" varchar(20),
    "email" varchar(100),
    "created_on" timestamp DEFAULT now(),
    "active" boolean DEFAULT true
);

-- 2. PERIODS (DÃ¶nemler)
CREATE TABLE IF NOT EXISTS "public"."ROS_CAPIPERIOD" (
    "logicalref" SERIAL PRIMARY KEY,
    "firm_id" integer REFERENCES "public"."ROS_CAPIFIRM"("logicalref") ON DELETE CASCADE,
    "nr" smallint NOT NULL, -- e.g., 1, 2 (Period number within firm)
    "beg_date" date NOT NULL,
    "end_date" date NOT NULL,
    "active" boolean DEFAULT true,
    "key_string" varchar(20) GENERATED ALWAYS AS (
        'ROS_' || to_char("firm_id", 'FM000') || '_' || to_char("nr", 'FM00')
    ) STORED, -- Computed key for dynamic tables e.g. ROS_001_01
    UNIQUE("firm_id", "nr")
);

-- 3. BRANCHES (Åubeler)
CREATE TABLE IF NOT EXISTS "public"."ROS_CAPIBRANCH" (
    "logicalref" SERIAL PRIMARY KEY,
    "firm_id" integer REFERENCES "public"."ROS_CAPIFIRM"("logicalref") ON DELETE CASCADE,
    "nr" smallint NOT NULL, -- e.g., 0, 1
    "name" varchar(100) NOT NULL,
    "active" boolean DEFAULT true,
    UNIQUE("firm_id", "nr")
);

-- 4. WAREHOUSES (Ambarlar)
CREATE TABLE IF NOT EXISTS "public"."ROS_CAPIWHOUSE" (
    "logicalref" SERIAL PRIMARY KEY,
    "firm_id" integer REFERENCES "public"."ROS_CAPIFIRM"("logicalref") ON DELETE CASCADE,
    "branch_id" integer REFERENCES "public"."ROS_CAPIBRANCH"("logicalref") ON DELETE SET NULL,
    "nr" smallint NOT NULL, -- e.g., 0, 1
    "name" varchar(100) NOT NULL,
    "cost_method" smallint DEFAULT 0, -- 0: FIFO, 1: LIFO, 2: Average
    "active" boolean DEFAULT true,
    UNIQUE("firm_id", "nr")
);

-- Indexing
CREATE INDEX IF NOT EXISTS "idx_ros_capifirm_nr" ON "public"."ROS_CAPIFIRM" ("nr");
CREATE INDEX IF NOT EXISTS "idx_ros_capiperiod_firm" ON "public"."ROS_CAPIPERIOD" ("firm_id");
CREATE INDEX IF NOT EXISTS "idx_ros_capibranch_firm" ON "public"."ROS_CAPIBRANCH" ("firm_id");

-- =============================================================================
-- Dynamic Table Generation Logic
-- =============================================================================

-- Function to create period-specific tables (Accounting Tables)
CREATE OR REPLACE FUNCTION create_period_tables(period_id integer)
RETURNS void AS $$
DECLARE
    v_firm_nr text;
    v_period_nr text;
    v_table_prefix text;
BEGIN
    -- Get prefix details (e.g. 001_01)
    SELECT 
        to_char(f.nr, 'FM000'), 
        to_char(p.nr, 'FM00')
    INTO v_firm_nr, v_period_nr
    FROM "public"."ROS_CAPIPERIOD" p
    JOIN "public"."ROS_CAPIFIRM" f ON f.logicalref = p.firm_id
    WHERE p.logicalref = period_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Period not found';
    END IF;

    v_table_prefix := 'ROS_' || v_firm_nr || '_' || v_period_nr;

    -- 1. ACCOUNT PLAN (Hesap PlanÄ±) - ROS_001_01_EMUHACC
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS "public"."%I_EMUHACC" (
            "logicalref" SERIAL PRIMARY KEY,
            "code" varchar(24) NOT NULL UNIQUE,
            "name" varchar(200),
            "parent_code" varchar(24),
            "account_type" varchar(10), -- Asset, Liability, etc.
            "level" smallint DEFAULT 0,
            "balance_type" smallint DEFAULT 0, -- 0: Debit, 1: Credit
            "idempotency_key" uuid UNIQUE, -- For deduplication
            "created_on" timestamp DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "idx_%I_emuhacc_code" ON "public"."%I_EMUHACC" ("code");
        CREATE INDEX IF NOT EXISTS "idx_%I_emuhacc_idem" ON "public"."%I_EMUHACC" ("idempotency_key");
    ', v_table_prefix, v_table_prefix, v_table_prefix, v_table_prefix);

    -- 2. JOURNAL HEADER (FiÅŸ BaÅŸlÄ±ÄŸÄ±) - ROS_001_01_EMUHFICHE
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS "public"."%I_EMUHFICHE" (
            "logicalref" SERIAL PRIMARY KEY,
            "fiche_no" varchar(16) NOT NULL,
            "date" date NOT NULL,
            "fiche_type" smallint DEFAULT 1, -- 1: Mahsup, 2: Tahsilat, 3: Tediye
            "branch_id" integer,
            "doc_no" varchar(16),
            "description" varchar(200),
            "total_debit" numeric(24, 6) DEFAULT 0,
            "total_credit" numeric(24, 6) DEFAULT 0,
            "idempotency_key" uuid UNIQUE, -- For deduplication
            "created_on" timestamp DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_%I_emuhfiche_no" ON "public"."%I_EMUHFICHE" ("fiche_no");
        CREATE INDEX IF NOT EXISTS "idx_%I_emuhfiche_idem" ON "public"."%I_EMUHFICHE" ("idempotency_key");
    ', v_table_prefix, v_table_prefix, v_table_prefix, v_table_prefix);

    -- 3. JOURNAL LINES (FiÅŸ SatÄ±rlarÄ±) - ROS_001_01_EMUHLINE
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS "public"."%I_EMUHLINE" (
            "logicalref" SERIAL PRIMARY KEY,
            "fiche_ref" integer REFERENCES "public"."%I_EMUHFICHE"("logicalref") ON DELETE CASCADE,
            "account_ref" integer REFERENCES "public"."%I_EMUHACC"("logicalref"),
            "line_nr" smallint,
            "description" varchar(200),
            "amount" numeric(24, 6) DEFAULT 0,
            "sign" smallint DEFAULT 0, -- 0: Debit (BorÃ§), 1: Credit (Alacak)
            "date" date,
            "branch_id" integer,
            "idempotency_key" uuid -- Lines usually deduped by Fiche, but good to have if treating lines individually
        );
        CREATE INDEX IF NOT EXISTS "idx_%I_emuhline_fiche" ON "public"."%I_EMUHLINE" ("fiche_ref");
        CREATE INDEX IF NOT EXISTS "idx_%I_emuhline_account" ON "public"."%I_EMUHLINE" ("account_ref");
    ', v_table_prefix, v_table_prefix, v_table_prefix, v_table_prefix, v_table_prefix, v_table_prefix);

END;
$$ LANGUAGE plpgsql;

-- Initial Setup / Seed Data
-- 1. Create Default Firm (001)
INSERT INTO "public"."ROS_CAPIFIRM" ("nr", "name", "title")
VALUES (1, 'Merkez Firma', 'Merkez A.Å.')
ON CONFLICT ("nr") DO NOTHING;

-- 2. Create Default Period (01) for 2026
INSERT INTO "public"."ROS_CAPIPERIOD" ("firm_id", "nr", "beg_date", "end_date")
SELECT logicalref, 1, '2026-01-01', '2026-12-31'
FROM "public"."ROS_CAPIFIRM" WHERE "nr" = 1
ON CONFLICT ("firm_id", "nr") DO NOTHING;

-- 3. Create Default Branch (00)
INSERT INTO "public"."ROS_CAPIBRANCH" ("firm_id", "nr", "name")
SELECT logicalref, 0, 'Merkez Åube'
FROM "public"."ROS_CAPIFIRM" WHERE "nr" = 1
ON CONFLICT ("firm_id", "nr") DO NOTHING;

-- 4. Create Default Warehouse (00)
INSERT INTO "public"."ROS_CAPIWHOUSE" ("firm_id", "branch_id", "nr", "name")
SELECT f.logicalref, b.logicalref, 0, 'Merkez Depo'
FROM "public"."ROS_CAPIFIRM" f
JOIN "public"."ROS_CAPIBRANCH" b ON b.firm_id = f.logicalref AND b.nr = 0
WHERE f.nr = 1
ON CONFLICT ("firm_id", "nr") DO NOTHING;

-- 5. Trigger Table Creation for the default period
-- Note: In Supabase SQL Editor, you might need to run this call separately or use a trigger.
-- For now, we call it directly if the period exists.
DO $$
DECLARE
    v_period_id integer;
BEGIN
    SELECT logicalref INTO v_period_id
    FROM "public"."ROS_CAPIPERIOD"
    WHERE firm_id = (SELECT logicalref FROM "public"."ROS_CAPIFIRM" WHERE nr = 1) AND nr = 1;
    
    IF v_period_id IS NOT NULL THEN
        PERFORM create_period_tables(v_period_id);
    END IF;
END $$;

