import { Client } from 'pg';

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function createTables() {
    const client = new Client(LOCAL_CONFIG);
    try {
        await client.connect();
        console.log('Connected to database');

        await client.query(`SELECT CREATE_PERIOD_TABLES('001', '2026');`);
        console.log('Successfully created tables for firm 001 and period 2026');

        // Verify
        const result = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'rex_001_2026_sales';
        `);
        console.log('Found tables:', result.rows.map((r: any) => r.table_name));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

createTables();
