
const { Client } = require('pg');

// Config from postgres.ts (REMOTE_CONFIG as default for 'online'/'hybrid' usually points there)
const validConfig = {
    host: '26.154.3.237',
    port: 5432,
    database: 'retailos_db',
    user: 'retailos_user',
    password: 'RetailOS2025!Secure',
};

async function checkInvoices() {
    const client = new Client(validConfig);
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected!');

        console.log('\n--- Recent Invoices in SALES table ---');
        const res = await client.query(`
      SELECT 
        id, 
        fiche_no, 
        to_char(date, 'YYYY-MM-DD HH24:MI') as date, 
        fiche_type, 
        trcode, 
        total_net, 
        firm_nr 
      FROM sales 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

        if (res.rows.length === 0) {
            console.log('No invoices declaration found in table.');
        } else {
            console.table(res.rows);
        }

    } catch (err) {
        console.error('Database connection error:', err);
    } finally {
        await client.end();
    }
}

checkInvoices();
