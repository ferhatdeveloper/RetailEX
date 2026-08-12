import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSharedPgPool } from '../src/utils/pgPoolShared';

function getPool(connStr: string) {
  return getSharedPgPool(connStr);
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
