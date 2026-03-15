import pg from 'pg';

const client = new pg.Client({
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: 'Yq7xwQpt6c',
});

async function inspect() {
  try {
    await client.connect();
    console.log('Connected to database');

    const tables = ['rex_001_unitsets', 'rex_001_unitsetl', 'rex_001_products'];

    for (const table of tables) {
      console.log(`\nColumns for table: ${table}`);
      const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      
      if (res.rows.length === 0) {
        console.log('No columns found (table might not exist or name is wrong)');
      } else {
        res.rows.forEach(col => {
          console.log(`- ${col.column_name}: ${col.data_type}`);
        });
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

inspect();
