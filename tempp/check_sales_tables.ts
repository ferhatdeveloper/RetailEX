import { Client } from 'pg';

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function checkTables() {
    const client = new Client(LOCAL_CONFIG);
    try {
        await client.connect();

        const result = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name LIKE '%sales%';
        `);
        console.log('Tables matching %sales%:', result.rows.map((r: any) => r.table_name));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

checkTables();
