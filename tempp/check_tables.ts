import { Client } from 'pg';

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function diagnose() {
    const client = new Client(LOCAL_CONFIG);
    try {
        await client.connect();
        console.log('Connected to database');

        const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE 'rex_%_products' OR table_name LIKE 'rex_%_rex_%_products');
    `);
        console.log('Found tables:', result.rows.map(r => r.table_name));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

diagnose();
