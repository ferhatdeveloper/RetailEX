import { invoke } from '@tauri-apps/api/tauri';

const connStr = 'postgresql://postgres:Yq7xwQpt6c@localhost:5432/retailex_local';

console.log('🔍 Running Migration 011 (WMS Cleanup)...');

async function runMigration() {
    try {
        const sql = `
            -- 1. Add manager_name to stores
            ALTER TABLE stores ADD COLUMN IF NOT EXISTS manager_name VARCHAR(100);

            -- 2. Create WMS Transfer Items
            CREATE TABLE IF NOT EXISTS wms.transfer_items (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                transfer_id UUID REFERENCES wms.transfers(id) ON DELETE CASCADE,
                product_id UUID,
                quantity DECIMAL(15,2) DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- 3. Redefine CREATE_PERIOD_TABLES
            CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
            RETURNS void AS $$
            DECLARE
                v_prefix text;
            BEGIN
                v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

                -- Sales Header
                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        ref_id INTEGER UNIQUE,
                        fiche_no VARCHAR(100) UNIQUE,
                        customer_ref INTEGER,
                        salesman_ref INTEGER,
                        total_net DECIMAL(15,2) DEFAULT 0,
                        total_vat DECIMAL(15,2) DEFAULT 0,
                        total_gross DECIMAL(15,2) DEFAULT 0,
                        trcode INTEGER,
                        date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                        is_cancelled BOOLEAN DEFAULT false
                    );
                ', v_prefix || '_sales');

                -- Sale Items
                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        ref_id INTEGER UNIQUE,
                        sale_ref UUID REFERENCES %I(id) ON DELETE CASCADE,
                        product_ref INTEGER,
                        amount DECIMAL(15,2) NOT NULL,
                        price DECIMAL(15,2) NOT NULL,
                        vat_rate DECIMAL(5,2) DEFAULT 20,
                        total_net DECIMAL(15,2) NOT NULL,
                        total_vat DECIMAL(15,2) NOT NULL,
                        total_gross DECIMAL(15,2) NOT NULL
                    );
                ', v_prefix || '_sale_items', v_prefix || '_sales');

                -- Cash Transactions
                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        ref_id INTEGER UNIQUE,
                        cash_ref INTEGER,
                        fiche_no VARCHAR(100),
                        trcode INTEGER,
                        date TIMESTAMPTZ,
                        amount DECIMAL(15,2),
                        sign INTEGER, 
                        customer_ref INTEGER,
                        definition TEXT,
                        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                    );
                ', v_prefix || '_cash_lines');

                -- Stock Movements (Header)
                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        document_no VARCHAR(50) UNIQUE,
                        movement_type VARCHAR(20),
                        warehouse_id UUID REFERENCES stores(id),
                        movement_date TIMESTAMPTZ DEFAULT NOW(),
                        description TEXT,
                        status VARCHAR(20) DEFAULT ''completed'',
                        created_by UUID,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    );
                ', v_prefix || '_stock_movements');

                -- Stock Movement Items (Lines)
                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        movement_id UUID REFERENCES %I(id) ON DELETE CASCADE,
                        product_id UUID,
                        quantity DECIMAL(15,2) DEFAULT 0,
                        unit_price DECIMAL(15,2) DEFAULT 0,
                        notes TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );
                ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

            END;
            $$ LANGUAGE plpgsql;

            -- 4. Apply
            SELECT CREATE_PERIOD_TABLES('001', '01');
            SELECT CREATE_PERIOD_TABLES('009', '01');
        `;

        await invoke('pg_query', { connStr, sql, params: [] });
        console.log('✅ Migration 011 executed successfully!');

        // Verify
        const result: any = await invoke('pg_query', {
            connStr,
            sql: "SELECT to_regclass('rex_009_01_stock_movements') as table_exists",
            params: []
        });
        console.log('✅ Table Check:', result);

    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

runMigration();
