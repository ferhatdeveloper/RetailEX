const fs = require('fs');
const { Client } = require('pg');

async function test() {
    const sql = fs.readFileSync('C:\\RetailEx\\last_failed_dump.sql', 'utf8');
    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'Yq7xwQpt6c',
        database: 'NAW_PDKS'
    });

    try {
        await client.connect();
        try { await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'); } catch (e) { }
        await client.query(sql);
        console.log("Success! No error.");
    } catch (e) {
        console.error("SQL Error Name:", e.name);
        console.error("SQL Error Message:", e.message);
        console.error("SQL Error Code:", e.code);
        console.error("SQL Error Detail:", e.detail);
        console.error("SQL Error Hint:", e.hint);
        if (e.position) {
            const pos = parseInt(e.position, 10);
            const snippet = sql.substring(Math.max(0, pos - 100), Math.min(sql.length, pos + 100));
            console.error("SQL Snippet Around Error:\n", snippet);
        }
    } finally {
        await client.end();
    }
}
test();
