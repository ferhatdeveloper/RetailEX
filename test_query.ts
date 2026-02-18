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

        const table = 'rex_009_cash_registers';
        const isActive = true;

        console.log(`Running: SELECT * FROM ${table} WHERE is_active = ${isActive} ORDER BY code ASC`);

        const result = await client.query(`SELECT * FROM ${table} WHERE is_active = $1 ORDER BY code ASC`, [isActive]);
        console.log('Result count:', result.rows.length);
        console.log('First 2 rows:', JSON.stringify(result.rows.slice(0, 2), null, 2));

        const allData = await client.query(`SELECT * FROM ${table}`);
        console.log('Total rows in table (active or not):', allData.rows.length);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

diagnose();
