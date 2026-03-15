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
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'cash_registers';
    `);
        console.log('Found cash_registers in:', result.rows.map(r => `${r.table_schema}.${r.table_name}`));

        const allRex = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'rex_%_cash_registers'
    `);
        console.log('Actual rex tables:', allRex.rows.map(r => r.table_name));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

diagnose();
