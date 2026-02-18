import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import * as accounting from "./accounting.ts";
import costAccountingRoutes from "./cost-accounting.ts";
import exchangeRatesRoutes from "./exchange-rates.tsx";
import taxRoutes from "./tax.ts";
import authRoutes from "./auth.ts";
import checksRoutes from "./checks.ts";
import currentAccountsRoutes from "./current-accounts.ts";
import kasaRoutes from "./kasa.ts";
import waybillsRoutes from "./waybills.ts";
import lotsRoutes from "./lots.ts";
import quotationsRoutes from "./quotations.ts";
import bankAccountsRoutes from "./bank-accounts.ts";
import chartOfAccountsRoutes from "./chart-of-accounts.ts";
import organizationRoutes from "./organization.ts";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-eae94dc0/health", (c) => {
  return c.json({ status: "ok" });
});

// ===== JOURNAL ENTRIES ROUTES (Using Accounting Service) =====

// POST create journal entry (Accounting Service)
app.post("/make-server-eae94dc0/accounting/journal-entries", async (c) => {
  try {
    const request = await c.req.json();
    
    console.log('[API] Creating journal entry:', {
      firma_id: request.firma_id,
      donem_id: request.donem_id,
      satirlar_count: request.satirlar?.length
    });
    
    // Call accounting service
    const result = await accounting.createJournalEntry({
      firma_id: request.firma_id,
      donem_id: request.donem_id,
      tarih: request.fis_tarihi || request.tarih,
      aciklama: request.aciklama,
      kaynak_belge_tipi: request.kaynak_belge_tipi,
      kaynak_belge_no: request.kaynak_belge_no,
      satirlar: request.satirlar
    });
    
    if (result.success) {
      console.log('[API] Journal entry created:', result.fis_no);
      return c.json({ 
        success: true,
        entry: {
          id: result.fis_id,
          fis_no: result.fis_no
        },
        message: "Journal entry created successfully" 
      });
    } else {
      console.error('[API] Journal entry error:', result.error);
      return c.json({ 
        success: false,
        error: result.error || 'Failed to create journal entry' 
      }, 400);
    }
  } catch (error: any) {
    console.error('[API] Unexpected error:', error);
    return c.json({ 
      success: false,
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

// POST sales journal (shorthand)
app.post("/make-server-eae94dc0/accounting/sales-journal", async (c) => {
  try {
    const params = await c.req.json();
    const result = await accounting.createSalesJournal(params);
    
    if (result.success) {
      return c.json({ success: true, entry: { fis_no: result.fis_no } });
    } else {
      return c.json({ success: false, error: result.error }, 400);
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// POST purchase journal (shorthand)
app.post("/make-server-eae94dc0/accounting/purchase-journal", async (c) => {
  try {
    const params = await c.req.json();
    const result = await accounting.createPurchaseJournal(params);
    
    if (result.success) {
      return c.json({ success: true, entry: { fis_no: result.fis_no } });
    } else {
      return c.json({ success: false, error: result.error }, 400);
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// GET journal entries (from database)
app.get("/make-server-eae94dc0/accounting/journal-entries", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const donem_id = c.req.query("donem_id");
    const baslangic_tarihi = c.req.query("baslangic_tarihi");
    const bitis_tarihi = c.req.query("bitis_tarihi");
    const limit = c.req.query("limit");
    
    if (!firma_id || !donem_id) {
      return c.json({ error: "firma_id and donem_id are required" }, 400);
    }
    
    const result = await accounting.listJournalEntries({
      firma_id,
      donem_id,
      baslangic_tarihi,
      bitis_tarihi,
      limit: limit ? parseInt(limit) : undefined
    });
    
    return c.json(result);
  } catch (error: any) {
    console.error('[API] List journal entries error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE journal entry
app.delete("/make-server-eae94dc0/accounting/journal-entries/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const result = await accounting.deleteJournalEntry(id);
    
    if (result.success) {
      return c.json({ success: true, message: "Journal entry deleted" });
    } else {
      return c.json({ success: false, error: result.error }, 400);
    }
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ===== COST ACCOUNTING ROUTES =====

app.route("/make-server-eae94dc0/cost-accounting", costAccountingRoutes);

// ===== EXCHANGE RATES ROUTES =====

app.route("/make-server-eae94dc0/exchange-rates", exchangeRatesRoutes);

// ===== TAX ROUTES =====

app.route("/make-server-eae94dc0/tax", taxRoutes);

// ===== AUTHENTICATION ROUTES =====

app.route("/make-server-eae94dc0/auth", authRoutes);

// ===== CHECKS ROUTES =====

app.route("/make-server-eae94dc0/checks", checksRoutes);

// ===== CURRENT ACCOUNTS ROUTES =====

app.route("/make-server-eae94dc0/current-accounts", currentAccountsRoutes);

// ===== KASA ROUTES =====

app.route("/make-server-eae94dc0/kasa", kasaRoutes);

// ===== WAYBILLS ROUTES =====

app.route("/make-server-eae94dc0/waybills", waybillsRoutes);

// ===== LOTS ROUTES =====

app.route("/make-server-eae94dc0/lots", lotsRoutes);

// ===== QUOTATIONS ROUTES =====

app.route("/make-server-eae94dc0/quotations", quotationsRoutes);

// ===== BANK ACCOUNTS ROUTES =====

app.route("/make-server-eae94dc0/bank-accounts", bankAccountsRoutes);

// ===== CHART OF ACCOUNTS ROUTES =====

app.route("/make-server-eae94dc0/chart-of-accounts", chartOfAccountsRoutes);

// ===== ORGANIZATION ROUTES =====

app.route("/make-server-eae94dc0/organization", organizationRoutes);

// ===== OLD KV STORE ROUTES (Keep for backward compatibility) =====

// GET journal entries
app.get("/make-server-eae94dc0/journal-entries", async (c) => {
  try {
    const firmaId = c.req.query("firma_id");
    const donemId = c.req.query("donem_id");
    
    if (firmaId && donemId) {
      const entries = await kv.getByPrefix(`journal:${firmaId}:${donemId}:`);
      return c.json({ entries: entries || [] });
    } else if (firmaId) {
      const entries = await kv.getByPrefix(`journal:${firmaId}:`);
      return c.json({ entries: entries || [] });
    } else {
      const entries = await kv.getByPrefix("journal:");
      return c.json({ entries: entries || [] });
    }
  } catch (error) {
    console.error("Error fetching journal entries:", error);
    return c.json({ error: "Failed to fetch journal entries" }, 500);
  }
});

// GET single journal entry
app.get("/make-server-eae94dc0/journal-entries/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const entries = await kv.getByPrefix(`journal:`);
    const entry = entries.find((e: any) => e.id === id);
    if (!entry) {
      return c.json({ error: "Journal entry not found" }, 404);
    }
    return c.json({ entry });
  } catch (error) {
    console.error("Error fetching journal entry:", error);
    return c.json({ error: "Failed to fetch journal entry" }, 500);
  }
});

// POST create journal entry
app.post("/make-server-eae94dc0/journal-entries", async (c) => {
  try {
    const entry = await c.req.json();
    const id = entry.id || crypto.randomUUID();
    
    // Validate balance
    const totalBorc = entry.lines?.reduce((sum: number, line: any) => sum + (line.borc || 0), 0) || 0;
    const totalAlacak = entry.lines?.reduce((sum: number, line: any) => sum + (line.alacak || 0), 0) || 0;
    
    if (Math.abs(totalBorc - totalAlacak) > 0.01) {
      return c.json({ 
        error: `Yörü dengesi tutmuyor. Borç: ${totalBorc}, Alacak: ${totalAlacak}` 
      }, 400);
    }
    
    const newEntry = {
      ...entry,
      id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    await kv.set(`journal:${newEntry.firma_id}:${newEntry.donem_id}:${id}`, newEntry);
    return c.json({ entry: newEntry, message: "Journal entry created successfully" });
  } catch (error) {
    console.error("Error creating journal entry:", error);
    return c.json({ error: "Failed to create journal entry" }, 500);
  }
});

// PUT update journal entry
app.put("/make-server-eae94dc0/journal-entries/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();
    const entries = await kv.getByPrefix(`journal:`);
    const existing = entries.find((e: any) => e.id === id);
    if (!existing) {
      return c.json({ error: "Journal entry not found" }, 404);
    }
    
    // Validate balance if lines updated
    if (updates.lines) {
      const totalBorc = updates.lines.reduce((sum: number, line: any) => sum + (line.borc || 0), 0);
      const totalAlacak = updates.lines.reduce((sum: number, line: any) => sum + (line.alacak || 0), 0);
      
      if (Math.abs(totalBorc - totalAlacak) > 0.01) {
        return c.json({ 
          error: `Yörü dengesi tutmuyor. Borç: ${totalBorc}, Alacak: ${totalAlacak}` 
        }, 400);
      }
    }
    
    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };
    
    await kv.set(`journal:${updated.firma_id}:${updated.donem_id}:${id}`, updated);
    return c.json({ entry: updated, message: "Journal entry updated successfully" });
  } catch (error) {
    console.error("Error updating journal entry:", error);
    return c.json({ error: "Failed to update journal entry" }, 500);
  }
});

// DELETE journal entry
app.delete("/make-server-eae94dc0/journal-entries/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const entries = await kv.getByPrefix(`journal:`);
    const existing = entries.find((e: any) => e.id === id);
    if (!existing) {
      return c.json({ error: "Journal entry not found" }, 404);
    }
    
    await kv.del(`journal:${existing.firma_id}:${existing.donem_id}:${id}`);
    return c.json({ message: "Journal entry deleted successfully" });
  } catch (error) {
    console.error("Error deleting journal entry:", error);
    return c.json({ error: "Failed to delete journal entry" }, 500);
  }
});

// GET mizan (trial balance)
app.get("/make-server-eae94dc0/mizan", async (c) => {
  try {
    const firmaId = c.req.query("firma_id");
    const donemId = c.req.query("donem_id");
    
    if (!firmaId || !donemId) {
      return c.json({ error: "firma_id and donem_id are required" }, 400);
    }
    
    const entries = await kv.getByPrefix(`journal:${firmaId}:${donemId}:`);
    
    // Calculate balances per account
    const accountBalances: { [key: string]: { borc: number; alacak: number } } = {};
    
    entries.forEach((entry: any) => {
      entry.lines?.forEach((line: any) => {
        if (!accountBalances[line.hesap_kodu]) {
          accountBalances[line.hesap_kodu] = { borc: 0, alacak: 0 };
        }
        accountBalances[line.hesap_kodu].borc += line.borc || 0;
        accountBalances[line.hesap_kodu].alacak += line.alacak || 0;
      });
    });
    
    const mizan = Object.entries(accountBalances).map(([hesap_kodu, { borc, alacak }]) => ({
      hesap_kodu,
      borc,
      alacak,
      bakiye: borc - alacak,
    }));
    
    return c.json({ mizan });
  } catch (error) {
    console.error("Error calculating mizan:", error);
    return c.json({ error: "Failed to calculate mizan" }, 500);
  }
});

// ===== BROADCAST ROUTES =====

// GET all broadcasts
app.get("/make-server-eae94dc0/broadcasts", async (c) => {
  try {
    const broadcasts = await kv.getByPrefix("broadcast:");
    return c.json({ broadcasts: broadcasts || [] });
  } catch (error) {
    console.error("Error fetching broadcasts:", error);
    return c.json({ error: "Failed to fetch broadcasts" }, 500);
  }
});

// GET single broadcast
app.get("/make-server-eae94dc0/broadcasts/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const broadcast = await kv.get(`broadcast:${id}`);
    if (!broadcast) {
      return c.json({ error: "Broadcast not found" }, 404);
    }
    return c.json({ broadcast });
  } catch (error) {
    console.error("Error fetching broadcast:", error);
    return c.json({ error: "Failed to fetch broadcast" }, 500);
  }
});

// POST create broadcast
app.post("/make-server-eae94dc0/broadcasts", async (c) => {
  try {
    const broadcast = await c.req.json();
    const id = broadcast.id || crypto.randomUUID();
    const newBroadcast = {
      ...broadcast,
      id,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`broadcast:${id}`, newBroadcast);
    return c.json({ broadcast: newBroadcast, message: "Broadcast created successfully" });
  } catch (error) {
    console.error("Error creating broadcast:", error);
    return c.json({ error: "Failed to create broadcast" }, 500);
  }
});

// POST pull action (store requests data)
app.post("/make-server-eae94dc0/broadcasts/pull", async (c) => {
  try {
    const pullRequest = await c.req.json();
    const id = crypto.randomUUID();
    const newPull = {
      ...pullRequest,
      id,
      type: 'pull',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await kv.set(`broadcast:${id}`, newPull);
    return c.json({ pull: newPull, message: "Pull request created successfully" });
  } catch (error) {
    console.error("Error creating pull request:", error);
    return c.json({ error: "Failed to create pull request" }, 500);
  }
});

// PUT update broadcast status
app.put("/make-server-eae94dc0/broadcasts/:id/status", async (c) => {
  try {
    const id = c.req.param("id");
    const { status, store_id } = await c.req.json();
    const broadcast = await kv.get(`broadcast:${id}`);
    if (!broadcast) {
      return c.json({ error: "Broadcast not found" }, 404);
    }
    
    const deliveredStores = broadcast.delivered_stores || [];
    const updated = {
      ...broadcast,
      status,
      delivered_stores: store_id && !deliveredStores.includes(store_id) 
        ? [...deliveredStores, store_id] 
        : deliveredStores,
      updated_at: new Date().toISOString(),
    };
    
    await kv.set(`broadcast:${id}`, updated);
    return c.json({ broadcast: updated, message: "Broadcast status updated" });
  } catch (error) {
    console.error("Error updating broadcast status:", error);
    return c.json({ error: "Failed to update broadcast status" }, 500);
  }
});

// ===== CAMPAIGNS ROUTES =====

// GET all campaigns
app.get("/make-server-eae94dc0/campaigns", async (c) => {
  try {
    const campaigns = await kv.getByPrefix("campaign:");
    return c.json({ campaigns: campaigns || [] });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    return c.json({ error: "Failed to fetch campaigns" }, 500);
  }
});

// POST create campaign
app.post("/make-server-eae94dc0/campaigns", async (c) => {
  try {
    const campaign = await c.req.json();
    await kv.set(`campaign:${campaign.id}`, campaign);
    return c.json({ campaign, message: "Campaign created successfully" });
  } catch (error) {
    console.error("Error creating campaign:", error);
    return c.json({ error: "Failed to create campaign" }, 500);
  }
});

// PUT update campaign
app.put("/make-server-eae94dc0/campaigns/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const campaign = await c.req.json();
    await kv.set(`campaign:${id}`, campaign);
    return c.json({ campaign, message: "Campaign updated successfully" });
  } catch (error) {
    console.error("Error updating campaign:", error);
    return c.json({ error: "Failed to update campaign" }, 500);
  }
});

// DELETE campaign
app.delete("/make-server-eae94dc0/campaigns/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await kv.del(`campaign:${id}`);
    return c.json({ message: "Campaign deleted successfully" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return c.json({ error: "Failed to delete campaign" }, 500);
  }
});

Deno.serve(app.fetch);
