#!/usr/bin/env node
/**
 * Bordro avans/mahsup/maaş satırı düzeltme — tek bir kayıt için.
 *
 * Amaç: 300.000 yazılan bir avans satırının 70.000 olması gerektiğinde,
 * `cash_lines` + `rex_{firm}_party_ledger_movements` + `parties.balance`'ı
 * atomik (transaction) olarak düzeltir.
 *
 * Kullanım:
 *   node scripts/fix-employee-advance-amount.mjs \
 *     --party "NGIN SORAN KASHFADIN" \
 *     --wrong 300000 \
 *     --right 70000 \
 *     --date 2026-10-10 \
 *     --type AVANS_ODEME
 *
 * Opsiyonel:
 *   --dry-run    → yalnızca etkilenen satırları listele
 *   --tenant <db>  → belirli bir tenant DB'sinde çalış (varsayılan: remote defaults)
 *   --firm <nr>  → firma numarası (örn. 001)
 *   --period <nr> → dönem numarası (örn. 01)
 *
 * Bağlantı: PG env (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE) veya
 * config/remote-pg.defaults.json. --tenant ile hedef DB override edilir.
 */

import { parsePgEndpoint, loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import pg from 'pg';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    out[key] = argv[i + 1];
  }
  return out;
}

function toInt(v) {
  const n = parseFloat(String(v || '').replace(/[, ]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Geçersiz sayı: ${v}`);
  return Math.round(n);
}

const args = parseArgs(process.argv);
const partyName = String(args.party || '').trim();
const wrongAmount = toInt(args.wrong);
const rightAmount = toInt(args.right);
const txnDate = String(args.date || '').trim() || null;
const txnType = String(args.type || 'AVANS_ODEME').trim().toUpperCase();
const dryRun = Boolean(args['dry-run']);
const tenantOverride = args.tenant ? String(args.tenant).trim() : null;
const firmNr = String(args.firm || '001').padStart(3, '0');
const periodNr = String(args.period || '01').padStart(2, '0');

if (!partyName) {
  console.error('HATA: --party zorunlu');
  process.exit(1);
}
if (wrongAmount === rightAmount) {
  console.error('HATA: --wrong ve --right farklı olmalı');
  process.exit(1);
}
if (wrongAmount <= 0 || rightAmount <= 0) {
  console.error('HATA: tutarlar pozitif olmalı');
  process.exit(1);
}

const remote = loadRemotePgDefaults();
const endpoint = tenantOverride
  ? parsePgEndpoint(`${remote.host}:${remote.port}/${tenantOverride}`, { host: remote.host, port: remote.port })
  : parsePgEndpoint(undefined);
const dbCfg = {
  host: process.env.PGHOST || endpoint.host,
  port: parseInt(process.env.PGPORT || String(endpoint.port), 10),
  user: process.env.PGUSER || remote.user || endpoint.user,
  password: process.env.PGPASSWORD || remote.password || endpoint.password,
  database: process.env.PGDATABASE || endpoint.database,
};

console.log('[fix-adv] Bağlantı:', `${dbCfg.user}@${dbCfg.host}:${dbCfg.port}/${dbCfg.database}`);
console.log('[fix-adv] Parametreler:', { partyName, wrongAmount, rightAmount, txnDate, txnType, firmNr, periodNr, dryRun });

const cashTable = `rex_${firmNr}_${periodNr}_cash_lines`;
const ledgerTable = `rex_${firmNr}_${periodNr}_party_ledger_movements`;
const partiesTable = `rex_${firmNr}_parties`;

const client = new pg.Client(dbCfg);
await client.connect();

try {
  await client.query('BEGIN');

  // 1) Personeli bul (adına göre; tek kayıt beklenir)
  const partyRes = await client.query(
    `SELECT id, name, code, balance, card_type
     FROM ${partiesTable}
     WHERE name ILIKE $1 OR code = $2
     ORDER BY (name ILIKE $1) DESC, name
     LIMIT 1`,
    [`%${partyName}%`, partyName],
  );
  if (partyRes.rows.length === 0) {
    throw new Error(`Personel bulunamadı: ${partyName}`);
  }
  const party = partyRes.rows[0];
  console.log(`[fix-adv] Personel bulundu: ${party.name} (${party.code || party.id}) mevcut bakiye: ${party.balance}`);

  // 2) Yanlış tutarlı cash_lines satırını bul
  const cashWhere = [
    'party_id = $1',
    'transaction_type = $2',
    'amount = $3',
  ];
  const cashParams = [party.id, txnType, wrongAmount];
  if (txnDate) {
    cashWhere.push(`DATE(date) = DATE($${cashParams.length + 1})`);
    cashParams.push(txnDate);
  }
  const cashRes = await client.query(
    `SELECT id, fiche_no, date, amount, sign, definition
     FROM ${cashTable}
     WHERE ${cashWhere.join(' AND ')}
     ORDER BY date DESC
     LIMIT 1`,
    cashParams,
  );
  if (cashRes.rows.length === 0) {
    throw new Error(
      `cash_lines satırı bulunamadı (party=${party.id}, type=${txnType}, amount=${wrongAmount}${txnDate ? `, date=${txnDate}` : ''})`,
    );
  }
  const cashRow = cashRes.rows[0];
  console.log('[fix-adv] cash_lines satırı:', {
    id: cashRow.id,
    fiche_no: cashRow.fiche_no,
    date: cashRow.date,
    oldAmount: cashRow.amount,
    newAmount: rightAmount,
  });

  // 3) İlgili ledger satırını bul (aynı fiche_no veya cash_line_id)
  const ledgerRes = await client.query(
    `SELECT id, transaction_type, amount, sign, cash_line_id
     FROM ${ledgerTable}
     WHERE cash_line_id = $1
     ORDER BY date DESC
     LIMIT 1`,
    [cashRow.id],
  );
  if (ledgerRes.rows.length === 0) {
    throw new Error(`ledger satırı bulunamadı (cash_line_id=${cashRow.id})`);
  }
  const ledgerRow = ledgerRes.rows[0];
  console.log('[fix-adv] ledger satırı:', {
    id: ledgerRow.id,
    transaction_type: ledgerRow.transaction_type,
    oldAmount: ledgerRow.amount,
    newAmount: rightAmount,
  });

  // 4) Bakiye düzeltmesi: fark = right - wrong.
  // sign'i koruyarak partiler bakiyesine farkı uygula.
  // AVANS_ODEME / MAAS_ODEME gibi kasadan çıkışlarda sign = -1, bakiye -= amount.
  // right > wrong olsaydı: daha büyük avans → bakiye daha da düşer.
  // right < wrong (bu senaryo): 300k → 70k → bakiye +230k (daha az borçlu).
  // Bu yüzden parties.balance += (right - wrong) * |sign| * (-1) mantığı:
  //   sign = -1, delta = +230k → bakiye +230k (doğru: personel 230k daha az avanslı)
  const delta = (rightAmount - wrongAmount) * Math.abs(Number(ledgerRow.sign || 0));
  // Yukarıdaki formül sadece sign=±1 için doğru; BONUS_HAKKEDIS (sign=+1) veya
  // CEZA_ODEME (sign=-1) için de geçerli. MAAS_HAKKEDIS / BONUS_MAHSUP gibi
  // sign=0 tiplerde delta 0 olur (cash değişmedi) — ama bu senaryoda değişmiyor zaten.

  // 5) Yeni bakiye hesapla (kontrol için)
  const newBalance = Number(party.balance) + delta;
  console.log(`[fix-adv] Bakiye düzeltmesi: ${party.balance} → ${newBalance} (delta=${delta})`);

  if (dryRun) {
    await client.query('ROLLBACK');
    console.log('[fix-adv] DRY-RUN: Hiçbir değişiklik yapılmadı.');
    process.exit(0);
  }

  // 6) cash_lines güncelle
  const updCash = await client.query(
    `UPDATE ${cashTable} SET amount = $1 WHERE id = $2 RETURNING amount`,
    [rightAmount, cashRow.id],
  );
  console.log(`[fix-adv] cash_lines UPDATE edildi:`, updCash.rows[0]);

  // 7) ledger güncelle
  const updLedger = await client.query(
    `UPDATE ${ledgerTable} SET amount = $1 WHERE id = $2 RETURNING amount`,
    [rightAmount, ledgerRow.id],
  );
  console.log(`[fix-adv] ledger UPDATE edildi:`, updLedger.rows[0]);

  // 8) parties.balance güncelle — ledger toplamından yeniden hesapla (delta değil)
  if (delta !== 0) {
    // Ledger'dan personelin tüm hareketlerini topla ve yeni bakiyeyi hesapla.
    // Bu, ledger ile parties.balance arasındaki olası tutarsızlığı da düzeltir.
    const recomputeRes = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN sign = 1 THEN amount WHEN sign = -1 THEN -amount ELSE 0 END), 0) AS new_balance,
         COALESCE(SUM(amount), 0) AS total_amount
       FROM ${ledgerTable}
       WHERE party_id = $1`,
      [party.id],
    );
    const newBalance = Number(recomputeRes.rows[0].new_balance);
    const updBalance = await client.query(
      `UPDATE ${partiesTable} SET balance = $1 WHERE id = $2 RETURNING balance`,
      [newBalance, party.id],
    );
    console.log(`[fix-adv] parties.balance yeniden hesaplandı:`, updBalance.rows[0], '(ledger toplamı)');
  } else {
    console.log('[fix-adv] parties.balance değişmedi (delta=0).');
  }

  await client.query('COMMIT');
  console.log('[fix-adv] ✅ Düzeltme tamamlandı.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('[fix-adv] HATA:', err.message);
  console.error('[fix-adv] Tüm değişiklikler geri alındı.');
  process.exit(1);
} finally {
  await client.end();
}