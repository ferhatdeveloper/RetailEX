/**
 * Partner Distribution Motoru — kâr/zarar dağıtımı
 *
 * 3 tetik modu:
 *   - daily: günlük kasa kapanışı popup
 *   - period: dönem sonu kapama
 *   - manual: PartnerDistributionModal'dan manuel
 *
 * 3 dağıtım tabanı:
 *   - net_profit: brüt satış − alış iade − gider
 *   - cash_net: kasa + banka net pozisyonu (işaret dahil)
 *   - manual: kullanıcı tutarı girer
 *
 * Muhasebe yönü (personel hakkediş analogu):
 *   - Kâr dağıtımı: KAR_DAGITIMI ledger sign=+1, parties.balance +  (kasa yok)
 *   - Zarar dağıtımı: ZARAR_DAGITIMI ledger sign=-1, parties.balance − (kasa yok)
 *   Nakit ortak para girişi / çıkışı ayrı işlemdir (partnerAPI.cashIn / cashOut).
 *
 * Yuvarlama: son ortak total - Σ(önceki paylar) ile hesaplanır (kuruş farkı yansımasın).
 */

import { postgres, ERP_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { ensurePartyPeriodTables } from './ensurePartyPeriodTables';
import type {
  PartyPartner,
  PartyLedgerMovement,
  PartnerDistribution,
  PartnerDistributionItem,
  PartnerDistributionBase,
  PartnerDistributionMode,
  PartnerDistributionPreview,
} from '../../core/types/models';

function partnersTable(): string {
  return `rex_${normalizeFirmTableNr(ERP_SETTINGS.firmNr)}_parties`;
}

function ledgerTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_party_ledger_movements`;
}

function distributionsTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_partner_distributions`;
}

function distributionItemsTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_partner_distribution_items`;
}

function cashLinesTable(): string {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  return `rex_${firm}_${period}_cash_lines`;
}

export async function listActivePartners(): Promise<PartyPartner[]> {
  const { rows } = await postgres.query(
    `SELECT id, code, name, share_pct, capital_contribution, partner_role, partner_since, iban, balance, is_active
     FROM ${partnersTable()}
     WHERE card_type = 'partner' AND is_active = true AND COALESCE(share_pct, 0) > 0
     ORDER BY share_pct DESC, name ASC`,
    [],
  );
  return (rows || []).map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    share_pct: parseFloat(r.share_pct || 0),
    capital_contribution: parseFloat(r.capital_contribution || 0),
    partner_role: r.partner_role,
    partner_since: r.partner_since,
    iban: r.iban,
    balance: parseFloat(r.balance || 0),
    is_active: r.is_active !== false,
  }));
}

export async function validateSharePctSum(partners: PartyPartner[]): Promise<{ ok: boolean; totalPct: number; warnings: string[] }> {
  const total = partners.reduce((s, p) => s + (p.share_pct || 0), 0);
  const warnings: string[] = [];
  const rounded = Math.round(total * 100) / 100;
  if (Math.abs(rounded - 100) > 0.01) {
    warnings.push(`Ortak payları toplamı ${rounded}% — 100% olmalı.`);
  }
  return { ok: Math.abs(rounded - 100) <= 0.01, totalPct: rounded, warnings };
}

/**
 * Dağıtım tabanı hesaplama (özet)
 */
export async function computeDistributionBaseAmount(baseType: PartnerDistributionBase, opts?: { startDate?: string; endDate?: string }): Promise<number> {
  const firm = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);
  const startDate = opts?.startDate;
  const endDate = opts?.endDate;

  if (baseType === 'cash_net') {
    // Kasa + banka net pozisyonu
    const cashRes = await postgres.query(
      `SELECT COALESCE(SUM(amount * sign), 0) AS net FROM ${cashLinesTable()}
       WHERE ($1::text IS NULL OR date >= $1::date) AND ($2::text IS NULL OR date <= $2::date)`,
      [startDate || null, endDate || null],
    );
    const bankTable = `rex_${firm}_${period}_bank_lines`;
    let bankNet = 0;
    try {
      const bankRes = await postgres.query(
        `SELECT COALESCE(SUM(amount * sign), 0) AS net FROM ${bankTable}
         WHERE ($1::text IS NULL OR date >= $1::date) AND ($2::text IS NULL OR date <= $2::date)`,
        [startDate || null, endDate || null],
      );
      bankNet = parseFloat(bankRes.rows?.[0]?.net || 0);
    } catch {
      bankNet = 0;
    }
    return parseFloat(cashRes.rows?.[0]?.net || 0) + bankNet;
  }

  if (baseType === 'net_profit') {
    const salesTable = `rex_${firm}_${period}_sales`;
    const expensesTable = `rex_${firm}_expenses`;
    // brüt satışlar
    const salesRes = await postgres.query(
      `SELECT COALESCE(SUM(net_amount), 0) AS total FROM ${salesTable}
       WHERE COALESCE(is_cancelled, false) = false
         AND ($1::text IS NULL OR date >= $1::date) AND ($2::text IS NULL OR date <= $2::date)`,
      [startDate || null, endDate || null],
    ).catch(() => ({ rows: [{ total: 0 }] }));
    const grossSales = parseFloat(salesRes.rows?.[0]?.total || 0);

    // giderler (status='approved' olanlar)
    const expRes = await postgres.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ${expensesTable}
       WHERE status = 'approved'
         AND ($1::text IS NULL OR expense_date >= $1::date) AND ($2::text IS NULL OR expense_date <= $2::date)`,
      [startDate || null, endDate || null],
    ).catch(() => ({ rows: [{ total: 0 }] }));
    const totalExpenses = parseFloat(expRes.rows?.[0]?.total || 0);

    return grossSales - totalExpenses;
  }

  // manual — kullanıcı tutarı girer; burada 0 döndürülür (önyüzden gelir)
  return 0;
}

/**
 * Dağıtım önizleme: pay hesabı, son ortağa yuvarlama farkı
 */
export async function previewDistribution(opts: {
  baseType: PartnerDistributionBase;
  baseAmount: number;
  partners?: PartyPartner[];
}): Promise<PartnerDistributionPreview> {
  const partners = opts.partners ?? (await listActivePartners());
  const validation = await validateSharePctSum(partners);
  const totalPct = validation.totalPct;

  let working = partners.slice().sort((a, b) => (b.share_pct || 0) - (a.share_pct || 0));
  const previewItems: { partner: PartyPartner; sharePct: number; amount: number }[] = [];
  let allocated = 0;

  for (let i = 0; i < working.length; i++) {
    const p = working[i];
    const pct = p.share_pct || 0;
    let amount: number;
    if (i === working.length - 1) {
      // Son ortak: kuruş farkı yansımasın
      amount = opts.baseAmount - allocated;
    } else {
      amount = Math.round((opts.baseAmount * pct / totalPct) * 100) / 100;
      allocated += amount;
    }
    previewItems.push({ partner: p, sharePct: pct, amount });
  }

  return {
    baseType: opts.baseType,
    baseAmount: opts.baseAmount,
    partners: previewItems,
    totalPct,
    warnings: validation.warnings,
  };
}

/**
 * Dağıtımı gerçekleştir — atomik transaction içinde.
 *
 * Akış:
 *  1) partner_distributions kaydı (parent row)
 *  2) Her ortağa:
 *     - party_ledger_movements kaydı yazılır (kasa yok)
 *     - parties.balance güncellenir
 *     - partner_distribution_items kaydı yazılır
 *  3) negatif dağıtım tutarı (zarar) için sign ters
 */
export async function executeDistribution(opts: {
  baseType: PartnerDistributionBase;
  baseAmount: number;
  triggerType: PartnerDistributionMode;
  /** @deprecated Dağıtım kasa yazmaz; geriye dönük imza için opsiyonel. */
  registerId?: string;
  createdBy?: string;
  notes?: string;
  distributionDate?: string;
}): Promise<PartnerDistribution> {
  const preview = await previewDistribution({ baseType: opts.baseType, baseAmount: opts.baseAmount });
  if (preview.warnings.length > 0) {
    throw new Error(preview.warnings.join(' '));
  }

  const isLosing = opts.baseAmount < 0;
  const absAmount = Math.abs(opts.baseAmount);
  const distDate = opts.distributionDate || new Date().toISOString().slice(0, 10);

  if (isLosing) {
    // Zarar — sign ters, ama UI guard ile yöneticiden onay alındıktan sonra çalışsın
    const lossPreview = await previewDistribution({ baseType: opts.baseType, baseAmount: absAmount });
    return await executeDistributionInternal({
      ...opts,
      baseAmount: absAmount,
      isLoss: true,
      preview: lossPreview,
      distDate,
    });
  }
  return await executeDistributionInternal({
    ...opts,
    baseAmount: absAmount,
    isLoss: false,
    preview,
    distDate,
  });
}

interface ExecuteInternal {
  baseType: PartnerDistributionBase;
  baseAmount: number;
  triggerType: PartnerDistributionMode;
  createdBy?: string;
  notes?: string;
  distDate: string;
  isLoss: boolean;
  preview: PartnerDistributionPreview;
}

async function executeDistributionInternal(opts: ExecuteInternal): Promise<PartnerDistribution> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);

  await ensurePartyPeriodTables(firmNr, period);
  await postgres.query('BEGIN');
  try {
    // 1) Üst dağıtım kaydı
    const distIns = await postgres.query(
      `INSERT INTO ${distributionsTable()} (
         firm_nr, period_nr, distribution_date, base_type, base_amount,
         total_partner_pct, trigger_type, created_by, notes
       ) VALUES (
         $1::text, $2::text, $3::date, $4::text, $5::text::numeric,
         $6::text::numeric, $7::text, $8::text, $9::text
       ) RETURNING *`,
      [
        firmNr,
        period,
        opts.distDate,
        opts.baseType,
        (opts.isLoss ? -opts.baseAmount : opts.baseAmount).toString(),
        opts.preview.totalPct.toString(),
        opts.triggerType,
        opts.createdBy || null,
        opts.notes || null,
      ],
    );
    const distRow = distIns.rows?.[0];
    if (!distRow) throw new Error('Dağıtım parent kaydı oluşturulamadı.');

    const txType = opts.isLoss ? 'ZARAR_DAGITIMI' : 'KAR_DAGITIMI';
    const signedDelta = opts.isLoss ? -1 : 1;

    const items: PartnerDistributionItem[] = [];

    for (const item of opts.preview.partners) {
      const ledgerIns = await postgres.query(
        `INSERT INTO ${ledgerTable()} (
           firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
           date, amount, sign, definition, source_module, source_id, cash_line_id
         ) VALUES (
           $1::text, $2::text, $3::text::uuid, 'partner', 64, $4::text,
           $5::text::timestamptz, $6::text::numeric, $7::integer, $8::text, 'partner_distribution', $9::text::uuid, NULL
         ) RETURNING id`,
        [
          firmNr,
          period,
          item.partner.id,
          txType,
          new Date(`${opts.distDate}T12:00:00`).toISOString(),
          item.amount.toString(),
          signedDelta,
          `${txType} — %${item.sharePct}`,
          distRow.id,
        ],
      );
      const ledgerId = ledgerIns.rows?.[0]?.id;

      await postgres.query(
        `UPDATE ${partnersTable()}
         SET balance = COALESCE(balance, 0) + $1::text::numeric, updated_at = NOW()
         WHERE id = $2::text::uuid`,
        [(item.amount * signedDelta).toString(), item.partner.id],
      );

      const itemIns = await postgres.query(
        `INSERT INTO ${distributionItemsTable()} (
           distribution_id, partner_id, share_pct, amount, cash_line_id, party_ledger_movement_id
         ) VALUES ($1::text::uuid, $2::text::uuid, $3::text::numeric, $4::text::numeric, NULL, $5::text::uuid) RETURNING *`,
        [distRow.id, item.partner.id, item.sharePct.toString(), item.amount.toString(), ledgerId || null],
      );

      items.push(itemIns.rows[0]);
    }

    await postgres.query('COMMIT');

    return {
      id: distRow.id,
      firm_nr: firmNr,
      period_nr: period,
      distribution_date: opts.distDate,
      base_type: opts.baseType,
      base_amount: opts.isLoss ? -opts.baseAmount : opts.baseAmount,
      total_partner_pct: opts.preview.totalPct,
      trigger_type: opts.triggerType,
      created_by: opts.createdBy,
      notes: opts.notes,
      items,
      created_at: distRow.created_at,
    };
  } catch (err) {
    await postgres.query('ROLLBACK');
    throw err;
  }
}

/**
 * Dağıtım geçmişi
 */
export async function getDistributionHistory(opts?: { startDate?: string; endDate?: string; limit?: number }): Promise<PartnerDistribution[]> {
  await ensurePartyPeriodTables();
  const limit = opts?.limit ?? 100;
  const { rows } = await postgres.query(
    `SELECT d.*, COALESCE(json_agg(json_build_object(
        'id', i.id, 'partner_id', i.partner_id, 'share_pct', i.share_pct,
        'amount', i.amount, 'cash_line_id', i.cash_line_id, 'party_ledger_movement_id', i.party_ledger_movement_id
      ) ORDER BY i.share_pct DESC) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM ${distributionsTable()} d
     LEFT JOIN ${distributionItemsTable()} i ON i.distribution_id = d.id
     WHERE ($1::text IS NULL OR d.distribution_date >= $1::date)
       AND ($2::text IS NULL OR d.distribution_date <= $2::date)
     GROUP BY d.id
     ORDER BY d.distribution_date DESC, d.created_at DESC
     LIMIT $3::integer`,
    [opts?.startDate || null, opts?.endDate || null, limit],
  );
  return (rows || []).map((r: any) => ({
    id: r.id,
    firm_nr: r.firm_nr,
    period_nr: r.period_nr,
    distribution_date: r.distribution_date,
    base_type: r.base_type,
    base_amount: parseFloat(r.base_amount || 0),
    total_partner_pct: parseFloat(r.total_partner_pct || 0),
    trigger_type: r.trigger_type,
    created_by: r.created_by,
    notes: r.notes,
    reversed_by_id: r.reversed_by_id,
    items: r.items || [],
    created_at: r.created_at,
  }));
}

/**
 * Ortağın party_ledger hareketleri
 */
export async function getPartnerLedger(partnerId: string, opts?: { startDate?: string; endDate?: string; limit?: number }): Promise<PartyLedgerMovement[]> {
  await ensurePartyPeriodTables();
  const limit = opts?.limit ?? 200;
  const { rows } = await postgres.query(
    `SELECT * FROM ${ledgerTable()}
     WHERE party_id = $1::text::uuid
       AND ($2::text IS NULL OR date >= $2::date)
       AND ($3::text IS NULL OR date <= $3::date)
     ORDER BY date DESC, created_at DESC
     LIMIT $4::integer`,
    [partnerId, opts?.startDate || null, opts?.endDate || null, limit],
  );
  return (rows || []).map((r: any) => ({
    id: r.id,
    firm_nr: r.firm_nr,
    period_nr: r.period_nr,
    party_id: r.party_id,
    card_type: r.card_type,
    trcode: r.trcode,
    transaction_type: r.transaction_type,
    date: r.date,
    amount: parseFloat(r.amount || 0),
    sign: r.sign,
    definition: r.definition,
    source_module: r.source_module,
    source_id: r.source_id,
    cash_line_id: r.cash_line_id,
    created_at: r.created_at,
  }));
}

/**
 * Dağıtım iptali — ters kayıtlar (henüz uygulanmadı; admin onayı + audit gerekir)
 */
export async function reverseDistribution(distributionId: string, opts: { createdBy?: string; notes?: string }): Promise<PartnerDistribution> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const period = String(ERP_SETTINGS.periodNr || '01').padStart(2, '0').slice(0, 10);

  await ensurePartyPeriodTables(firmNr, period);
  await postgres.query('BEGIN');
  try {
    const prevRes = await postgres.query(
      `SELECT * FROM ${distributionsTable()} WHERE id = $1::text::uuid LIMIT 1`,
      [distributionId],
    );
    const prev = prevRes.rows?.[0];
    if (!prev) throw new Error('Dağıtım bulunamadı.');
    if (prev.reversed_by_id) throw new Error('Bu dağıtım zaten tersine çevrilmiş.');

    const itemsRes = await postgres.query(
      `SELECT * FROM ${distributionItemsTable()} WHERE distribution_id = $1::text::uuid`,
      [distributionId],
    );
    const items = itemsRes.rows || [];

    // Ters kayıt parent
    const newDist = await postgres.query(
      `INSERT INTO ${distributionsTable()} (
         firm_nr, period_nr, distribution_date, base_type, base_amount,
         total_partner_pct, trigger_type, created_by, notes
       ) VALUES (
         $1::text, $2::text, CURRENT_DATE, $3::text, $4::text::numeric,
         $5::text::numeric, 'manual', $6::text, $7::text
       ) RETURNING *`,
      [
        firmNr,
        period,
        prev.base_type,
        (-parseFloat(prev.base_amount || 0)).toString(),
        prev.total_partner_pct,
        opts.createdBy || null,
        `İptal: ${prev.id} — ${opts.notes || ''}`,
      ],
    );
    const newDistRow = newDist.rows?.[0];
    if (!newDistRow) throw new Error('Ters kayıt oluşturulamadı.');

    const origSigned = parseFloat(prev.base_amount || 0);
    const origWasProfit = origSigned >= 0;
    const txType = origWasProfit ? 'KAR_DAGITIMI' : 'ZARAR_DAGITIMI';
    const reverseSign = origWasProfit ? -1 : 1;

    const reversedItems: PartnerDistributionItem[] = [];
    for (const it of items) {
      const amt = Math.abs(parseFloat(it.amount || 0));
      const ledgerIns = await postgres.query(
        `INSERT INTO ${ledgerTable()} (
           firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
           date, amount, sign, definition, source_module, source_id, cash_line_id
         ) VALUES (
           $1::text, $2::text, $3::text::uuid, 'partner', 65, $4::text,
           NOW(), $5::text::numeric, $6::integer, $7::text, 'partner_distribution_reversal', $8::text::uuid, NULL
         ) RETURNING id`,
        [
          firmNr,
          period,
          it.partner_id,
          txType,
          amt.toString(),
          reverseSign,
          `İptal: ${prev.id}`,
          newDistRow.id,
        ],
      );
      const ledgerId = ledgerIns.rows?.[0]?.id;

      await postgres.query(
        `UPDATE ${partnersTable()}
         SET balance = COALESCE(balance, 0) + $1::text::numeric, updated_at = NOW()
         WHERE id = $2::text::uuid`,
        [(amt * reverseSign).toString(), it.partner_id],
      );

      const itemIns = await postgres.query(
        `INSERT INTO ${distributionItemsTable()} (
           distribution_id, partner_id, share_pct, amount, cash_line_id, party_ledger_movement_id
         ) VALUES ($1::text::uuid, $2::text::uuid, $3::text::numeric, $4::text::numeric, NULL, $5::text::uuid) RETURNING *`,
        [newDistRow.id, it.partner_id, (-parseFloat(it.share_pct || 0)).toString(), (-amt).toString(), ledgerId || null],
      );
      reversedItems.push(itemIns.rows[0]);
    }

    // üst dağıtıma reversed_by_id yaz
    await postgres.query(
      `UPDATE ${distributionsTable()} SET reversed_by_id = $1::text::uuid WHERE id = $2::text::uuid`,
      [newDistRow.id, distributionId],
    );

    await postgres.query('COMMIT');

    return {
      id: newDistRow.id,
      firm_nr: firmNr,
      period_nr: period,
      distribution_date: newDistRow.distribution_date,
      base_type: prev.base_type,
      base_amount: parseFloat(newDistRow.base_amount || 0),
      total_partner_pct: parseFloat(prev.total_partner_pct || 0),
      trigger_type: 'manual',
      created_by: opts.createdBy,
      notes: newDistRow.notes,
      items: reversedItems,
      created_at: newDistRow.created_at,
    };
  } catch (err) {
    await postgres.query('ROLLBACK');
    throw err;
  }
}
