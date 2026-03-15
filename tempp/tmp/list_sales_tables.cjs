const pg = require('pg');
const config = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: 'Yq7xwQpt6c',
};

async function run() {
  const client = new pg.Client(config);
  try {
    await client.connect();
    const res = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'rex_%_%_sales' ORDER BY table_schema, table_name");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
