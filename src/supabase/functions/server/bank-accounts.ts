/**
 * ExRetailOS - Bank Accounts Service (Backend)
 * 
 * CRUD operations for bank accounts and transactions
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all bank accounts
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const banka_adi = c.req.query("banka_adi");
    const para_birimi = c.req.query("para_birimi");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let accounts = await kv.getByPrefix(`bank-account:${firma_id}:`);

    // Filters
    if (banka_adi) {
      accounts = accounts.filter((acc: any) => acc.banka_adi === banka_adi);
    }
    if (para_birimi) {
      accounts = accounts.filter((acc: any) => acc.para_birimi === para_birimi);
    }

    return c.json({ accounts: accounts || [] });
  } catch (error: any) {
    console.error("[BankAccounts] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single bank account
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const accounts = await kv.getByPrefix(`bank-account:`);
    const account = accounts.find((acc: any) => acc.id === id);

    if (!account) {
      return c.json({ error: "Bank account not found" }, 404);
    }

    return c.json({ account });
  } catch (error: any) {
    console.error("[BankAccounts] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create bank account
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.banka_adi || !data.hesap_no) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const id = data.id || crypto.randomUUID();

    const account = {
      ...data,
      id,
      bakiye: data.bakiye || 0,
      durum: data.durum || "AKTIF",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`bank-account:${account.firma_id}:${id}`, account);

    return c.json({
      success: true,
      account,
      message: "Bank account created successfully",
    });
  } catch (error: any) {
    console.error("[BankAccounts] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update bank account
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const accounts = await kv.getByPrefix(`bank-account:`);
    const existing = accounts.find((acc: any) => acc.id === id);

    if (!existing) {
      return c.json({ error: "Bank account not found" }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(`bank-account:${updated.firma_id}:${id}`, updated);

    return c.json({
      success: true,
      account: updated,
      message: "Bank account updated successfully",
    });
  } catch (error: any) {
    console.error("[BankAccounts] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE bank account
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const accounts = await kv.getByPrefix(`bank-account:`);
    const existing = accounts.find((acc: any) => acc.id === id);

    if (!existing) {
      return c.json({ error: "Bank account not found" }, 404);
    }

    // Check if account has balance
    if (existing.bakiye && Math.abs(existing.bakiye) > 0.01) {
      return c.json({ 
        error: "Cannot delete bank account with non-zero balance" 
      }, 400);
    }

    await kv.del(`bank-account:${existing.firma_id}:${id}`);

    return c.json({
      success: true,
      message: "Bank account deleted successfully",
    });
  } catch (error: any) {
    console.error("[BankAccounts] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// ===== BANK TRANSACTIONS =====

// GET transactions for an account
app.get("/:id/transactions", async (c) => {
  try {
    const account_id = c.req.param("id");
    const baslangic = c.req.query("baslangic_tarihi");
    const bitis = c.req.query("bitis_tarihi");
    const islem_tipi = c.req.query("islem_tipi");

    let transactions = await kv.getByPrefix(`bank-transaction:${account_id}:`);

    // Filters
    if (baslangic) {
      transactions = transactions.filter((t: any) => t.tarih >= baslangic);
    }
    if (bitis) {
      transactions = transactions.filter((t: any) => t.tarih <= bitis);
    }
    if (islem_tipi) {
      transactions = transactions.filter((t: any) => t.islem_tipi === islem_tipi);
    }

    // Sort by date descending
    transactions.sort((a: any, b: any) => 
      new Date(b.tarih).getTime() - new Date(a.tarih).getTime()
    );

    return c.json({ transactions: transactions || [] });
  } catch (error: any) {
    console.error("[BankAccounts] Transactions error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create bank transaction
app.post("/:id/transactions", async (c) => {
  try {
    const account_id = c.req.param("id");
    const data = await c.req.json();

    // Get account
    const accounts = await kv.getByPrefix(`bank-account:`);
    const account = accounts.find((acc: any) => acc.id === account_id);

    if (!account) {
      return c.json({ error: "Bank account not found" }, 404);
    }

    const transaction = {
      ...data,
      id: crypto.randomUUID(),
      account_id,
      firma_id: account.firma_id,
      created_at: new Date().toISOString(),
    };

    await kv.set(
      `bank-transaction:${account_id}:${transaction.id}`,
      transaction
    );

    // Update account balance
    let balanceChange = 0;
    if (transaction.islem_tipi === "YATIRMA" || transaction.islem_tipi === "HAVALE_GELEN") {
      balanceChange = transaction.tutar;
    } else if (transaction.islem_tipi === "CEKME" || transaction.islem_tipi === "HAVALE_GIDEN" || transaction.islem_tipi === "EFT") {
      balanceChange = -transaction.tutar;
    }

    const updated = {
      ...account,
      bakiye: (account.bakiye || 0) + balanceChange,
      updated_at: new Date().toISOString(),
    };

    await kv.set(`bank-account:${account.firma_id}:${account_id}`, updated);

    return c.json({
      success: true,
      transaction,
      account: updated,
      message: "Bank transaction created successfully",
    });
  } catch (error: any) {
    console.error("[BankAccounts] Create transaction error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update bank transaction
app.put("/transactions/:transaction_id", async (c) => {
  try {
    const transaction_id = c.req.param("transaction_id");
    const updates = await c.req.json();

    const allTransactions = await kv.getByPrefix(`bank-transaction:`);
    const existing = allTransactions.find((t: any) => t.id === transaction_id);

    if (!existing) {
      return c.json({ error: "Transaction not found" }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id: transaction_id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(
      `bank-transaction:${existing.account_id}:${transaction_id}`,
      updated
    );

    return c.json({
      success: true,
      transaction: updated,
      message: "Bank transaction updated successfully",
    });
  } catch (error: any) {
    console.error("[BankAccounts] Update transaction error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE bank transaction
app.delete("/transactions/:transaction_id", async (c) => {
  try {
    const transaction_id = c.req.param("transaction_id");

    const allTransactions = await kv.getByPrefix(`bank-transaction:`);
    const existing = allTransactions.find((t: any) => t.id === transaction_id);

    if (!existing) {
      return c.json({ error: "Transaction not found" }, 404);
    }

    // Reverse balance change
    const accounts = await kv.getByPrefix(`bank-account:`);
    const account = accounts.find((acc: any) => acc.id === existing.account_id);

    if (account) {
      let balanceChange = 0;
      if (existing.islem_tipi === "YATIRMA" || existing.islem_tipi === "HAVALE_GELEN") {
        balanceChange = -existing.tutar;
      } else if (existing.islem_tipi === "CEKME" || existing.islem_tipi === "HAVALE_GIDEN" || existing.islem_tipi === "EFT") {
        balanceChange = existing.tutar;
      }

      const updated = {
        ...account,
        bakiye: (account.bakiye || 0) + balanceChange,
        updated_at: new Date().toISOString(),
      };

      await kv.set(`bank-account:${account.firma_id}:${account.id}`, updated);
    }

    await kv.del(`bank-transaction:${existing.account_id}:${transaction_id}`);

    return c.json({
      success: true,
      message: "Bank transaction deleted successfully",
    });
  } catch (error: any) {
    console.error("[BankAccounts] Delete transaction error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET account statement
app.get("/:id/statement", async (c) => {
  try {
    const account_id = c.req.param("id");
    const baslangic = c.req.query("baslangic_tarihi");
    const bitis = c.req.query("bitis_tarihi");

    const accounts = await kv.getByPrefix(`bank-account:`);
    const account = accounts.find((acc: any) => acc.id === account_id);

    if (!account) {
      return c.json({ error: "Bank account not found" }, 404);
    }

    let transactions = await kv.getByPrefix(`bank-transaction:${account_id}:`);

    // Filters
    if (baslangic) {
      transactions = transactions.filter((t: any) => t.tarih >= baslangic);
    }
    if (bitis) {
      transactions = transactions.filter((t: any) => t.tarih <= bitis);
    }

    // Sort by date ascending
    transactions.sort((a: any, b: any) => 
      new Date(a.tarih).getTime() - new Date(b.tarih).getTime()
    );

    // Calculate running balance
    let bakiye = 0;
    const withBalance = transactions.map((t: any) => {
      if (t.islem_tipi === "YATIRMA" || t.islem_tipi === "HAVALE_GELEN") {
        bakiye += t.tutar;
      } else if (t.islem_tipi === "CEKME" || t.islem_tipi === "HAVALE_GIDEN" || t.islem_tipi === "EFT") {
        bakiye -= t.tutar;
      }
      return { ...t, bakiye };
    });

    return c.json({ 
      account,
      transactions: withBalance,
      final_balance: bakiye
    });
  } catch (error: any) {
    console.error("[BankAccounts] Statement error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

