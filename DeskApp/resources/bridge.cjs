"use strict";

// src/services/pg_bridge.ts
var import_hono = require("hono");
var import_cors = require("hono/cors");
var import_pg = require("pg");
var import_node_server = require("@hono/node-server");
var app = new import_hono.Hono();
app.use("*", (0, import_cors.cors)({
  origin: ["https://retailex.app", "http://localhost:8080", "http://localhost:5173", "http://localhost:6173", "http://localhost:6174", "http://localhost:3000"],
  allowMethods: ["GET", "POST", "OPTIONS"]
}));
var pools = /* @__PURE__ */ new Map();
function getPool(connStr) {
  if (!pools.has(connStr)) {
    console.log(`[PG Bridge] Creating new pool for: ${connStr.replace(/:[^:@]+@/, ":***@")}`);
    const pool = new import_pg.Pool({
      connectionString: connStr,
      max: 20,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 15e3
      // Increased to 15s for remote connections
    });
    pool.on("error", (err) => {
      console.error("[PG Bridge] Unexpected error on idle client", err);
    });
    pools.set(connStr, pool);
  }
  return pools.get(connStr);
}
app.get("/api/status", (c) => {
  return c.json({ status: "RUNNING", version: "1.0.0", service: "PostgreSQL Bridge" });
});
app.post("/api/pg_query", async (c) => {
  try {
    const { connStr, sql, params } = await c.req.json();
    if (!sql) return c.json({ error: "SQL is required" }, 400);
    if (!connStr) return c.json({ error: "Connection string is required" }, 400);
    const pool = getPool(connStr);
    const start = Date.now();
    const result = await pool.query(sql, params || []);
    const duration = Date.now() - start;
    console.log(`[PG Bridge] Query executed in ${duration}ms: ${sql.substring(0, 100)}...`);
    return c.json({
      rows: result.rows,
      rowCount: result.rowCount
    });
  } catch (error) {
    console.error("[PG Bridge Error]", error);
    return c.json({
      error: error.message,
      detail: error.detail,
      code: error.code
    }, 500);
  }
});
var port = 3001;
(0, import_node_server.serve)({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`\u{1F680} SQL Bridge started on http://localhost:${info.port}`);
});
