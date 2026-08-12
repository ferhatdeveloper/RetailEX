/**
 * ExRetailOS - Organization Routes (Firma, Dönem, Mağaza, Şube)
 * Supabase PostgreSQL tabloları ile çalışır
 */

import { Hono } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const app = new Hono();

// Supabase Client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// =====================================================
// FIRMALAR ROUTES
// =====================================================

/**
 * GET /firmalar - Tüm firmaları listele
 */
app.get("/firmalar", async (c) => {
  try {
    const { data: firmalar, error } = await supabase
      .from("firmalar")
      .select("*")
      .order("firma_kodu", { ascending: true });

    if (error) throw error;

    return c.json({ firmalar: firmalar || [] });
  } catch (error: any) {
    console.error("Error fetching firmalar:", error);
    return c.json({ error: error.message || "Failed to fetch firmalar" }, 500);
  }
});

/**
 * GET /firmalar/:id - Tek firma detayı
 */
app.get("/firmalar/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const { data: firma, error } = await supabase
      .from("firmalar")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!firma) return c.json({ error: "Firma not found" }, 404);

    return c.json({ firma });
  } catch (error: any) {
    console.error("Error fetching firma:", error);
    return c.json({ error: error.message || "Failed to fetch firma" }, 500);
  }
});

/**
 * GET /firmalar/default - Varsayılan firmayı getir
 */
app.get("/firmalar/default/get", async (c) => {
  try {
    const { data: firma, error } = await supabase
      .from("firmalar")
      .select("*")
      .eq("varsayilan", true)
      .eq("aktif", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    // Varsayılan yoksa ilk firmayı al
    if (!firma) {
      const { data: firstFirma } = await supabase
        .from("firmalar")
        .select("*")
        .eq("aktif", true)
        .order("firma_kodu", { ascending: true })
        .limit(1)
        .single();
      
      return c.json({ firma: firstFirma });
    }

    return c.json({ firma });
  } catch (error: any) {
    console.error("Error fetching default firma:", error);
    return c.json({ error: error.message || "Failed to fetch default firma" }, 500);
  }
});

/**
 * POST /firmalar - Yeni firma oluştur
 */
app.post("/firmalar", async (c) => {
  try {
    const body = await c.req.json();
    
    const { data: firma, error } = await supabase
      .from("firmalar")
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return c.json({ firma }, 201);
  } catch (error: any) {
    console.error("Error creating firma:", error);
    return c.json({ error: error.message || "Failed to create firma" }, 500);
  }
});

/**
 * PUT /firmalar/:id - Firmayı güncelle
 */
app.put("/firmalar/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const { data: firma, error } = await supabase
      .from("firmalar")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ firma });
  } catch (error: any) {
    console.error("Error updating firma:", error);
    return c.json({ error: error.message || "Failed to update firma" }, 500);
  }
});

/**
 * DELETE /firmalar/:id - Firmayı sil
 */
app.delete("/firmalar/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const { error } = await supabase
      .from("firmalar")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return c.json({ message: "Firma deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting firma:", error);
    return c.json({ error: error.message || "Failed to delete firma" }, 500);
  }
});

// =====================================================
// DÖNEMLER ROUTES
// =====================================================

/**
 * GET /donemler - Tüm dönemleri listele (firma_id filter ile)
 */
app.get("/donemler", async (c) => {
  try {
    const firmaId = c.req.query("firma_id");
    
    let query = supabase
      .from("donemler")
      .select("*")
      .order("baslangic_tarihi", { ascending: false });
    
    if (firmaId) {
      query = query.eq("firma_id", firmaId);
    }

    const { data: donemler, error } = await query;

    if (error) throw error;

    return c.json({ donemler: donemler || [] });
  } catch (error: any) {
    console.error("Error fetching donemler:", error);
    return c.json({ error: error.message || "Failed to fetch donemler" }, 500);
  }
});

/**
 * GET /donemler/:id - Tek dönem detayı
 */
app.get("/donemler/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const { data: donem, error } = await supabase
      .from("donemler")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!donem) return c.json({ error: "Donem not found" }, 404);

    return c.json({ donem });
  } catch (error: any) {
    console.error("Error fetching donem:", error);
    return c.json({ error: error.message || "Failed to fetch donem" }, 500);
  }
});

/**
 * GET /donemler/default/:firma_id - Firma için varsayılan dönemi getir
 */
app.get("/donemler/default/:firma_id", async (c) => {
  try {
    const firmaId = c.req.param("firma_id");
    
    const { data: donem, error } = await supabase
      .from("donemler")
      .select("*")
      .eq("firma_id", firmaId)
      .eq("varsayilan", true)
      .eq("durum", "acik")
      .single();

    if (error && error.code !== "PGRST116") throw error;

    // Varsayılan yoksa açık ilk dönemi al
    if (!donem) {
      const { data: firstDonem } = await supabase
        .from("donemler")
        .select("*")
        .eq("firma_id", firmaId)
        .eq("durum", "acik")
        .order("baslangic_tarihi", { ascending: false })
        .limit(1)
        .single();
      
      return c.json({ donem: firstDonem });
    }

    return c.json({ donem });
  } catch (error: any) {
    console.error("Error fetching default donem:", error);
    return c.json({ error: error.message || "Failed to fetch default donem" }, 500);
  }
});

/**
 * POST /donemler - Yeni dönem oluştur
 */
app.post("/donemler", async (c) => {
  try {
    const body = await c.req.json();
    
    const { data: donem, error } = await supabase
      .from("donemler")
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return c.json({ donem }, 201);
  } catch (error: any) {
    console.error("Error creating donem:", error);
    return c.json({ error: error.message || "Failed to create donem" }, 500);
  }
});

/**
 * PUT /donemler/:id - Dönemi güncelle
 */
app.put("/donemler/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const { data: donem, error } = await supabase
      .from("donemler")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ donem });
  } catch (error: any) {
    console.error("Error updating donem:", error);
    return c.json({ error: error.message || "Failed to update donem" }, 500);
  }
});

/**
 * POST /donemler/:id/close - Dönemi kapat
 */
app.post("/donemler/:id/close", async (c) => {
  try {
    const id = c.req.param("id");
    
    const { data: donem, error } = await supabase
      .from("donemler")
      .update({ 
        durum: "kapali",
        kapanma_tarihi: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ donem });
  } catch (error: any) {
    console.error("Error closing donem:", error);
    return c.json({ error: error.message || "Failed to close donem" }, 500);
  }
});

/**
 * POST /donemler/:id/close-month - Ay kapat
 */
app.post("/donemler/:id/close-month", async (c) => {
  try {
    const id = c.req.param("id");
    const { ay } = await c.req.json();
    
    // Önce mevcut dönemi al
    const { data: existing, error: fetchError } = await supabase
      .from("donemler")
      .select("kapali_aylar")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    const kapaliAylar = existing.kapali_aylar || [];
    if (!kapaliAylar.includes(ay)) {
      kapaliAylar.push(ay);
    }

    const { data: donem, error } = await supabase
      .from("donemler")
      .update({ kapali_aylar: kapaliAylar })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ donem });
  } catch (error: any) {
    console.error("Error closing month:", error);
    return c.json({ error: error.message || "Failed to close month" }, 500);
  }
});

// =====================================================
// MAĞAZALAR ROUTES
// =====================================================

/**
 * GET /magazalar - Tüm mağazaları listele (firma_id filter ile)
 */
app.get("/magazalar", async (c) => {
  try {
    const firmaId = c.req.query("firma_id");
    
    let query = supabase
      .from("magazalar")
      .select("*")
      .order("magaza_kodu", { ascending: true });
    
    if (firmaId) {
      query = query.eq("firma_id", firmaId);
    }

    const { data: magazalar, error } = await query;

    if (error) throw error;

    return c.json({ magazalar: magazalar || [] });
  } catch (error: any) {
    console.error("Error fetching magazalar:", error);
    return c.json({ error: error.message || "Failed to fetch magazalar" }, 500);
  }
});

/**
 * GET /magazalar/:id - Tek mağaza detayı
 */
app.get("/magazalar/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const { data: magaza, error } = await supabase
      .from("magazalar")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!magaza) return c.json({ error: "Magaza not found" }, 404);

    return c.json({ magaza });
  } catch (error: any) {
    console.error("Error fetching magaza:", error);
    return c.json({ error: error.message || "Failed to fetch magaza" }, 500);
  }
});

/**
 * GET /magazalar/default/:firma_id - Firma için varsayılan mağazayı getir
 */
app.get("/magazalar/default/:firma_id", async (c) => {
  try {
    const firmaId = c.req.param("firma_id");
    
    const { data: magaza, error } = await supabase
      .from("magazalar")
      .select("*")
      .eq("firma_id", firmaId)
      .eq("varsayilan", true)
      .eq("aktif", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    // Varsayılan yoksa ilk mağazayı al
    if (!magaza) {
      const { data: firstMagaza } = await supabase
        .from("magazalar")
        .select("*")
        .eq("firma_id", firmaId)
        .eq("aktif", true)
        .order("magaza_kodu", { ascending: true })
        .limit(1)
        .single();
      
      return c.json({ magaza: firstMagaza });
    }

    return c.json({ magaza });
  } catch (error: any) {
    console.error("Error fetching default magaza:", error);
    return c.json({ error: error.message || "Failed to fetch default magaza" }, 500);
  }
});

/**
 * POST /magazalar - Yeni mağaza oluştur
 */
app.post("/magazalar", async (c) => {
  try {
    const body = await c.req.json();
    
    const { data: magaza, error } = await supabase
      .from("magazalar")
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return c.json({ magaza }, 201);
  } catch (error: any) {
    console.error("Error creating magaza:", error);
    return c.json({ error: error.message || "Failed to create magaza" }, 500);
  }
});

/**
 * PUT /magazalar/:id - Mağazayı güncelle
 */
app.put("/magazalar/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const { data: magaza, error } = await supabase
      .from("magazalar")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ magaza });
  } catch (error: any) {
    console.error("Error updating magaza:", error);
    return c.json({ error: error.message || "Failed to update magaza" }, 500);
  }
});

// =====================================================
// ŞUBELER ROUTES
// =====================================================

/**
 * GET /subeler - Tüm şubeleri listele (magaza_id filter ile)
 */
app.get("/subeler", async (c) => {
  try {
    const magazaId = c.req.query("magaza_id");
    
    let query = supabase
      .from("subeler")
      .select("*")
      .order("sube_kodu", { ascending: true });
    
    if (magazaId) {
      query = query.eq("magaza_id", magazaId);
    }

    const { data: subeler, error } = await query;

    if (error) throw error;

    return c.json({ subeler: subeler || [] });
  } catch (error: any) {
    console.error("Error fetching subeler:", error);
    return c.json({ error: error.message || "Failed to fetch subeler" }, 500);
  }
});

/**
 * GET /subeler/:id - Tek şube detayı
 */
app.get("/subeler/:id", async (c) => {
  try {
    const id = c.req.param("id");
    
    const { data: sube, error } = await supabase
      .from("subeler")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    if (!sube) return c.json({ error: "Sube not found" }, 404);

    return c.json({ sube });
  } catch (error: any) {
    console.error("Error fetching sube:", error);
    return c.json({ error: error.message || "Failed to fetch sube" }, 500);
  }
});

/**
 * GET /subeler/default/:magaza_id - Mağaza için varsayılan şubeyi getir
 */
app.get("/subeler/default/:magaza_id", async (c) => {
  try {
    const magazaId = c.req.param("magaza_id");
    
    const { data: sube, error } = await supabase
      .from("subeler")
      .select("*")
      .eq("magaza_id", magazaId)
      .eq("varsayilan", true)
      .eq("aktif", true)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    // Varsayılan yoksa ilk şubeyi al
    if (!sube) {
      const { data: firstSube } = await supabase
        .from("subeler")
        .select("*")
        .eq("magaza_id", magazaId)
        .eq("aktif", true)
        .order("sube_kodu", { ascending: true })
        .limit(1)
        .single();
      
      return c.json({ sube: firstSube });
    }

    return c.json({ sube });
  } catch (error: any) {
    console.error("Error fetching default sube:", error);
    return c.json({ error: error.message || "Failed to fetch default sube" }, 500);
  }
});

/**
 * POST /subeler - Yeni şube oluştur
 */
app.post("/subeler", async (c) => {
  try {
    const body = await c.req.json();
    
    const { data: sube, error } = await supabase
      .from("subeler")
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return c.json({ sube }, 201);
  } catch (error: any) {
    console.error("Error creating sube:", error);
    return c.json({ error: error.message || "Failed to create sube" }, 500);
  }
});

/**
 * PUT /subeler/:id - Şubeyi güncelle
 */
app.put("/subeler/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    
    const { data: sube, error } = await supabase
      .from("subeler")
      .update(body)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return c.json({ sube });
  } catch (error: any) {
    console.error("Error updating sube:", error);
    return c.json({ error: error.message || "Failed to update sube" }, 500);
  }
});

export default app;

