/**
 * ExRetailOS - Quotations/Proforma Service (Backend)
 * 
 * CRUD operations for quotations and proforma invoices
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all quotations
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");
    const durum = c.req.query("durum");
    const tip = c.req.query("tip"); // TEKLIF or PROFORMA

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let prefix = `quotation:${firma_id}:`;
    if (donem_id) {
      prefix += `${donem_id}:`;
    }

    let quotations = await kv.getByPrefix(prefix);

    // Filters
    if (durum) {
      quotations = quotations.filter((q: any) => q.durum === durum);
    }
    if (tip) {
      quotations = quotations.filter((q: any) => q.tip === tip);
    }

    return c.json({ quotations: quotations || [] });
  } catch (error: any) {
    console.error("[Quotations] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single quotation
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const quotations = await kv.getByPrefix(`quotation:`);
    const quotation = quotations.find((q: any) => q.id === id);

    if (!quotation) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    return c.json({ quotation });
  } catch (error: any) {
    console.error("[Quotations] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create quotation
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.donem_id || !data.tip) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const id = data.id || crypto.randomUUID();
    
    // Generate teklif_no if not provided
    const prefix = data.tip === "TEKLIF" ? "TEK" : "PRO";
    const teklif_no = data.teklif_no || `${prefix}-${Date.now().toString().slice(-8)}`;

    const quotation = {
      ...data,
      id,
      teklif_no,
      durum: data.durum || "TASLAK",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `quotation:${quotation.firma_id}:${quotation.donem_id}:${id}`,
      quotation
    );

    return c.json({
      success: true,
      quotation,
      message: "Quotation created successfully",
    });
  } catch (error: any) {
    console.error("[Quotations] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update quotation
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const quotations = await kv.getByPrefix(`quotation:`);
    const existing = quotations.find((q: any) => q.id === id);

    if (!existing) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    if (existing.durum === "FATURAYA_DONDU") {
      return c.json({ 
        error: "Cannot update quotation that has been converted to invoice" 
      }, 400);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `quotation:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      quotation: updated,
      message: "Quotation updated successfully",
    });
  } catch (error: any) {
    console.error("[Quotations] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE quotation
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const quotations = await kv.getByPrefix(`quotation:`);
    const existing = quotations.find((q: any) => q.id === id);

    if (!existing) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    if (existing.durum === "FATURAYA_DONDU") {
      return c.json({ 
        error: "Cannot delete quotation that has been converted" 
      }, 400);
    }

    await kv.del(
      `quotation:${existing.firma_id}:${existing.donem_id}:${id}`
    );

    return c.json({
      success: true,
      message: "Quotation deleted successfully",
    });
  } catch (error: any) {
    console.error("[Quotations] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST send quotation (email/sms)
app.post("/:id/send", async (c) => {
  try {
    const id = c.req.param("id");
    const { method, recipients } = await c.req.json(); // method: EMAIL or SMS

    const quotations = await kv.getByPrefix(`quotation:`);
    const existing = quotations.find((q: any) => q.id === id);

    if (!existing) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    // Update status
    const updated = {
      ...existing,
      durum: "GONDERILDI",
      gonderim_tarihi: new Date().toISOString(),
      gonderim_yontemi: method,
      gonderim_alicilar: recipients,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `quotation:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    // TODO: Actual email/SMS sending would happen here
    // For now, just mark as sent

    return c.json({
      success: true,
      quotation: updated,
      message: `Quotation sent via ${method}`,
    });
  } catch (error: any) {
    console.error("[Quotations] Send error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST accept quotation
app.post("/:id/accept", async (c) => {
  try {
    const id = c.req.param("id");
    const { onay_notu } = await c.req.json();

    const quotations = await kv.getByPrefix(`quotation:`);
    const existing = quotations.find((q: any) => q.id === id);

    if (!existing) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    const updated = {
      ...existing,
      durum: "ONAYLANDI",
      onay_tarihi: new Date().toISOString(),
      onay_notu,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `quotation:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      quotation: updated,
      message: "Quotation accepted",
    });
  } catch (error: any) {
    console.error("[Quotations] Accept error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST reject quotation
app.post("/:id/reject", async (c) => {
  try {
    const id = c.req.param("id");
    const { red_nedeni } = await c.req.json();

    const quotations = await kv.getByPrefix(`quotation:`);
    const existing = quotations.find((q: any) => q.id === id);

    if (!existing) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    const updated = {
      ...existing,
      durum: "REDDEDILDI",
      red_tarihi: new Date().toISOString(),
      red_nedeni,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `quotation:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      quotation: updated,
      message: "Quotation rejected",
    });
  } catch (error: any) {
    console.error("[Quotations] Reject error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST convert quotation to invoice/order
app.post("/:id/convert", async (c) => {
  try {
    const id = c.req.param("id");
    const { convert_to } = await c.req.json(); // FATURA or SIPARIS

    const quotations = await kv.getByPrefix(`quotation:`);
    const existing = quotations.find((q: any) => q.id === id);

    if (!existing) {
      return c.json({ error: "Quotation not found" }, 404);
    }

    if (existing.durum !== "ONAYLANDI") {
      return c.json({ 
        error: "Only approved quotations can be converted" 
      }, 400);
    }

    // Create invoice or order
    const newDoc = {
      id: crypto.randomUUID(),
      firma_id: existing.firma_id,
      donem_id: existing.donem_id,
      tip: "SATIS",
      cari_id: existing.cari_id,
      cari_unvan: existing.cari_unvan,
      urunler: existing.urunler,
      ara_toplam: existing.ara_toplam,
      TAX_toplam: existing.TAX_toplam,
      genel_toplam: existing.genel_toplam,
      teklif_referans: existing.teklif_no,
      aciklama: `${existing.teklif_no} teklifinden dönüştürüldü`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (convert_to === "FATURA") {
      newDoc['fatura_no'] = `F-${Date.now().toString().slice(-8)}`;
      newDoc['fatura_tarihi'] = new Date().toISOString().split('T')[0];
      await kv.set(
        `invoice:${newDoc.firma_id}:${newDoc.donem_id}:${newDoc.id}`,
        newDoc
      );
    } else if (convert_to === "SIPARIS") {
      newDoc['siparis_no'] = `SIP-${Date.now().toString().slice(-8)}`;
      newDoc['siparis_tarihi'] = new Date().toISOString().split('T')[0];
      await kv.set(
        `order:${newDoc.firma_id}:${newDoc.donem_id}:${newDoc.id}`,
        newDoc
      );
    }

    // Update quotation status
    const updated = {
      ...existing,
      durum: "FATURAYA_DONDU",
      donusum_tarihi: new Date().toISOString(),
      donusum_tipi: convert_to,
      donusum_id: newDoc.id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `quotation:${updated.firma_id}:${updated.donem_id}:${id}`,
      updated
    );

    return c.json({
      success: true,
      quotation: updated,
      [convert_to.toLowerCase()]: newDoc,
      message: `Quotation converted to ${convert_to}`,
    });
  } catch (error: any) {
    console.error("[Quotations] Convert error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET quotation statistics
app.get("/stats/summary", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    const prefix = donem_id 
      ? `quotation:${firma_id}:${donem_id}:` 
      : `quotation:${firma_id}:`;
    
    const quotations = await kv.getByPrefix(prefix);

    const stats = {
      toplam: quotations.length,
      taslak: quotations.filter((q: any) => q.durum === "TASLAK").length,
      gonderildi: quotations.filter((q: any) => q.durum === "GONDERILDI").length,
      onaylandi: quotations.filter((q: any) => q.durum === "ONAYLANDI").length,
      reddedildi: quotations.filter((q: any) => q.durum === "REDDEDILDI").length,
      faturaya_dondu: quotations.filter((q: any) => q.durum === "FATURAYA_DONDU").length,
      toplam_tutar: quotations.reduce((sum: number, q: any) => 
        sum + (q.genel_toplam || 0), 0
      ),
    };

    return c.json({ stats });
  } catch (error: any) {
    console.error("[Quotations] Stats error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

