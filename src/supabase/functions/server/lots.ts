/**
 * ExRetailOS - Lot/Serial Tracking Service (Backend)
 * 
 * CRUD operations for lot and serial number tracking
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all lots
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const product_id = c.req.query("product_id");
    const depo_id = c.req.query("depo_id");
    const durum = c.req.query("durum");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let prefix = `lot:${firma_id}:`;
    if (product_id) {
      prefix += `${product_id}:`;
    }

    let lots = await kv.getByPrefix(prefix);

    // Filters
    if (depo_id) {
      lots = lots.filter((lot: any) => lot.depo_id === depo_id);
    }
    if (durum) {
      lots = lots.filter((lot: any) => lot.durum === durum);
    }

    return c.json({ lots: lots || [] });
  } catch (error: any) {
    console.error("[Lots] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single lot
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const lots = await kv.getByPrefix(`lot:`);
    const lot = lots.find((l: any) => l.id === id);

    if (!lot) {
      return c.json({ error: "Lot not found" }, 404);
    }

    return c.json({ lot });
  } catch (error: any) {
    console.error("[Lots] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create lot
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.urun_id || !data.lot_no) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const id = data.id || crypto.randomUUID();

    const lot = {
      ...data,
      id,
      miktar: data.miktar || 0,
      durum: data.durum || "AKTIF",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`lot:${lot.firma_id}:${lot.urun_id}:${id}`, lot);

    return c.json({
      success: true,
      lot,
      message: "Lot created successfully",
    });
  } catch (error: any) {
    console.error("[Lots] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update lot
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const lots = await kv.getByPrefix(`lot:`);
    const existing = lots.find((l: any) => l.id === id);

    if (!existing) {
      return c.json({ error: "Lot not found" }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `lot:${updated.firma_id}:${updated.urun_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      lot: updated,
      message: "Lot updated successfully",
    });
  } catch (error: any) {
    console.error("[Lots] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE lot
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const lots = await kv.getByPrefix(`lot:`);
    const existing = lots.find((l: any) => l.id === id);

    if (!existing) {
      return c.json({ error: "Lot not found" }, 404);
    }

    if (existing.miktar > 0) {
      return c.json({ 
        error: "Cannot delete lot with remaining quantity" 
      }, 400);
    }

    await kv.del(`lot:${existing.firma_id}:${existing.urun_id}:${id}`);

    return c.json({
      success: true,
      message: "Lot deleted successfully",
    });
  } catch (error: any) {
    console.error("[Lots] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST lot movement (add/subtract quantity)
app.post("/:id/movement", async (c) => {
  try {
    const id = c.req.param("id");
    const { miktar, hareket_tipi, aciklama, belge_no } = await c.req.json();

    const lots = await kv.getByPrefix(`lot:`);
    const existing = lots.find((l: any) => l.id === id);

    if (!existing) {
      return c.json({ error: "Lot not found" }, 404);
    }

    // Calculate new quantity
    let yeniMiktar = existing.miktar || 0;
    if (hareket_tipi === "GIRIS") {
      yeniMiktar += miktar;
    } else if (hareket_tipi === "CIKIS") {
      yeniMiktar -= miktar;
    }

    if (yeniMiktar < 0) {
      return c.json({ error: "Insufficient lot quantity" }, 400);
    }

    // Update lot
    const updated = {
      ...existing,
      miktar: yeniMiktar,
      durum: yeniMiktar === 0 ? "TUKENDI" : "AKTIF",
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `lot:${updated.firma_id}:${updated.urun_id}:${id}`,
      updated
    );

    // Create movement record
    const movement = {
      id: crypto.randomUUID(),
      lot_id: id,
      firma_id: existing.firma_id,
      hareket_tipi,
      miktar,
      onceki_miktar: existing.miktar,
      yeni_miktar: yeniMiktar,
      aciklama,
      belge_no,
      created_at: new Date().toISOString(),
    };

    await kv.set(
      `lot-movement:${id}:${movement.id}`,
      movement
    );

    return c.json({
      success: true,
      lot: updated,
      movement,
      message: "Lot movement recorded successfully",
    });
  } catch (error: any) {
    console.error("[Lots] Movement error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET expiring soon lots
app.get("/expiring/soon", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const days = parseInt(c.req.query("days") || "30");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    const lots = await kv.getByPrefix(`lot:${firma_id}:`);
    const today = new Date();
    const futureDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);

    const expiring = lots.filter((lot: any) => {
      if (!lot.skt || lot.durum !== "AKTIF" || lot.miktar <= 0) return false;
      const sktDate = new Date(lot.skt);
      return sktDate >= today && sktDate <= futureDate;
    });

    // Sort by SKT date
    expiring.sort((a: any, b: any) => 
      new Date(a.skt).getTime() - new Date(b.skt).getTime()
    );

    return c.json({ lots: expiring });
  } catch (error: any) {
    console.error("[Lots] Expiring soon error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET expired lots
app.get("/expired/list", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    const lots = await kv.getByPrefix(`lot:${firma_id}:`);
    const today = new Date();

    const expired = lots.filter((lot: any) => {
      if (!lot.skt || lot.durum !== "AKTIF" || lot.miktar <= 0) return false;
      const sktDate = new Date(lot.skt);
      return sktDate < today;
    });

    return c.json({ lots: expired });
  } catch (error: any) {
    console.error("[Lots] Expired list error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET lot movements
app.get("/:id/movements", async (c) => {
  try {
    const id = c.req.param("id");
    const movements = await kv.getByPrefix(`lot-movement:${id}:`);

    // Sort by date descending
    movements.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return c.json({ movements: movements || [] });
  } catch (error: any) {
    console.error("[Lots] Movements error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;


