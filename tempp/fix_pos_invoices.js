const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'retailex_local',
    password: 'Yq7xwQpt6c',
    port: 5432,
});

async function fixInvoices() {
    try {
        await client.connect();
        console.log('Connected to database...');

        // Update the last 10 invoices to be Retail Sales Invoice (trcode 7)
        // This assumes all recent invoices in the dev environment are POS sales that should be retail.
        const res = await client.query(`
      UPDATE rex_009_01_sales
      SET trcode = 7
      WHERE trcode = 8 AND fiche_type = 'sales_invoice'
    `);

        console.log(`Updated ${res.rowCount} invoices from Wholesale (8) to Retail (7).`);

    } catch (err) {
        console.error('Error executing update:', err);
    } finally {
        await client.end();
    }
}

fixInvoices();
