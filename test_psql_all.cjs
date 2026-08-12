const fs = require('fs');
const { Client } = require('pg');

async function checkAllErrors() {
    const sql = fs.readFileSync('C:\\RetailEx\\last_failed_dump.sql', 'utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'Yq7xwQpt6c',
        database: 'NAW_PDKS'
    });

    await client.connect();
    try { await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'); } catch (e) { }

    let errorCount = 0;
    for (let i = 0; i < statements.length; i++) {
        let stmt = statements[i] + ';';

        // Auto-apply our known fixes to test further issues
        stmt = stmt.replace(/ ARRAY NOT NULL/g, " text[] NOT NULL")
            .replace(/ ARRAY DEFAULT/g, " text[] DEFAULT")
            .replace(/ ARRAY NULL/g, " text[] NULL");

        // Fix evaluation_type ENUM
        stmt = stmt.replace(/"evaluation_type"\s+evaluation_type/g, '"evaluation_type" character varying');
        stmt = stmt.replace(/'individual'::evaluation_type/g, "'individual'::character varying");

        // Fix known missing sequences to bypass the already solved 42P01 error
        stmt = stmt.replace(/integer NOT NULL DEFAULT nextval\([^)]+\)/g, "SERIAL");
        stmt = stmt.replace(/bigint NOT NULL DEFAULT nextval\([^)]+\)/g, "BIGSERIAL");
        stmt = stmt.replace(/smallint NOT NULL DEFAULT nextval\([^)]+\)/g, "SMALLSERIAL");
        stmt = stmt.replace(/integer DEFAULT nextval\([^)]+\)/g, "SERIAL");
        stmt = stmt.replace(/bigint DEFAULT nextval\([^)]+\)/g, "BIGSERIAL");
        stmt = stmt.replace(/smallint DEFAULT nextval\([^)]+\)/g, "SMALLSERIAL");

        if (stmt.toLowerCase().includes('create extension') || stmt.toLowerCase().includes('create publication')) {
            continue;
        }

        try {
            await client.query("BEGIN");
            await client.query("SAVEPOINT point1");
            await client.query(stmt);
            await client.query("RELEASE SAVEPOINT point1");
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK TO SAVEPOINT point1");
            await client.query("COMMIT");
            console.log(`\n--- ERROR #${++errorCount} ---`);
            console.log("CODE:", e.code);
            console.log("MESSAGE:", e.message);
            console.log("STATEMENT:", stmt.substring(0, 150) + "...");
        }
    }

    console.log(`\nTotal Errors Found: ${errorCount}`);
    await client.end();
}

checkAllErrors();
