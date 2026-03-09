
import { postgres } from './src/services/postgres.ts';

async function checkAuth() {
    try {
        console.log('--- ROLES ---');
        const rolesResult = await postgres.query('SELECT * FROM roles', []);
        console.table(rolesResult.rows);

        console.log('\n--- USERS ---');
        const usersResult = await postgres.query('SELECT id, username, role, role_id, firm_nr FROM users', []);
        console.table(usersResult.rows);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAuth();
