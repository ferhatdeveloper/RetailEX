import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';

// Pool cache per connection string
const pools = new Map<string, Pool>();

function getPool(connStr: string): Pool {
  if (!pools.has(connStr)) {
    pools.set(connStr, new Pool({
      connectionString: connStr,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }));
  }
  return pools.get(connStr)!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sql, params } = req.body as { sql: string; params?: any[] };

    if (!sql) {
      return res.status(400).json({ error: 'SQL is required' });
    }

    // Credentials come from Vercel environment variables — never from the client
    const connStr = process.env.PG_CONN_STR;
    if (!connStr) {
      return res.status(500).json({ error: 'Database not configured (PG_CONN_STR missing)' });
    }

    const pool = getPool(connStr);
    const result = await pool.query(sql, params || []);

    return res.status(200).json({
      rows: result.rows,
      rowCount: result.rowCount,
    });
  } catch (error: any) {
    console.error('[pg_query serverless error]', error.message);
    return res.status(500).json({
      error: error.message,
      detail: error.detail,
      code: error.code,
    });
  }
}
