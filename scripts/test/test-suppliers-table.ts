import { invoke } from '@tauri-apps/api/tauri';

const connStr = 'postgresql://postgres:Yq7xwQpt6c@localhost:5432/retailex_local';

console.log('🔍 Checking for suppliers table...');

invoke('pg_query', {
    connStr,
    sql: "SELECT to_regclass('public.suppliers') as table_exists",
    params: []
}).then((result: any) => {
    console.log('✅ Suppliers table check:', result);
}).catch((error) => {
    console.error('❌ Suppliers check failed:', error);
});
