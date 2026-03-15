import pkg from 'pg';
const { Client } = pkg;

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function checkTable() {
    const client = new Client(LOCAL_CONFIG);
    try {
        await client.connect();
        const { rows } = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'rex_1_1_sales'
        `);
        console.log('Result:', rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

checkTable();
