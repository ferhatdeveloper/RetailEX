/**
 * ExRetailOS - Chart of Accounts Service (Backend)
 * 
 * CRUD operations for chart of accounts (Hesap Planı)
 * 
 * @created 2024-12-24
 */

import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// GET all accounts
app.get("/", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");
    const parent_kod = c.req.query("parent_kod");
    const tip = c.req.query("tip");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    let accounts = await kv.getByPrefix(`chart-account:${firma_id}:`);

    // Filters
    if (parent_kod) {
      accounts = accounts.filter((acc: any) => acc.parent_kod === parent_kod);
    }
    if (tip) {
      accounts = accounts.filter((acc: any) => acc.tip === tip);
    }

    // Sort by kod
    accounts.sort((a: any, b: any) => a.kod.localeCompare(b.kod));

    return c.json({ accounts: accounts || [] });
  } catch (error: any) {
    console.error("[ChartOfAccounts] List error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET single account
app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const accounts = await kv.getByPrefix(`chart-account:`);
    const account = accounts.find((acc: any) => acc.id === id);

    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    return c.json({ account });
  } catch (error: any) {
    console.error("[ChartOfAccounts] Get error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET account by code
app.get("/by-code/:kod", async (c) => {
  try {
    const kod = c.req.param("kod");
    const firma_id = c.req.query("firma_id");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    const accounts = await kv.getByPrefix(`chart-account:${firma_id}:`);
    const account = accounts.find((acc: any) => acc.kod === kod);

    if (!account) {
      return c.json({ error: "Account not found" }, 404);
    }

    return c.json({ account });
  } catch (error: any) {
    console.error("[ChartOfAccounts] Get by code error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST create account
app.post("/", async (c) => {
  try {
    const data = await c.req.json();

    // Validation
    if (!data.firma_id || !data.kod || !data.ad) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Check if kod already exists
    const existing = await kv.getByPrefix(`chart-account:${data.firma_id}:`);
    const duplicate = existing.find((acc: any) => acc.kod === data.kod);
    
    if (duplicate) {
      return c.json({ error: `Account code ${data.kod} already exists` }, 400);
    }

    const id = data.id || crypto.randomUUID();

    const account = {
      ...data,
      id,
      bakiye: data.bakiye || 0,
      borc_toplam: data.borc_toplam || 0,
      alacak_toplam: data.alacak_toplam || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await kv.set(`chart-account:${account.firma_id}:${id}`, account);

    return c.json({
      success: true,
      account,
      message: "Account created successfully",
    });
  } catch (error: any) {
    console.error("[ChartOfAccounts] Create error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT update account
app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const updates = await c.req.json();

    const accounts = await kv.getByPrefix(`chart-account:`);
    const existing = accounts.find((acc: any) => acc.id === id);

    if (!existing) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Check if kod is being changed and if new kod already exists
    if (updates.kod && updates.kod !== existing.kod) {
      const allAccounts = await kv.getByPrefix(`chart-account:${existing.firma_id}:`);
      const duplicate = allAccounts.find((acc: any) => acc.kod === updates.kod && acc.id !== id);
      
      if (duplicate) {
        return c.json({ error: `Account code ${updates.kod} already exists` }, 400);
      }
    }

    const updated = {
      ...existing,
      ...updates,
      id,
      updated_at: new Date().toISOString(),
    };

    await kv.set(`chart-account:${updated.firma_id}:${id}`, updated);

    return c.json({
      success: true,
      account: updated,
      message: "Account updated successfully",
    });
  } catch (error: any) {
    console.error("[ChartOfAccounts] Update error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE account
app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const accounts = await kv.getByPrefix(`chart-account:`);
    const existing = accounts.find((acc: any) => acc.id === id);

    if (!existing) {
      return c.json({ error: "Account not found" }, 404);
    }

    // Check if account has transactions (balance)
    if (existing.bakiye && Math.abs(existing.bakiye) > 0.01) {
      return c.json({ 
        error: "Cannot delete account with non-zero balance" 
      }, 400);
    }

    // Check if account has children
    const children = await kv.getByPrefix(`chart-account:${existing.firma_id}:`);
    const hasChildren = children.some((acc: any) => acc.parent_kod === existing.kod);
    
    if (hasChildren) {
      return c.json({ 
        error: "Cannot delete account with child accounts" 
      }, 400);
    }

    await kv.del(`chart-account:${existing.firma_id}:${id}`);

    return c.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error: any) {
    console.error("[ChartOfAccounts] Delete error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// POST import TDHP (Turkish Uniform Chart of Accounts)
app.post("/import-tdhp", async (c) => {
  try {
    const { firma_id } = await c.req.json();

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    // TDHP Standard accounts (simplified version)
    const tdhpAccounts = [
      // 1XX - DÖNEN VARLIKLAR
      { kod: "100", ad: "KASA", tip: "AKTIF", parent_kod: null },
      { kod: "101", ad: "ALINAN ÇEKLER", tip: "AKTIF", parent_kod: null },
      { kod: "102", ad: "BANKALAR", tip: "AKTIF", parent_kod: null },
      { kod: "103", ad: "VERİLEN ÇEK VE ÖDEME EMİRLERİ (-)", tip: "AKTIF", parent_kod: null },
      { kod: "108", ad: "DİĞER HAZIR DEĞERLER", tip: "AKTIF", parent_kod: null },
      { kod: "120", ad: "ALICILAR", tip: "AKTIF", parent_kod: null },
      { kod: "121", ad: "ALACAK SENETLERİ", tip: "AKTIF", parent_kod: null },
      { kod: "122", ad: "ALACAK SENETLERİ REESKONTİ (-)", tip: "AKTIF", parent_kod: null },
      { kod: "126", ad: "VERİLEN DEPOZİTO VE TEMİNATLAR", tip: "AKTIF", parent_kod: null },
      { kod: "128", ad: "ŞÜPHELİ TİCARİ ALACAKLAR", tip: "AKTIF", parent_kod: null },
      { kod: "129", ad: "ŞÜPHELİ TİCARİ ALACAKLAR KARŞILIĞI (-)", tip: "AKTIF", parent_kod: null },
      { kod: "131", ad: "ORTAKLARDAN ALACAKLAR", tip: "AKTIF", parent_kod: null },
      { kod: "136", ad: "DİĞER ÇEŞİTLİ ALACAKLAR", tip: "AKTIF", parent_kod: null },
      { kod: "150", ad: "İLK MADDE VE MALZEME", tip: "AKTIF", parent_kod: null },
      { kod: "151", ad: "YARI MAMULLER", tip: "AKTIF", parent_kod: null },
      { kod: "152", ad: "MAMULLER", tip: "AKTIF", parent_kod: null },
      { kod: "153", ad: "TİCARİ MALLAR", tip: "AKTIF", parent_kod: null },
      { kod: "157", ad: "DİĞER STOKLAR", tip: "AKTIF", parent_kod: null },
      { kod: "158", ad: "STOK DEĞER DÜŞÜKLÜĞÜ KARŞILIĞI (-)", tip: "AKTIF", parent_kod: null },
      { kod: "180", ad: "GELECEK AYLARA AİT GİDERLER", tip: "AKTIF", parent_kod: null },
      { kod: "181", ad: "GELİR TAHAKKUKLARI", tip: "AKTIF", parent_kod: null },
      { kod: "190", ad: "DEVREDEN TAX", tip: "AKTIF", parent_kod: null },
      { kod: "191", ad: "İNDİRİLECEK TAX", tip: "AKTIF", parent_kod: null },
      { kod: "193", ad: "PEŞİN ÖDENEN VERGİLER VE FONLAR", tip: "AKTIF", parent_kod: null },
      
      // 2XX - DURAN VARLIKLAR
      { kod: "220", ad: "ALICILAR", tip: "AKTIF", parent_kod: null },
      { kod: "221", ad: "ALACAK SENETLERİ", tip: "AKTIF", parent_kod: null },
      { kod: "222", ad: "ALACAK SENETLERİ REESKONTİ (-)", tip: "AKTIF", parent_kod: null },
      { kod: "250", ad: "ARAZİ VE ARSALAR", tip: "AKTIF", parent_kod: null },
      { kod: "251", ad: "YER ALTI VE YER ÜSTÜ DÜZENLERİ", tip: "AKTIF", parent_kod: null },
      { kod: "252", ad: "BİNALAR", tip: "AKTIF", parent_kod: null },
      { kod: "253", ad: "TESİS, MAKİNE VE CİHAZLAR", tip: "AKTIF", parent_kod: null },
      { kod: "254", ad: "TAŞITLAR", tip: "AKTIF", parent_kod: null },
      { kod: "255", ad: "DEMİRBAŞLAR", tip: "AKTIF", parent_kod: null },
      { kod: "257", ad: "DİĞER MADDİ DURAN VARLIKLAR", tip: "AKTIF", parent_kod: null },
      { kod: "258", ad: "BİRİKMİŞ AMORTİSMANLAR (-)", tip: "AKTIF", parent_kod: null },
      { kod: "260", ad: "HAKLAR", tip: "AKTIF", parent_kod: null },
      { kod: "261", ad: "ŞEREFİYE", tip: "AKTIF", parent_kod: null },
      { kod: "263", ad: "KURULUŞ VE ÖRGÜTLENME GİDERLERİ", tip: "AKTIF", parent_kod: null },
      { kod: "268", ad: "BİRİKMİŞ AMORTİSMANLAR (-)", tip: "AKTIF", parent_kod: null },
      
      // 3XX - KISA VADELİ YABANCI KAYNAKLAR
      { kod: "300", ad: "BANKA KREDİLERİ", tip: "PASIF", parent_kod: null },
      { kod: "303", ad: "UZUN VADELİ KREDİLERİN ANA PARA TAKSİTLERİ", tip: "PASIF", parent_kod: null },
      { kod: "320", ad: "SATICILAR", tip: "PASIF", parent_kod: null },
      { kod: "321", ad: "BORÇ SENETLERİ", tip: "PASIF", parent_kod: null },
      { kod: "322", ad: "BORÇ SENETLERİ REESKONTİ (-)", tip: "PASIF", parent_kod: null },
      { kod: "326", ad: "ALINAN DEPOZİTO VE TEMİNATLAR", tip: "PASIF", parent_kod: null },
      { kod: "331", ad: "ORTAKLARA BORÇLAR", tip: "PASIF", parent_kod: null },
      { kod: "335", ad: "PERSONELE BORÇLAR", tip: "PASIF", parent_kod: null },
      { kod: "336", ad: "DİĞER ÇEŞİTLİ BORÇLAR", tip: "PASIF", parent_kod: null },
      { kod: "360", ad: "ÖDENECEK VERGİ VE FONLAR", tip: "PASIF", parent_kod: null },
      { kod: "361", ad: "ÖDENECEK SOSYAL GÜVENLİK KESİNTİLERİ", tip: "PASIF", parent_kod: null },
      { kod: "370", ad: "DÖNEM KARI VERGİ VE DİĞER YASAL YÜKÜMLÜLÜK KARŞILIKLARI", tip: "PASIF", parent_kod: null },
      { kod: "380", ad: "GELECEK AYLARA AİT GELİRLER", tip: "PASIF", parent_kod: null },
      { kod: "381", ad: "GİDER TAHAKKUKLARI", tip: "PASIF", parent_kod: null },
      { kod: "391", ad: "HESAPLANAN TAX", tip: "PASIF", parent_kod: null },
      
      // 4XX - UZUN VADELİ YABANCI KAYNAKLAR
      { kod: "400", ad: "BANKA KREDİLERİ", tip: "PASIF", parent_kod: null },
      { kod: "420", ad: "SATICILAR", tip: "PASIF", parent_kod: null },
      { kod: "421", ad: "BORÇ SENETLERİ", tip: "PASIF", parent_kod: null },
      
      // 5XX - ÖZKAYNAKLAR
      { kod: "500", ad: "SERMAYE", tip: "PASIF", parent_kod: null },
      { kod: "520", ad: "KARŞILIKLI İŞTİRAK SERMAYESİ (-)", tip: "PASIF", parent_kod: null },
      { kod: "540", ad: "YASAL YEDEKLER", tip: "PASIF", parent_kod: null },
      { kod: "549", ad: "DİĞER YEDEKLER", tip: "PASIF", parent_kod: null },
      { kod: "570", ad: "GEÇMİŞ YILLAR KARLARI", tip: "PASIF", parent_kod: null },
      { kod: "580", ad: "GEÇMİŞ YILLAR ZARARLARI (-)", tip: "PASIF", parent_kod: null },
      { kod: "590", ad: "DÖNEM NET KARI", tip: "PASIF", parent_kod: null },
      { kod: "591", ad: "DÖNEM NET ZARARI (-)", tip: "PASIF", parent_kod: null },
      
      // 6XX - GELİR TABLOSU HESAPLARI
      { kod: "600", ad: "YURTİÇİ SATIŞLAR", tip: "GELIR", parent_kod: null },
      { kod: "601", ad: "YURTDIŞI SATIŞLAR", tip: "GELIR", parent_kod: null },
      { kod: "602", ad: "DİĞER GELİRLER", tip: "GELIR", parent_kod: null },
      { kod: "610", ad: "SATIŞTAN İADELER (-)", tip: "GELIR", parent_kod: null },
      { kod: "611", ad: "SATIŞ İSKONTOLARI (-)", tip: "GELIR", parent_kod: null },
      { kod: "612", ad: "DİĞER İNDİRİMLER (-)", tip: "GELIR", parent_kod: null },
      { kod: "620", ad: "SATILALN MALIN MALİYETİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "630", ad: "ARAŞTIRMA VE GELİŞTİRME GİDERLERİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "631", ad: "PAZARLAMA SATIŞ VE DAĞITIM GİDERLERİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "632", ad: "GENEL YÖNETİM GİDERLERİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "640", ad: "DİĞER FAALİYETLERDEN OLAĞAN GELİR VE KARLAR", tip: "GELIR", parent_kod: null },
      { kod: "641", ad: "DİĞER FAALİYETLERDEN OLAĞAN GİDER VE ZARARLAR (-)", tip: "GİDER", parent_kod: null },
      { kod: "645", ad: "REESKONT FAİZ GELİRLERİ", tip: "GELIR", parent_kod: null },
      { kod: "646", ad: "REESKONT FAİZ GİDERLERİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "656", ad: "KAR PAYI GELİRLERİ", tip: "GELIR", parent_kod: null },
      { kod: "660", ad: "KISA VADELİ BORÇLANMA GİDERLERİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "661", ad: "UZUN VADELİ BORÇLANMA GİDERLERİ (-)", tip: "GİDER", parent_kod: null },
      { kod: "679", ad: "DİĞER OLAĞANDIŞI GELİR VE KARLAR", tip: "GELIR", parent_kod: null },
      { kod: "689", ad: "DİĞER OLAĞANDIŞI GİDER VE ZARARLAR (-)", tip: "GİDER", parent_kod: null },
      { kod: "690", ad: "DÖNEM KARI VERGİ VE DİĞER YASAL YÜKÜMLÜLÜK KARŞILIKLARI (-)", tip: "GİDER", parent_kod: null },
      { kod: "691", ad: "DÖNEM KARI VEYA ZARARI", tip: "ÖZET", parent_kod: null },
    ];

    let created = 0;
    let skipped = 0;

    for (const acc of tdhpAccounts) {
      // Check if account already exists
      const existing = await kv.getByPrefix(`chart-account:${firma_id}:`);
      const duplicate = existing.find((a: any) => a.kod === acc.kod);
      
      if (duplicate) {
        skipped++;
        continue;
      }

      const account = {
        ...acc,
        id: crypto.randomUUID(),
        firma_id,
        bakiye: 0,
        borc_toplam: 0,
        alacak_toplam: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await kv.set(`chart-account:${firma_id}:${account.id}`, account);
      created++;
    }

    return c.json({
      success: true,
      message: `TDHP import completed: ${created} created, ${skipped} skipped`,
      created,
      skipped,
      total: tdhpAccounts.length,
    });
  } catch (error: any) {
    console.error("[ChartOfAccounts] TDHP import error:", error);
    return c.json({ error: error.message }, 500);
  }
});

// GET account hierarchy (tree structure)
app.get("/hierarchy/tree", async (c) => {
  try {
    const firma_id = c.req.query("firma_id");

    if (!firma_id) {
      return c.json({ error: "firma_id is required" }, 400);
    }

    const accounts = await kv.getByPrefix(`chart-account:${firma_id}:`);

    // Build tree structure
    const buildTree = (parent_kod: string | null = null): any[] => {
      return accounts
        .filter((acc: any) => acc.parent_kod === parent_kod)
        .map((acc: any) => ({
          ...acc,
          children: buildTree(acc.kod),
        }))
        .sort((a: any, b: any) => a.kod.localeCompare(b.kod));
    };

    const tree = buildTree();

    return c.json({ tree });
  } catch (error: any) {
    console.error("[ChartOfAccounts] Hierarchy error:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default app;

