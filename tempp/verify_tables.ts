import { Client } from 'pg';

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function verifyTables() {
    const client = new Client(LOCAL_CONFIG);
    try {
        await client.connect();

        const tablesResult = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name LIKE 'rex_001_01_%';
        `);
        console.log('--- FOUND TABLES for Firm 001, Period 01 ---');
        console.log(tablesResult.rows.map(r => r.table_name).join(', '));

        const salesColsResult = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'rex_001_01_sales'
          ORDER BY ordinal_position;
        `);
        console.log('\n--- COLUMNS in rex_001_01_sales ---');
        console.log(salesColsResult.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

        const itemsColsResult = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'rex_001_01_sale_items'
          ORDER BY ordinal_position;
        `);
        console.log('\n--- COLUMNS in rex_001_01_sale_items ---');
        console.log(itemsColsResult.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

    } catch (error) {
        console.error('Error connecting or querying DB:', error);
    } finally {
        await client.end();
    }
}

verifyTables();
