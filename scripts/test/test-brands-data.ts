// Quick test script to check if brands data exists
import { invoke } from '@tauri-apps/api/core';

const connStr = 'postgresql://postgres:Yq7xwQpt6c@localhost:5432/retailex_local';

console.log('🔍 Testing database connection and data...');

// Test 1: Check if brands table exists and has data
invoke('pg_query', {
    connStr,
    sql: 'SELECT COUNT(*) as count FROM brands',
    params: []
}).then((result: any) => {
    const data = JSON.parse(result);
    console.log('✅ Brands table query result:', data);
    console.log(`📊 Total brands: ${data[0]?.count || 0}`);
}).catch((error) => {
    console.error('❌ Brands query failed:', error);
});

// Test 2: Get all brands
invoke('pg_query', {
    connStr,
    sql: 'SELECT * FROM brands LIMIT 10',
    params: []
}).then((result: any) => {
    const data = JSON.parse(result);
    console.log('✅ Brands data:', data);
}).catch((error) => {
    console.error('❌ Brands data fetch failed:', error);
});

// Test 3: Check ERP_SETTINGS
import { ERP_SETTINGS } from './src/services/postgres';
console.log('📋 Current ERP_SETTINGS:', ERP_SETTINGS);
