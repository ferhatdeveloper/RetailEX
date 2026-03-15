
const { Client } = require('pg');

const localConfig = {
    host: 'localhost',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function checkInvoices() {
    const client = new Client(localConfig);
    try {
        console.log('Connecting to LOCAL database...');
        await client.connect();
        console.log('Connected!');

        const saleNumber = Math.floor(Math.random() * 1000000);
        const now = new Date();

        console.log('\n--- Inserting a new sale into rex_009_01_sales with clean parameters (No redundant casts) ---');
        console.log('Casts used: Only $4::text::timestamptz for date');

        const res = await client.query(`
            INSERT INTO rex_009_01_sales (
                firm_nr, period_nr, fiche_no, date, fiche_type, trcode,
                customer_id, total_net, total_vat, total_discount, net_amount, 
                status, notes, document_no, payment_method, cashier, store_id
            ) VALUES ($1, $2, $3, $4::text::timestamptz, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING id
        `, [
            '009', '01', saleNumber, now, 'sales_invoice', 7,
            null, 333.00, 0, 0, 333.00,
            'completed', 'Manual Test Clean Params', saleNumber, 'cash', 'Admin', null
        ]);

        console.log('Insert SUCCESS! ID:', res.rows[0].id);

    } catch (err) {
        console.error('Database error:', err);
    } finally {
        await client.end();
    }
}

checkInvoices();
