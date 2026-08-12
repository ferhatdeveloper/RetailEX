const { Client } = require('pg');

const connStr = 'postgresql://retailos_user:RetailOS2025!Secure@26.154.3.237:5432/retailos_db';

async function test() {
    console.log('Testing connection to 26.154.3.237:5432...');
    const client = new Client({
        connectionString: connStr,
        connectionTimeoutMillis: 10000,
    });

    try {
        await client.connect();
        console.log('Connected successfully!');
        const res = await client.query('SELECT version()');
        console.log('Version:', res.rows[0].version);
    } catch (err) {
        console.error('Connection failed:', err.message);
    } finally {
        await client.end();
    }
}

test();
