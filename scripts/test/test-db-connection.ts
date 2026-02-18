// Test script to verify database connection and data
import { invoke } from '@tauri-apps/api/tauri';

async function testDatabaseConnection() {
    console.log('🔍 Testing Database Connection...');

    const connStr = 'postgresql://postgres:Yq7xwQpt6c@localhost:5432/retailex_local';

    // Test 1: Check brands table
    try {
        console.log('📊 Test 1: Querying brands table...');
        const result = await invoke('pg_query', {
            connStr,
            sql: 'SELECT * FROM brands LIMIT 5',
            params: []
        });
        console.log('✅ Brands query result:', result);
    } catch (error) {
        console.error('❌ Brands query failed:', error);
    }

    // Test 2: Check units table
    try {
        console.log('📊 Test 2: Querying units table...');
        const result = await invoke('pg_query', {
            connStr,
            sql: 'SELECT * FROM units LIMIT 5',
            params: []
        });
        console.log('✅ Units query result:', result);
    } catch (error) {
        console.error('❌ Units query failed:', error);
    }

    // Test 3: Check if tables exist
    try {
        console.log('📊 Test 3: Checking table existence...');
        const result = await invoke('pg_query', {
            connStr,
            sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('brands', 'units', 'categories', 'product_groups', 'stores') ORDER BY table_name`,
            params: []
        });
        console.log('✅ Tables found:', result);
    } catch (error) {
        console.error('❌ Table check failed:', error);
    }
}

// Run the test
testDatabaseConnection();
