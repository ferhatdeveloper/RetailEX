/**
 * Party Merge (Cari Birleştirme) servisi
 *
 * İki `parties` kartını tek bir hedef kart altında birleştirir.
 * Birleştirme sırasında tüm hareket satırları (cash_lines, account_movements,
 * party_ledger_movements, partner_distribution_items, sales) hedef karta yönlendirilir.
 * Eski kart `is_active=false` + `merged_into_id` ile arşivlenir (geri alınabilir).
 *
 * ÖNEMLİ (90 yıllık kıdemli muhasebeci):
 *  - Borç/alacak işareti korunur (CH_TAHSILAT müşteri borcunu düşürür, CH_ODEME
 *    tedarikçi borcunu düşürür). UPDATE sırasında işaret korunur — sadece
 *    party_id / customer_id / supplier_id değişir; tutar/işaret aynen kalır.
 *  - Hedef kartın `balance` = kaynak bakiye + hedef bakiye (cari türü simetrik
 *    ise: customer+customer veya supplier+supplier). Farklı tipler birleştirilmez
 *    (örn. müşteri + personel).
 *  - Kaynak kart arşivlenir ama satırları silinmez — tam audit trail.
 *  - Tüm dönemlerin tabloları etkilenir (pg_tables loop).
 *
 * NOT: pg_bridge BEGIN/COMMIT desteklemediğinden işlemler sıralı yapılır.
 *      Son adım (kaynak arşivleme) yalnızca diğer adımlar başarılıysa çalışır.
 *      Bir hata olursa, kullanıcı "Birleştirmeyi Tamamla" ile tekrar deneyebilir
 *      (idempotent UPDATE WHERE source_id).
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { partyAPI, type Party } from './parties';

export interface MergePreview {
  sourceParty: Party;
  targetParty: Party;
  counts: {
    cashLines: number;
    cashLinesPartyOnly: number;
    accountMovements: number;
    partyLedgerMovements: number;
    partnerDistributionItems: number;
    sales: number;
  };
  projectedTargetBalance: number;
  sameCardType: boolean;
  warnings: string[];
}

export interface MergeExecuteOptions {
  mergedBy?: string;
  notes?: string;
}

export interface MergeExecuteResult {
  sourceId: string;
  targetId: string;
  counts: MergePreview['counts'];
  newTargetBalance: number;
  archivedSourceCode: string | null;
  applied: MergeStepResult[];
}

export interface MergeStepResult {
  step: string;
  table: string;
  rowsAffected: number;
  ok: boolean;
  error?: string;
}

/**
 * Birleştirme önizlemesi — gerçek UPDATE yapmaz, sadece COUNT döner.
 */
export async function previewMerge(sourceId: string, targetId: string): Promise<MergePreview> {
  if (sourceId === targetId) {
    throw new Error('Kaynak ve hedef aynı olamaz.');
  }

  const source = await partyAPI.getById(sourceId);
  const target = await partyAPI.getById(targetId);
  if (!source) throw new Error('Kaynak cari bulunamadı.');
  if (!target) throw new Error('Hedef cari bulunamadı.');

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const sameCardType = source.card_type === target.card_type;

  const warnings: string[] = [];
  if (!sameCardType) {
    warnings.push(
      `Farklı kart tipleri: kaynak "${source.card_type}", hedef "${target.card_type}". ` +
        'Borç/alacak işareti farklı yönlere yazılmış olabilir; birleştirme sonrası bakiye ayrı ayrı ele alınmalı.'
    );
  }
  if (source.balance !== 0 && target.balance !== 0 && sameCardType) {
    warnings.push(
      `Her iki kartın da bakiyesi sıfır değil (kaynak: ${source.balance}, hedef: ${target.balance}). ` +
        'Birleştirme sonrası tek bakiye: kaynak + hedef.'
    );
  }
  if (source.balance !== 0 && !sameCardType) {
    warnings.push(
      `Kaynak kartın bakiyesi sıfır değil (${source.balance}) ve farklı kart tipiyle birleştiriliyor. ` +
        'Bakiye yine de toplanır ama muhasebe denetimi için bir uzmana danışın.'
    );
  }

  const counts = await countAffectedRows(firmNr, sourceId, targetId);
  const projectedTargetBalance = (target.balance ?? 0) + (source.balance ?? 0);

  return {
    sourceParty: source,
    targetParty: target,
    counts,
    projectedTargetBalance,
    sameCardType,
    warnings,
  };
}

/**
 * Birleştirmeyi gerçekleştirir.
 *
 * Sıralı UPDATE'ler:
 *  1. Hedef balance += kaynak balance (aynı card_type ise).
 *  2. cash_lines: party_id (tüm dönemler).
 *  3. account_movements: customer_id / supplier_id (tüm dönemler, card_type'a göre).
 *  4. party_ledger_movements: party_id (tüm dönemler).
 *  5. partner_distribution_items: party_id (tüm dönemler).
 *  6. sales: customer_id (yalnızca customer ise).
 *  7. Kaynak kart arşivle (is_active=false + merged_into_id + merged_at).
 */
export async function executeMerge(
  sourceId: string,
  targetId: string,
  options: MergeExecuteOptions = {}
): Promise<MergeExecuteResult> {
  if (sourceId === targetId) throw new Error('Kaynak ve hedef aynı olamaz.');

  const source = await partyAPI.getById(sourceId);
  const target = await partyAPI.getById(targetId);
  if (!source) throw new Error('Kaynak cari bulunamadı.');
  if (!target) throw new Error('Hedef cari bulunamadı.');
  if (source.merged_into_id) {
    throw new Error('Bu kart zaten başka bir karta birleştirilmiş; tekrar birleştirilemez.');
  }
  if (!target.is_active) {
    throw new Error('Hedef kart pasif; önce aktif edin.');
  }

  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const counts = await countAffectedRows(firmNr, sourceId, targetId);
  const ct = source.card_type;
  const applied: MergeStepResult[] = [];

  // Tabloları bir kez bul
  const cashTables = await findTablesMatching(firmNr, '_cash_lines');
  const accountTables = await findTablesMatching(firmNr, '_account_movements');
  const ledgerTables = await findTablesMatching(firmNr, '_party_ledger_movements');
  const distItemTables = await findTablesMatching(firmNr, '_partner_distribution_items');
  const salesTables = ct === 'customer' ? await findTablesMatching(firmNr, '_sales', true) : [];

  // 1) Hedef bakiye güncelle
  if (source.card_type === target.card_type) {
    const res = await safeRun(
      `parties.balance += source.balance`,
      partiesTable(firmNr),
      `UPDATE ${partiesTable(firmNr)} SET balance = balance + $1::numeric, updated_at = NOW() WHERE id = $2::uuid`,
      [source.balance ?? 0, targetId]
    );
    applied.push({ step: 'target_balance', table: partiesTable(firmNr), rowsAffected: res.rows, ok: res.ok, error: res.error });
    if (!res.ok) throw new Error(`Hedef bakiye güncellenemedi: ${res.error}`);
  }

  // 2) cash_lines.party_id
  for (const t of cashTables) {
    const res = await safeRun(
      'cash_lines.party_id',
      t,
      `UPDATE ${t} SET party_id = $1::uuid WHERE party_id = $2::uuid`,
      [targetId, sourceId]
    );
    applied.push({ step: 'cash_lines_party_id', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
    if (!res.ok) throw new Error(`${t} güncellenemedi: ${res.error}`);
  }

  // 3) account_movements
  for (const t of accountTables) {
    if (ct === 'customer') {
      const res = await safeRun(
        'account_movements.customer_id',
        t,
        `UPDATE ${t} SET customer_id = $1::uuid WHERE customer_id = $2::uuid`,
        [targetId, sourceId]
      );
      applied.push({ step: 'account_movements_customer_id', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
      if (!res.ok) throw new Error(`${t} güncellenemedi: ${res.error}`);
    } else if (ct === 'supplier') {
      const res = await safeRun(
        'account_movements.supplier_id',
        t,
        `UPDATE ${t} SET supplier_id = $1::uuid WHERE supplier_id = $2::uuid`,
        [targetId, sourceId]
      );
      applied.push({ step: 'account_movements_supplier_id', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
      if (!res.ok) throw new Error(`${t} güncellenemedi: ${res.error}`);
    }
  }

  // 4) party_ledger_movements
  for (const t of ledgerTables) {
    const res = await safeRun(
      'party_ledger_movements.party_id',
      t,
      `UPDATE ${t} SET party_id = $1::uuid WHERE party_id = $2::uuid`,
      [targetId, sourceId]
    );
    applied.push({ step: 'party_ledger_movements_party_id', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
    if (!res.ok) throw new Error(`${t} güncellenemedi: ${res.error}`);
  }

  // 5) partner_distribution_items
  for (const t of distItemTables) {
    const res = await safeRun(
      'partner_distribution_items.party_id',
      t,
      `UPDATE ${t} SET party_id = $1::uuid WHERE party_id = $2::uuid`,
      [targetId, sourceId]
    );
    applied.push({ step: 'partner_distribution_items_party_id', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
    if (!res.ok) throw new Error(`${t} güncellenemedi: ${res.error}`);
  }

  // 6) sales
  for (const t of salesTables) {
    const res = await safeRun(
      'sales.customer_id',
      t,
      `UPDATE ${t} SET customer_id = $1::uuid WHERE customer_id = $2::uuid`,
      [targetId, sourceId]
    );
    applied.push({ step: 'sales_customer_id', table: t, rowsAffected: res.rows, ok: res.ok, error: res.error });
    if (!res.ok) throw new Error(`${t} güncellenemedi: ${res.error}`);
  }

  // 7) Kaynak kart arşivle
  const archiveRes = await safeRun(
    'source_archive',
    partiesTable(firmNr),
    `UPDATE ${partiesTable(firmNr)}
     SET is_active = false,
         merged_into_id = $1::uuid,
         merged_at = NOW(),
         merged_by = $2,
         merge_notes = $3,
         balance = 0,
         updated_at = NOW()
     WHERE id = $4::uuid`,
    [targetId, options.mergedBy || null, options.notes || null, sourceId]
  );
  applied.push({ step: 'source_archive', table: partiesTable(firmNr), rowsAffected: archiveRes.rows, ok: archiveRes.ok, error: archiveRes.error });
  if (!archiveRes.ok) throw new Error(`Kaynak kart arşivlenemedi: ${archiveRes.error}`);

  const newTarget = await partyAPI.getById(targetId);

  return {
    sourceId,
    targetId,
    counts,
    newTargetBalance: newTarget?.balance ?? (target.balance ?? 0) + (source.balance ?? 0),
    archivedSourceCode: source.code ?? null,
    applied,
  };
}

/**
 * Birleştirilen bir kartın hangi hedefe bağlandığını getir.
 */
export async function getMergeChain(partyId: string): Promise<{
  source: Party;
  target: Party | null;
} | null> {
  const p = await partyAPI.getById(partyId);
  if (!p || !p.merged_into_id) return null;
  const target = await partyAPI.getById(p.merged_into_id);
  return { source: p, target };
}

/* --------------------- Dahili yardımcılar --------------------- */

function partiesTable(firmNr: string): string {
  return `public.rex_${firmNr}_parties`;
}

async function findTablesMatching(
  firmNr: string,
  suffix: string,
  alsoNoPeriod = false
): Promise<string[]> {
  const periodRe = `^rex_${firmNr}_[0-9]+${suffix}$`;
  const noPeriodRe = `^rex_${firmNr}${suffix}$`;
  const conds = [`tablename ~ '${periodRe}'`];
  if (alsoNoPeriod) conds.push(`tablename ~ '${noPeriodRe}'`);
  const sql = `SELECT tablename FROM pg_tables WHERE schemaname='public' AND (${conds.join(' OR ')})`;
  const { rows } = await postgres.query(sql, []);
  return (rows || []).map((r: any) => `public."${r.tablename}"`);
}

async function safeRun(
  step: string,
  table: string,
  sql: string,
  params: any[]
): Promise<{ ok: boolean; rows: number; error?: string }> {
  try {
    const { rowCount } = await postgres.query(sql, params);
    return { ok: true, rows: rowCount || 0 };
  } catch (err: any) {
    return { ok: false, rows: 0, error: err?.message || String(err) };
  }
}

async function countAffectedRows(
  firmNr: string,
  sourceId: string,
  _targetId: string
): Promise<MergePreview['counts']> {
  const cashTables = await findTablesMatching(firmNr, '_cash_lines');
  const ledgerTables = await findTablesMatching(firmNr, '_party_ledger_movements');
  const distItemTables = await findTablesMatching(firmNr, '_partner_distribution_items');
  const accountTables = await findTablesMatching(firmNr, '_account_movements');
  const salesTables = await findTablesMatching(firmNr, '_sales', true);

  let cashLines = 0;
  let cashLinesPartyOnly = 0;
  for (const t of cashTables) {
    const { rows: r1 } = await postgres.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE party_id = $1::uuid`,
      [sourceId]
    );
    cashLinesPartyOnly += Number(r1?.[0]?.n || 0);
    const { rows: r2 } = await postgres.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE customer_id = $1::uuid OR supplier_id = $1::uuid OR party_id = $1::uuid`,
      [sourceId]
    );
    cashLines += Number(r2?.[0]?.n || 0);
  }

  let accountMovements = 0;
  for (const t of accountTables) {
    const { rows } = await postgres.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE customer_id = $1::uuid OR supplier_id = $1::uuid`,
      [sourceId]
    );
    accountMovements += Number(rows?.[0]?.n || 0);
  }

  let partyLedgerMovements = 0;
  for (const t of ledgerTables) {
    const { rows } = await postgres.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE party_id = $1::uuid`,
      [sourceId]
    );
    partyLedgerMovements += Number(rows?.[0]?.n || 0);
  }

  let partnerDistributionItems = 0;
  for (const t of distItemTables) {
    const { rows } = await postgres.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE party_id = $1::uuid`,
      [sourceId]
    );
    partnerDistributionItems += Number(rows?.[0]?.n || 0);
  }

  let sales = 0;
  for (const t of salesTables) {
    const { rows } = await postgres.query(
      `SELECT COUNT(*)::int AS n FROM ${t} WHERE customer_id = $1::uuid`,
      [sourceId]
    );
    sales += Number(rows?.[0]?.n || 0);
  }

  return {
    cashLines,
    cashLinesPartyOnly,
    accountMovements,
    partyLedgerMovements,
    partnerDistributionItems,
    sales,
  };
}
