/**
 * ExRetailOS - Check & Promissory Note Service (Backend)
 * 
 * CRUD operations for checks and promissory notes
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all checks/notes
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");
    const tip = c.req.query("tip"); // CEK or SENET
    const yon = c.req.query("yon"); // ALINAN or VERILEN
    const durum = c.req.query("durum");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let prefix = `check:${firma_id}:`;
    if (donem_id) {
      prefix += `${donem_id}:`;
    }

    let checks = await kv.getByPrefix(prefix);

    // Filters
    if (tip) {
      checks = checks.filter((ch: any) => ch.tip === tip);
    }
    if (yon) {
      checks = checks.filter((ch: any) => ch.yon === yon);
    }
    if (durum) {
      checks = checks.filter((ch: any) => ch.durum === durum);
    }

    return c.json({ checks: checks || [] });
  } catch (error: any) {
    console.error("[Checks] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single check/note
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const checks = await kv.getByPrefix(`check:`);
    const check = checks.find((ch: any) => ch.id === id);

    if (!check) {
      return c.json({ error: "Check not found" }, 404);
    }

    return c.json({ check });
  } catch (error: any) {
    console.error("[Checks] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create check/note
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.donem_id || !data.tip || !data.yon) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const id = data.id || crypto.randomUUID();
    const check = {
      ...data,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`check:${check.firma_id}:${check.donem_id}:${id}`, check);

    return c.json({
      success: true,
      check,
      message: "Check created successfully",
    });
  } catch (error: any) {
    console.error("[Checks] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update check/note
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const checks = await kv.getByPrefix(`check:`);
    const existing = checks.find((ch: any) => ch.id === id);

    if (!existing) {
      return c.json({ error: "Check not found" }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `check:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      check: updated,
      message: "Check updated successfully",
    });
  } catch (error: any) {
    console.error("[Checks] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST update status
app.post("/:id/update-status", async (c) => {
  try {
    const id = c.req.param("id");
    const { durum, tahsil_tarihi, aciklama } = await c.req.json();

    const checks = await kv.getByPrefix(`check:`);
    const existing = checks.find((ch: any) => ch.id === id);

    if (!existing) {
      return c.json({ error: "Check not found" }, 404);
    }

    const updated = {
      ...existing,
      durum,
      tahsil_tarihi,
      aciklama: aciklama || existing.aciklama,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `check:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      check: updated,
      message: "Status updated successfully",
    });
  } catch (error: any) {
    console.error("[Checks] Update status error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE check/note
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const checks = await kv.getByPrefix(`check:`);
    const existing = checks.find((ch: any) => ch.id === id);

    if (!existing) {
      return c.json({ error: "Check not found" }, 404);
    }

    await kv.del(`check:${existing.firma_id}:${existing.donem_id}:${id}`);

    return c.json({
      success: true,
      message: "Check deleted successfully",
    });
  } catch (error: any) {
    console.error("[Checks] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET expiring checks
app.get("/expiring/soon", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const days = parseInt(c.req.query("days") || "7");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    const checks = await kv.getByPrefix(`check:${firma_id}:`);
    const today = new Date();
    const futureDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

    const expiring = checks.filter((ch: any) => {
      if (ch.durum !== "PORTFOY" && ch.durum !== "BANKADA") return false;
      const vadeDate = new Date(ch.vade_tarihi);
      return vadeDate >= today && vadeDate <= futureDate;
    });

    return c.json({ checks: expiring });
  } catch (error: any) {
    console.error("[Checks] Expiring soon error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

