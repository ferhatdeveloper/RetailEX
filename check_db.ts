
const { postgres } = require('./src/services/postgres');

async function checkInvoices() {
    try {
        console.log('Checking database connection...');
        const result = await postgres.query('SELECT NOW()');
        console.log('Connected:', result.rows[0]);

        console.log('\nChecking last 5 invoices in sales table:');
        const { rows } = await postgres.query(`
      SELECT id, fiche_no, date, fiche_type, trcode, total_net 
      FROM sales 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

        if (rows.length === 0) {
            console.log('No invoices found in sales table.');
        } else {
            console.table(rows);
        }

    } catch (error) {
        console.error('Error checking DB:', error);
    } finally {
        process.exit();
    }
}

checkInvoices();
