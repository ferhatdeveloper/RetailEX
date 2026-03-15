const fs = require('fs');
const pg = require('pg');

const config = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: 'Yq7xwQpt6c',
};

async function run() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Please specify a SQL file path');
    process.exit(1);
  }

  const sql = fs.readFileSync(filePath, 'utf8');
  const client = new pg.Client(config);
  try {
    await client.connect();
    console.log('Connected to database');
    await client.query(sql);
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
