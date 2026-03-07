/**
 * PostgreSQL Bridge for Web Environment
 * This server component allows browser clients to execute SQL queries.
 * 
 * SECURITY NOTE: Direct SQL execution from frontend should only be used in 
 * development or secure private networks.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';

const app = new Hono();

// Enable CORS for frontend requests
app.use('*', cors());

// DB Pool Cache: connectionString -> Pool
const pools = new Map<string, Pool>();

function getPool(connStr: string): Pool {
    if (!pools.has(connStr)) {
        const pool = new Pool({
            connectionString: connStr,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        pools.set(connStr, pool);
    }
    return pools.get(connStr)!;
}

app.post('/api/pg_query', async (c) => {
    try {
        const { connStr, sql, params } = await c.req.json();

        if (!sql) return c.json({ error: 'SQL is required' }, 400);
        if (!connStr) return c.json({ error: 'Connection string is required' }, 400);

        const pool = getPool(connStr);
        const result = await pool.query(sql, params || []);

        return c.json({
            rows: result.rows,
            rowCount: result.rowCount
        });
    } catch (error: any) {
        console.error('[PG Bridge Error]', error);
        return c.json({
            error: error.message,
            detail: error.detail,
            code: error.code
        }, 500);
    }
});

// Port can be configured via env
const port = 3001;

serve({
    fetch: app.fetch,
    port
}, (info) => {
    console.log(`🚀 SQL Bridge started on http://localhost:${info.port}`);
});


