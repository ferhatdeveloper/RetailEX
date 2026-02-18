/**
 * ExRetailOS - Waybills Service (Backend)
 * 
 * CRUD operations for waybills (İrsaliyeler)
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all waybills
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");
    const tip = c.req.query("tip"); // ALIS, SATIS, TRANSFER
    const durum = c.req.query("durum");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let prefix = `waybill:${firma_id}:`;
    if (donem_id) {
      prefix += `${donem_id}:`;
    }

    let waybills = await kv.getByPrefix(prefix);

    // Filters
    if (tip) {
      waybills = waybills.filter((wb: any) => wb.tip === tip);
    }
    if (durum) {
      waybills = waybills.filter((wb: any) => wb.durum === durum);
    }

    return c.json({ waybills: waybills || [] });
  } catch (error: any) {
    console.error("[Waybills] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single waybill
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const waybills = await kv.getByPrefix(`waybill:`);
    const waybill = waybills.find((wb: any) => wb.id === id);

    if (!waybill) {
      return c.json({ error: "Waybill not found" }, 404);
    }

    return c.json({ waybill });
  } catch (error: any) {
    console.error("[Waybills] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create waybill
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.donem_id || !data.tip) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const id = data.id || crypto.randomUUID();
    
    // Generate irsaliye_no if not provided
    const irsaliye_no = data.irsaliye_no || `IRS-${Date.now().toString().slice(-8)}`;

    const waybill = {
      ...data,
      id,
      irsaliye_no,
      durum: data.durum || "BEKLEMEDE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`waybill:${waybill.firma_id}:${waybill.donem_id}:${id}`, waybill);

    // Update stock if needed (based on tip and durum)
    if (data.urunler && data.urunler.length > 0) {
      for (const urun of data.urunler) {
        await updateStockFromWaybill(waybill, urun);
      }
    }

    return c.json({
      success: true,
      waybill,
      message: "Waybill created successfully",
    });
  } catch (error: any) {
    console.error("[Waybills] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update waybill
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const waybills = await kv.getByPrefix(`waybill:`);
    const existing = waybills.find((wb: any) => wb.id === id);

    if (!existing) {
      return c.json({ error: "Waybill not found" }, 404);
    }

    if (existing.durum === "FATURAYA_DONDU") {
      return c.json({ 
        error: "Cannot update waybill that has been converted to invoice" 
      }, 400);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `waybill:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      waybill: updated,
      message: "Waybill updated successfully",
    });
  } catch (error: any) {
    console.error("[Waybills] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE waybill
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const waybills = await kv.getByPrefix(`waybill:`);
    const existing = waybills.find((wb: any) => wb.id === id);

    if (!existing) {
      return c.json({ error: "Waybill not found" }, 404);
    }

    if (existing.durum === "FATURAYA_DONDU") {
      return c.json({ 
        error: "Cannot delete waybill that has been converted to invoice" 
      }, 400);
    }

    await kv.del(`waybill:${existing.firma_id}:${existing.donem_id}:${id}`);

    return c.json({
      success: true,
      message: "Waybill deleted successfully",
    });
  } catch (error: any) {
    console.error("[Waybills] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST convert waybill to invoice
app.post("/:id/convert-to-invoice", async (c) => {
  try {
    const id = c.req.param("id");

    const waybills = await kv.getByPrefix(`waybill:`);
    const existing = waybills.find((wb: any) => wb.id === id);

    if (!existing) {
      return c.json({ error: "Waybill not found" }, 404);
    }

    if (existing.durum === "FATURAYA_DONDU") {
      return c.json({ error: "Waybill already converted to invoice" }, 400);
    }

    // Create invoice from waybill
    const invoice = {
      id: crypto.randomUUID(),
      firma_id: existing.firma_id,
      donem_id: existing.donem_id,
      tip: existing.tip === "ALIS" ? "ALIS" : "SATIS",
      fatura_no: `F-${Date.now().toString().slice(-8)}`,
      fatura_tarihi: new Date().toISOString().split('T')[0],
      cari_id: existing.cari_id,
      cari_unvan: existing.cari_unvan,
      urunler: existing.urunler,
      ara_toplam: existing.ara_toplam,
      TAX_toplam: existing.TAX_toplam,
      genel_toplam: existing.genel_toplam,
      odeme_sekli: "VADELI",
      irsaliye_referans: existing.irsaliye_no,
      aciklama: `${existing.irsaliye_no} irsaliyesinden dönüştürüldü`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `invoice:${invoice.firma_id}:${invoice.donem_id}:${invoice.id}`,
      invoice
    );

    // Update waybill status
    const updated = {
      ...existing,
      durum: "FATURAYA_DONDU",
      fatura_id: invoice.id,
      fatura_no: invoice.fatura_no,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `waybill:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      invoice,
      waybill: updated,
      message: "Waybill converted to invoice successfully",
    });
  } catch (error: any) {
    console.error("[Waybills] Convert error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Helper: Update stock from waybill
async function updateStockFromWaybill(waybill: any, urun: any) {
  try {
    const products = await kv.getByPrefix(`product:${waybill.firma_id}:`);
    const product = products.find((p: any) => p.id === urun.urun_id);
    
    if (!product) return;

    let stokChange = 0;
    
    // Calculate stock change based on waybill type
    if (waybill.tip === "ALIS" && waybill.durum === "ONAYLANDI") {
      stokChange = urun.miktar; // Increase stock
    } else if (waybill.tip === "SATIS" && waybill.durum === "ONAYLANDI") {
      stokChange = -urun.miktar; // Decrease stock
    }

    if (stokChange !== 0) {
      const updated = {
        ...product,
        stok: (product.stok || 0) + stokChange,
        updated_at: new Date().toISOString(),
      };
      await kv.set(`product:${waybill.firma_id}:${product.id}`, updated);
    }
  } catch (error) {
    console.error("[Waybills] Update stock error:", error);
  }
}

export default app;

