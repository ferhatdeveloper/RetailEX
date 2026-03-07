import { Client } from 'pg';
import * as fs from 'fs';

const LOCAL_CONFIG = {
    host: '127.0.0.1',
    port: 5432,
    database: 'retailex_local',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
};

async function runRepair() {
    const client = new Client(LOCAL_CONFIG);
    try {
        await client.connect();
        console.log('Connected to database');

        const sql = fs.readFileSync('database/scripts/repair_invoice_schema.sql', 'utf8');
        await client.query(sql);

        console.log('Successfully ran repair_invoice_schema.sql');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

runRepair();
