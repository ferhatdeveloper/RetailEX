/**
 * ExRetailOS - Current Accounts Service (Backend)
 * 
 * CRUD operations for current accounts (Cari Hesaplar)
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all current accounts
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const tip = c.req.query("tip"); // MUSTERI or TEDARIKCI
    const search = c.req.query("search");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let accounts = await kv.getByPrefix(`current-account:${firma_id}:`);

    // Filters
    if (tip) {
      accounts = accounts.filter((acc: any) => acc.tip === tip);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      accounts = accounts.filter((acc: any) => 
        acc.unvan?.toLowerCase().includes(searchLower) ||
        acc.kod?.toLowerCase().includes(searchLower) ||
        acc.vergi_no?.toLowerCase().includes(searchLower)
      );
    }

    return c.json({ accounts: accounts || [] });
  } catch (error: any) {
    console.error("[CurrentAccounts] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single current account
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const accounts = await kv.getByPrefix(`current-account:`);
    const account = accounts.find((acc: any) => acc.id === id);

    if (!account) {
      return c.json({ error: "Current account not found" }, 404);
    }

    return c.json({ account });
  } catch (error: any) {
    console.error("[CurrentAccounts] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create current account
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.unvan || !data.tip) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const id = data.id || crypto.randomUUID();
    
    // Generate kod if not provided
    const kod = data.kod || `C${Date.now().toString().slice(-6)}`;

    const account = {
      ...data,
      id,
      kod,
      bakiye: 0,
      borc_toplam: 0,
      alacak_toplam: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`current-account:${account.firma_id}:${id}`, account);

    return c.json({
      success: true,
      account,
      message: "Current account created successfully",
    });
  } catch (error: any) {
    console.error("[CurrentAccounts] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update current account
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const accounts = await kv.getByPrefix(`current-account:`);
    const existing = accounts.find((acc: any) => acc.id === id);

    if (!existing) {
      return c.json({ error: "Current account not found" }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(`current-account:${updated.firma_id}:${id}`, updated);

    return c.json({
      success: true,
      account: updated,
      message: "Current account updated successfully",
    });
  } catch (error: any) {
    console.error("[CurrentAccounts] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE current account
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const accounts = await kv.getByPrefix(`current-account:`);
    const existing = accounts.find((acc: any) => acc.id === id);

    if (!existing) {
      return c.json({ error: "Current account not found" }, 404);
    }

    // Check if account has balance
    if (existing.bakiye && Math.abs(existing.bakiye) > 0.01) {
      return c.json({ 
        error: "Cannot delete account with non-zero balance" 
      }, 400);
    }

    await kv.del(`current-account:${existing.firma_id}:${id}`);

    return c.json({
      success: true,
      message: "Current account deleted successfully",
    });
  } catch (error: any) {
    console.error("[CurrentAccounts] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET transactions for an account
app.get("/:id/transactions", async (c) => {
  try {
    const id = c.req.param("id");
    const baslangic = c.req.query("baslangic_tarihi");
    const bitis = c.req.query("bitis_tarihi");

    const transactions = await kv.getByPrefix(`current-account-transaction:${id}:`);
    
    let filtered = transactions;
    if (baslangic) {
      filtered = filtered.filter((t: any) => t.tarih >= baslangic);
    }
    if (bitis) {
      filtered = filtered.filter((t: any) => t.tarih <= bitis);
    }

    // Sort by date
    filtered.sort((a: any, b: any) => 
      new Date(a.tarih).getTime() - new Date(b.tarih).getTime()
    );

    return c.json({ transactions: filtered });
  } catch (error: any) {
    console.error("[CurrentAccounts] Transactions error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET account statement (ekstare)
app.get("/:id/statement", async (c) => {
  try {
    const id = c.req.param("id");
    const baslangic = c.req.query("baslangic_tarihi");
    const bitis = c.req.query("bitis_tarihi");

    const accounts = await kv.getByPrefix(`current-account:`);
    const account = accounts.find((acc: any) => acc.id === id);

    if (!account) {
      return c.json({ error: "Current account not found" }, 404);
    }

    const transactions = await kv.getByPrefix(`current-account-transaction:${id}:`);
    
    let filtered = transactions;
    if (baslangic) {
      filtered = filtered.filter((t: any) => t.tarih >= baslangic);
    }
    if (bitis) {
      filtered = filtered.filter((t: any) => t.tarih <= bitis);
    }

    // Sort by date
    filtered.sort((a: any, b: any) => 
      new Date(a.tarih).getTime() - new Date(b.tarih).getTime()
    );

    // Calculate running balance
    let bakiye = 0;
    const withBalance = filtered.map((t: any) => {
      bakiye += (t.borc || 0) - (t.alacak || 0);
      return { ...t, bakiye };
    });

    return c.json({ 
      account,
      transactions: withBalance,
      final_balance: bakiye
    });
  } catch (error: any) {
    console.error("[CurrentAccounts] Statement error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST add transaction to account
app.post("/:id/transactions", async (c) => {
  try {
    const account_id = c.req.param("id");
    const data = await c.req.json();

    const transaction = {
      ...data,
      id: crypto.randomUUID(),
      account_id,
      created_at: new Date().toISOString(),
    };

    await kv.set(
      `current-account-transaction:${account_id}:${transaction.id}`,
      transaction
    );

    // Update account balance
    const accounts = await kv.getByPrefix(`current-account:`);
    const account = accounts.find((acc: any) => acc.id === account_id);
    
    if (account) {
      const updated = {
        ...account,
        bakiye: (account.bakiye || 0) + (data.borc || 0) - (data.alacak || 0),
        borc_toplam: (account.borc_toplam || 0) + (data.borc || 0),
        alacak_toplam: (account.alacak_toplam || 0) + (data.alacak || 0),
        updated_at: new Date().toISOString(),
      };
      await kv.set(`current-account:${account.firma_id}:${account_id}`, updated);
    }

    return c.json({
      success: true,
      transaction,
      message: "Transaction added successfully",
    });
  } catch (error: any) {
    console.error("[CurrentAccounts] Add transaction error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

