// Run migrations manually using Node.js
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function runMigrations() {
    const client = new Client({
        connectionString: 'postgresql://postgres:Yq7xwQpt6c@localhost:5432/retailex_local',
    });

    try {
        await client.connect();
        console.log('✅ Connected to database.');

        console.log('🔧 Running Migration 026: Consolidate Schema Fixes...');
        const migrationPath = path.join('d:\\Exretailosv1\\database\\migrations\\026_consolidate_schema_fixes.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await client.query(sql);
        console.log('✅ Migration 026 completed successfully.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await client.end();
        console.log('🔌 Disconnected.');
    }
}

runMigrations();
