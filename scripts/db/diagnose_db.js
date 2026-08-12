const { invoke } = require('@tauri-apps/api/tauri');

async function diagnose() {
    const connStr = "postgresql://postgres:RetailExLocalPassword@localhost:5432/retailex_local";

    async function query(sql, params = []) {
        try {
            const resultJson = await invoke('pg_query', { connStr, sql, params });
            return JSON.parse(resultJson);
        } catch (e) {
            console.error("Query Error:", sql, e);
            return null;
        }
    }

    console.log("--- DIAGNOSIS START ---");

    const extensions = await query("SELECT * FROM pg_extension WHERE extname = 'pgcrypto'");
    console.log("pgcrypto status:", extensions?.length > 0 ? "INSTALLED" : "MISSING");

    const firms = await query("SELECT firm_nr, name FROM firms");
    console.log("Registered Firms:", firms);

    const users = await query("SELECT username, firm_nr, (password_hash IS NOT NULL) as has_hash FROM users");
    console.log("Registered Users:", users);

    console.log("--- DIAGNOSIS END ---");
}

diagnose();
