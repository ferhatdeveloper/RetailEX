const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        password: 'Yq7xwQpt6c',
        database: 'retailex_local'
    });

    try {
        await client.connect();
        
        console.log('--- rex_001_products ---');
        const resProducts = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rex_001_products'");
        resProducts.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));

        console.log('\n--- rex_001_unitsets ---');
        const resSets = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rex_001_unitsets'");
        resSets.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));

        console.log('\n--- rex_001_unitsetl ---');
        const resLines = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rex_001_unitsetl'");
        resLines.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));

        console.log('\n--- rex_001_01_sales ---');
        const resSales = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rex_001_01_sales'");
        resSales.rows.forEach(row => console.log(`${row.column_name}: ${row.data_type}`));

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
check();
