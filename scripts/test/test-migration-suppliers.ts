import { invoke } from '@tauri-apps/api/core';
import { ERP_SETTINGS } from './src/services/postgres';

const connStr = 'postgresql://postgres:Yq7xwQpt6c@localhost:5432/retailex_local';

console.log('🔍 Testing Suppliers Migration...');

async function runTest() {
    try {
        // 1. Run Migration SQL directly
        console.log('🚀 Executing Migration SQL...');
        const sql = `
            CREATE OR REPLACE FUNCTION create_suppliers_table(p_firm_nr VARCHAR)
            RETURNS void AS $$
            DECLARE
                v_prefix text;
                v_table_name text;
            BEGIN
                v_prefix := lower('rex_' || p_firm_nr);
                v_table_name := v_prefix || '_suppliers';

                EXECUTE format('
                    CREATE TABLE IF NOT EXISTS %I (
                        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                        ref_id INTEGER UNIQUE,
                        code VARCHAR(50) UNIQUE,
                        name VARCHAR(255) NOT NULL,
                        phone VARCHAR(50),
                        phone2 VARCHAR(50),
                        email VARCHAR(255),
                        address TEXT,
                        district VARCHAR(100),
                        city VARCHAR(100),
                        postal_code VARCHAR(20),
                        country VARCHAR(100),
                        contact_person VARCHAR(100),
                        contact_person_phone VARCHAR(50),
                        payment_terms INTEGER DEFAULT 30,
                        credit_limit DECIMAL(15,2) DEFAULT 0,
                        balance DECIMAL(15,2) DEFAULT 0,
                        tax_number VARCHAR(50),
                        tax_office VARCHAR(100),
                        is_active BOOLEAN DEFAULT true,
                        notes TEXT,
                        firma_id VARCHAR(50),
                        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                    );
                ', v_table_name);
            END;
            $$ LANGUAGE plpgsql;

            SELECT create_suppliers_table('001');
            SELECT create_suppliers_table('009');
            
            INSERT INTO rex_009_suppliers (code, name, phone, email, city, is_active)
            VALUES 
            ('TED-TEST-01', 'Test Tedarikçi A.Ş.', '05559998877', 'test@example.com', 'İstanbul', true)
            ON CONFLICT (code) DO NOTHING;
        `;

        await invoke('pg_query', { connStr, sql, params: [] });
        console.log('✅ Migration executed successfully!');

        // 2. Verify Data
        console.log('📊 Verifying data...');
        const result: any = await invoke('pg_query', {
            connStr,
            sql: 'SELECT * FROM rex_009_suppliers',
            params: []
        });
        const data = JSON.parse(result);
        console.log('✅ Suppliers found:', data.length);
        console.log(data);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

runTest();
