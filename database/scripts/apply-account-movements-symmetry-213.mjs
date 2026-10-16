#!/usr/bin/env node
/**
 * Migration 213 — account_movements simetri backfill (JS script)
 *
 * Tarih: 16.10.2026
 * Kök neden: invoicesAPI.create müşteri/tedarikçi seçili olsa bile nakit/
 *   kart ödemelerde account_movements tablosuna satır YAZMIYORDU. 16.10.2026
 *   kod değişikliği (src/services/api/invoices.ts) artık simetriyi sağlıyor.
 *   Bu script GERİYE DÖNÜK olarak mevcut faturaların cari simetrisini yazar.
 *
 * Yapılacaklar:
 *   1) Tüm (firm_nr, period_nr) kombinasyonlarını bul
 *   2) Her aktif fatura için:
 *      a) account_movements'ta BORÇ (sign=-1) yoksa INSERT
 *      b) cash_lines'ta TAHSİLAT (sign=+1) varsa ve account_movements'ta
 *         alacak yoksa INSERT
 *   3) customers.balance = Σ(amount × sign) ile mutabık olacak şekilde UPDATE
 *
 * Idempotent: ref_id = <fiche_no>::debt / ::credit UNIQUE (PG partial index)
 *
 * Kullanım:
 *   node database/scripts/apply-account-movements-symmetry-213.mjs                  # dry-run
 *   node database/scripts/apply-account-movements-symmetry-213.mjs --apply         # uygula
 *   node database/scripts/apply-account-movements-symmetry-213.mjs --apply --db <dbname>
 *
 * Hariç tutulan: non-retailex-databases (ilsasupport, pagetin_kurye, siti_pdks vb.)
 */

import { Client } from 'pg';

/**
 * 32-bit deterministik hash → signed integer (PostgreSQL integer aralığına sığar).
 * UNIQUE(fiche_no, sign, transaction_type) ile birlikte idempotency sağlar.
 */
function hash32(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // PostgreSQL integer: -2^31 .. 2^31-1
  // JavaScript Math.imul signed 32-bit dönüyor
  return h | 0;
}

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const DB_NAME = (() => {
  const i = args.values ? null : null;
  const idx = process.argv.indexOf('--db');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const DB_CONFIG = {
  host: process.env.PGHOST || '72.60.182.107',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Yq7xwQpt6c',
  database: process.env.PGDATABASE || DB_NAME || 'guzel',
};

async function main() {
  const c = new Client(DB_CONFIG);
  await c.connect();
  console.log(`[213] Bağlantı: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database} (APPLY=${APPLY})`);

  try {
    // 1) Tüm (firm_nr, period_nr) kombinasyonları
    const firmsPeriods = await c.query(
      `SELECT DISTINCT
         lpad(trim(s.firm_nr::text), 3, '0') AS firm_nr,
         lpad(trim(s.period_nr::text), 2, '0') AS period_nr
       FROM public.rex_001_01_sales s
       WHERE s.is_cancelled = false
         AND s.customer_id IS NOT NULL
         AND s.fiche_no IS NOT NULL
         AND s.fiche_no <> ''
       ORDER BY 1, 2`
    );
    console.log(`[213] ${firmsPeriods.rows.length} (firm, period) kombinasyonu bulundu`);

    let totalDebtAdded = 0;
    let totalCashAdded = 0;
    let totalBalanceFixed = 0;

    for (const { firm_nr, period_nr } of firmsPeriods.rows) {
      const salesTable = `rex_${firm_nr}_${period_nr}_sales`;
      const movTable = `rex_${firm_nr}_${period_nr}_account_movements`;
      const cashTable = `rex_${firm_nr}_${period_nr}_cash_lines`;
      const customersTable = `rex_${firm_nr}_customers`;

      // Tabloların varlığını kontrol et
      const existsCheck = await c.query(
        `SELECT
          (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1)) AS sales_ok,
          (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$2)) AS mov_ok,
          (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$3)) AS cash_ok,
          (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$4)) AS customers_ok`,
        [salesTable, movTable, cashTable, customersTable]
      );
      const { sales_ok, mov_ok, cash_ok, customers_ok } = existsCheck.rows[0];
      if (!sales_ok || !mov_ok || !cash_ok || !customers_ok) {
        console.log(`[213]   ${firm_nr}/${period_nr}: atlandı (tablo eksik: sales=${sales_ok} mov=${mov_ok} cash=${cash_ok} customers=${customers_ok})`);
        continue;
      }

      // Aktif faturalar
      const sales = await c.query(
        `SELECT id, fiche_no, customer_id, trcode, total_net, total_gross, date
         FROM public.${salesTable}
         WHERE is_cancelled = false
           AND customer_id IS NOT NULL
           AND fiche_no IS NOT NULL
           AND fiche_no <> ''
         ORDER BY date DESC`
      );
      console.log(`[213]   ${firm_nr}/${period_nr}: ${sales.rows.length} aktif fatura`);

      for (const sale of sales.rows) {
        // Borç satırı kontrol
        const debtExists = await c.query(
          `SELECT EXISTS (
             SELECT 1 FROM public.${movTable}
             WHERE customer_id = $1::uuid
               AND fiche_no = $2
               AND sign = -1
           )`,
          [sale.customer_id, sale.fiche_no]
        );

        if (!debtExists.rows[0].exists) {
          // Total amount: total_net > total_gross fallback
          const amount = Number(sale.total_net || sale.total_gross || 0);
          if (amount <= 0) continue;
          if (APPLY) {
            // ref_id integer → 32-bit hash(fiche_no + 'debt')
            const debtRef = hash32(`${sale.fiche_no}::debt`);
            await c.query(
              `INSERT INTO public.${movTable}
                  (firm_nr, period_nr, customer_id, fiche_no, date,
                   amount, sign, trcode, module_nr, definition, transaction_type,
                   ref_id, created_at)
               VALUES
                  ($1::text, $2::text, $3::uuid, $4::text, $5::timestamptz,
                   $6::numeric, -1, $7::int, 4::int, $8::text, $9::text,
                   $10::int, NOW())
               ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING`,
              [
                firm_nr, period_nr, sale.customer_id, sale.fiche_no, sale.date,
                amount, sale.trcode,
                `Migration 213 backfill — ${sale.fiche_no} (borç)`,
                'SALES_DEBT',
                debtRef,
              ]
            );
          }
          totalDebtAdded++;
          console.log(`[213]     BORÇ eklenecek: ${sale.fiche_no} (${amount})`);
        }

        // Tahsilat satırı: cash_lines'ta bu fatura için sign=+1 olan
        const cashSum = await c.query(
          `SELECT COALESCE(SUM(cl.amount), 0) AS total
           FROM public.${cashTable} cl
           WHERE (cl.fiche_no = $1 OR cl.definition LIKE ('%' || $1))
             AND cl.sign = 1`,
          [sale.fiche_no]
        );
        const cashAmount = Number(cashSum.rows[0]?.total || 0);
        if (cashAmount > 0) {
          const cashExists = await c.query(
            `SELECT EXISTS (
               SELECT 1 FROM public.${movTable}
               WHERE customer_id = $1::uuid
                 AND fiche_no = $2
                 AND sign = 1
                 AND transaction_type = 'CASH_COLLECT'
             )`,
            [sale.customer_id, sale.fiche_no]
          );
          if (!cashExists.rows[0].exists) {
            if (APPLY) {
              const cashRef = hash32(`${sale.fiche_no}::credit`);
              await c.query(
                `INSERT INTO public.${movTable}
                    (firm_nr, period_nr, customer_id, fiche_no, date,
                     amount, sign, trcode, module_nr, definition, transaction_type,
                     ref_id, created_at)
                 VALUES
                    ($1::text, $2::text, $3::uuid, $4::text, $5::timestamptz,
                     $6::numeric, 1, 3::int, 4::int, $7::text, $8::text,
                     $9::int, NOW())
                 ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL DO NOTHING`,
                [
                  firm_nr, period_nr, sale.customer_id, sale.fiche_no, sale.date,
                  cashAmount,
                  `Migration 213 backfill — ${sale.fiche_no} (tahsilat)`,
                  'CASH_COLLECT',
                  cashRef,
                ]
              );
            }
            totalCashAdded++;
            console.log(`[213]     TAHSİLAT eklenecek: ${sale.fiche_no} (${cashAmount})`);
          }
        }
      }

      // customers.balance yeniden hesapla — DİKKAT: balance = -net formülü
      // (Mevcut sistemde FERHAT örneği: net=+20k → balance=-20k alacaklı)
      // DUBLE 15a83084 ile zaten düzeltildi; FERHAT'in -20k'sı de doğru.
      // Migration 213 yeni simetri ekledikten sonra, henüz dokunulmamış
      // müşterilerin balance'ı zaten -net'tir (boş değil). Yeni eklenen
      // satırlar simetrik olduğu için net=0 ekler (borç + tahsilat = 0);
      // bu durumda mevcut balance da değişmemelidir. Yani UPDATE gerekmez.
      //
      // Emniyet için: sadece balance henüz set edilmemiş (NULL) olan
      // müşterileri -net ile başlat.
      if (APPLY) {
        const upd = await c.query(
          `UPDATE public.${customersTable} c
              SET balance = -COALESCE(sub.net, 0),
                  updated_at = NOW()
            FROM (
              SELECT m.customer_id,
                     COALESCE(SUM(m.amount * m.sign), 0) AS net
              FROM public.${movTable} m
              WHERE m.customer_id IS NOT NULL
              GROUP BY m.customer_id
            ) sub
            WHERE c.id = sub.customer_id
              AND c.balance IS NULL
            RETURNING c.id`
        );
        totalBalanceFixed += upd.rowCount || 0;
      }
    }

    console.log('\n[213] === ÖZET ===');
    console.log(`[213] Borç eklenecek/eklendi:    ${totalDebtAdded}`);
    console.log(`[213] Tahsilat eklenecek/eklendi: ${totalCashAdded}`);
    console.log(`[213] Müşteri balance güncellenen: ${totalBalanceFixed}`);
    if (!APPLY) {
      console.log('\n[213] [DRY-RUN] --apply verilmedi, hiçbir değişiklik yapılmadı.');
    } else {
      console.log('\n[213] ✅ Tüm değişiklikler uygulandı.');
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('HATA:', e.message);
  console.error(e.stack);
  process.exit(1);
});
