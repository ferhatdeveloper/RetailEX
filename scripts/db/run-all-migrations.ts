
// Using require to avoid ESM/TS extension issues in simple runner script
const { postgres } = require('./src/services/postgres');

console.log('🚀 Starting Database Migration...');

async function main() {
    try {
        console.log('🔄 Connecting to local PostgreSQL...');

        // This command scans 'database/migrations/*.sql' and applies them in order
        // It tracks applied migrations in '_migrations' table
        // The 'true' argument usually means 'verbose' or 'run' depending on implementation
        if (postgres && postgres.runMigrations) {
            await postgres.runMigrations(true);
            console.log('✅ All migrations executed successfully!');
        } else {
            console.error('❌ postgres service not found or runMigrations method missing');
            console.log('postgres object:', postgres);
        }
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

main();
