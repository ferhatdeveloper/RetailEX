#!/usr/bin/env node
/**
 * Backfill audit — DUBLE (BEA-MVAZ56H1) cari bakiye düzeltmesi
 *
 * Tarih: 16.10.2026
 * Tenant: guzel (merkez_tenant_code=guzel, firm_nr=001, period_nr=01)
 * Müşteri: DUBLE (BEA-MVAZ56H1, id=552e8256-77b7-4bd0-9458-09177a3b2bae)
 * Fatura: BEA-2026-MVAZ674A (sales.id=b33a1cd2-06de-4f8a-ae6c-8f935ba65bb5)
 *
 * ============================================================================
 * SORUN
 * ============================================================================
 * Perakende satış faturası (HAIR CUT 40.000 + DEPOSIT 10.000 = 50.000 IQD)
 * kesildi ve 40.000 IQD nakit ödendi. Mevcut cari hareketler (account_movements):
 *
 *   - 1 satır: 10.000 IQD alacak (avans tahsilatı, sign=+1)
 *     → customers.balance = -10.000 (müşterinin alacağı 10.000)
 *
 *   - fatura 50.000 borç kaydı YOK (account_movements'a yazılmamış)
 *   - 40.000 IQD nakit tahsilat kaydı YOK (cash_lines'ta var ama cari'de yok)
 *
 * Sonuç: customers.balance -10.000 (yanlış, 0 olmalıydı).
 *
 * ============================================================================
 * KÖK NEDEN (kod tarafı — fix bekleniyor)
 * ============================================================================
 * - `useSaleStore.addSale → salesAPI.create → invoicesAPI.create` zinciri
 *   nakit ödemelerde `account_movements` tablosuna satır YAZMIYOR.
 * - Sadece `customers.balance` UPDATE ediliyor (yalnızca veresiye kısmı için).
 * - `cash_lines` zaten 40.000 KASA_GIRIS yazıyor, ama cari simetrisi eksik.
 *
 * ============================================================================
 * ÇÖZÜM (bu backfill)
 * ============================================================================
 * 1) account_movements'a 50.000 IQD borç (sign=-1, trcode=7) — fatura borcu
 * 2) account_movements'a 40.000 IQD alacak (sign=+1, trcode=3) — nakit tahsilat
 * 3) customers.balance = 0
 * 4) cari_avans.status = 'applied' (mevcut avans 10.000 bu faturaya mahsup)
 *
 * Hesap dengesi: -50.000 + 40.000 + 10.000 = 0 ✓
 *
 * ============================================================================
 * KULLANIM
 * ============================================================================
 *   node database/scripts/apply-dicle-cari-backfill-2026-10-16.mjs                 # dry-run
 *   node database/scripts/apply-dicle-cari-backfill-2026-10-16.mjs --apply         # uygula
 *
 * Bu script idempotent değildir — yalnızca bir kez çalıştırılmalıdır.
 * Tekrar çalıştırılırsa duplicate account_movements satırları oluşur.
 *
 * ============================================================================
 */

import { Client } from 'pg';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

const DB_CONFIG = {
  host: process.env.PGHOST || '72.60.182.107',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Yq7xwQpt6c',
  database: process.env.PGDATABASE || 'guzel',
};

const CUSTOMER_ID = '552e8256-77b7-4bd0-9458-09177a3b2bae';
const SALE_ID = 'b33a1cd2-06de-4f8a-ae6c-8f935ba65bb5';
const SALE_FICHE = 'BEA-2026-MVAZ674A';
const FIRM = '001';
const PERIOD = '01';

async function main() {
  const c = new Client(DB_CONFIG);
  await c.connect();

  try {
    // Mevcut durumu logla
    const before = await c.query(
      `SELECT id, amount, sign, definition, fiche_no
       FROM public.rex_${FIRM}_${PERIOD}_account_movements
       WHERE customer_id=$1::uuid
       ORDER BY date ASC, created_at ASC`,
      [CUSTOMER_ID]
    );
    console.log('=== ÖNCE: account_movements ===');
    console.table(before.rows);

    const cBefore = await c.query(
      `SELECT id, code, name, balance FROM public.rex_${FIRM}_customers WHERE id=$1::uuid`,
      [CUSTOMER_ID]
    );
    console.log('\n=== ÖNCE: customers.balance ===');
    console.table(cBefore.rows);

    if (!APPLY) {
      console.log('\n[DRY-RUN] --apply verilmedi, hiçbir değişiklik yapılmadı.');
      console.log('[DRY-RUN] Çalıştırmak için: --apply ekleyin.');
      await c.end();
      return;
    }

    // Transaction içinde uygula
    await c.query('BEGIN');
    try {
      // 1) Borç satırı (sign=-1, amount=50000) — fatura borcu
      await c.query(
        `INSERT INTO public.rex_${FIRM}_${PERIOD}_account_movements
            (firm_nr, period_nr, customer_id, fiche_no, date, amount, sign, trcode,
             module_nr, definition, transaction_type, created_at)
         VALUES
            ($1, $2, $3::uuid, $4, NOW(), 50000, -1, 7,
             4, $5, 'SALES_DEBT', NOW())`,
        [
          FIRM,
          PERIOD,
          CUSTOMER_ID,
          SALE_FICHE,
          `${SALE_FICHE} satış borcu (HAIR CUT 40.000 + DEPOSIT 10.000) — backfill 16.10.2026`,
        ]
      );

      // 2) Tahsilat satırı (sign=+1, amount=40000) — nakit ödeme
      await c.query(
        `INSERT INTO public.rex_${FIRM}_${PERIOD}_account_movements
            (firm_nr, period_nr, customer_id, fiche_no, date, amount, sign, trcode,
             module_nr, definition, transaction_type, created_at)
         VALUES
            ($1, $2, $3::uuid, $4, NOW(), 40000, 1, 3,
             4, $5, 'CASH_COLLECT', NOW())`,
        [
          FIRM,
          PERIOD,
          CUSTOMER_ID,
          SALE_FICHE,
          `${SALE_FICHE} nakit tahsilat — 40.000 (avans 10.000 zaten caride) — backfill 16.10.2026`,
        ]
      );

      // 3) customers.balance = 0
      await c.query(
        `UPDATE public.rex_${FIRM}_customers
            SET balance = 0, updated_at = NOW()
          WHERE id = $1::uuid`,
        [CUSTOMER_ID]
      );

      // 4) cari_avans uygulandı olarak işaretle
      await c.query(
        `UPDATE public.rex_${FIRM}_${PERIOD}_cari_avans
            SET status = 'applied',
                applied_sale_id = $1::uuid,
                notes = COALESCE(notes, '') || ' | Uygulandı: ' || $2 || ' (16.10.2026 backfill)'
          WHERE customer_id = $3::uuid AND status = 'open'`,
        [SALE_ID, SALE_FICHE, CUSTOMER_ID]
      );

      await c.query('COMMIT');
      console.log('\n✅ TRANSACTION COMMITTED');
    } catch (e) {
      await c.query('ROLLBACK');
      console.error('❌ HATA, ROLLBACK:', e.message);
      throw e;
    }

    // Doğrulama
    const after = await c.query(
      `SELECT id, amount, sign, definition, fiche_no, created_at
       FROM public.rex_${FIRM}_${PERIOD}_account_movements
       WHERE customer_id=$1::uuid
       ORDER BY date ASC, created_at ASC`,
      [CUSTOMER_ID]
    );
    console.log('\n=== SONRA: account_movements ===');
    console.table(after.rows);

    const sum = await c.query(
      `SELECT
          COALESCE(SUM(amount * sign), 0) AS net,
          COALESCE(SUM(CASE WHEN sign=1 THEN amount ELSE 0 END), 0) AS alacak,
          COALESCE(SUM(CASE WHEN sign=-1 THEN amount ELSE 0 END), 0) AS borc
       FROM public.rex_${FIRM}_${PERIOD}_account_movements
       WHERE customer_id=$1::uuid`,
      [CUSTOMER_ID]
    );
    console.log('\n=== HESAP ÖZETİ ===');
    console.table(sum.rows);

    const cAfter = await c.query(
      `SELECT id, code, name, balance FROM public.rex_${FIRM}_customers WHERE id=$1::uuid`,
      [CUSTOMER_ID]
    );
    console.log('\n=== SONRA: customers.balance ===');
    console.table(cAfter.rows);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
