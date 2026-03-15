
const { postgres } = require('./src/services/postgres');

async function listTables() {
    try {
        console.log('Listing all tables starting with rex_ or ROS_...');
        const { rows } = await postgres.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND (table_name LIKE 'rex_%' OR table_name LIKE 'ROS_%')
            ORDER BY table_name
        `);

        if (rows.length === 0) {
            console.log('No such tables found.');
        } else {
            rows.forEach(r => console.log('- ' + r.table_name));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit();
    }
}

listTables();
