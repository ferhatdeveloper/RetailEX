const { invoke } = require('@tauri-apps/api/tauri');

async function checkData() {
    const connStr = 'postgresql://postgres:Yq7xwQpt6c@127.0.0.1:5432/retailex_local';
    try {
        console.log('--- FIRMS ---');
        const firmsJson = await invoke('pg_query', {
            connStr,
            sql: 'SELECT id, firm_nr, name, "default" FROM firms',
            params: []
        });
        console.log(JSON.parse(firmsJson));

        console.log('\n--- PERIODS ---');
        const periodsJson = await invoke('pg_query', {
            connStr,
            sql: 'SELECT id, firm_id, nr, beg_date, end_date, is_active FROM periods',
            params: []
        });
        console.log(JSON.parse(periodsJson));
    } catch (e) {
        console.error('Error:', e);
    }
}

checkData();
