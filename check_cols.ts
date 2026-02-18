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
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'rex_009_cash_registers';
    `);
        console.log('Columns of rex_009_cash_registers:', result.rows.map(r => r.column_name));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

diagnose();
