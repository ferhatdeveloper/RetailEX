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
app.use('*', cors({
    origin: ['https://retailex.app', 'http://localhost:8080', 'http://localhost:5173', 'http://localhost:6173', 'http://localhost:6174', 'http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

// DB Pool Cache: connectionString -> Pool
const pools = new Map<string, Pool>();

function getPool(connStr: string): Pool {
    if (!pools.has(connStr)) {
        console.log(`[PG Bridge] Creating new pool for: ${connStr.replace(/:[^:@]+@/, ':***@')}`);
        const pool = new Pool({
            connectionString: connStr,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000, // Increased to 15s for remote connections
        });
        
        pool.on('error', (err) => {
            console.error('[PG Bridge] Unexpected error on idle client', err);
        });

        pools.set(connStr, pool);
    }
    return pools.get(connStr)!;
}

app.get('/api/status', (c) => {
    return c.json({ status: 'RUNNING', version: '1.0.0', service: 'PostgreSQL Bridge' });
});

app.post('/api/pg_query', async (c) => {
    try {
        const { connStr, sql, params } = await c.req.json();

        if (!sql) return c.json({ error: 'SQL is required' }, 400);
        if (!connStr) return c.json({ error: 'Connection string is required' }, 400);

        const pool = getPool(connStr);
        const start = Date.now();
        const result = await pool.query(sql, params || []);
        const duration = Date.now() - start;

        console.log(`[PG Bridge] Query executed in ${duration}ms: ${sql.substring(0, 100)}...`);

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


