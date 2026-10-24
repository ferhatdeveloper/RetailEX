/**
 * Nakit Akış Raporu — Cari kolonu.
 *
 * Kasa satırı (`cash_lines`) tutarı taşır; unvan çoğu fişte satırda durmaz.
 * Web listesi adı hiç seçmiyordu. Masaüstü sorgusu yalnızca
 * `customer_id` → müşteri kartına bakıyordu. Satış fişinde ad
 * `rex_{firma}_{dönem}_sales` üzerindedir. Rezervasyon tahsilatı
 * `cari_avans.cash_line_id` ile müşteri kartına gider. Gider pusulasında
 * tedarikçi `party_id`, gider carisi `expense_card_id` veya
 * `expenses.cost_center_id` üzerindedir.
 *
 * Ad yoksa boş string döner (ızgara — gösterir). Açıklama cari yerine yazılmaz.
 * Giriş, çıkış ve net tutar bu modülde okunmaz ve değiştirilmez.
 */

export interface CashFlowLineRef {
  id: string;
  ficheNo: string;
  customerId: string;
  partyId: string;
  expenseCardId: string;
  accountName: string;
}

export interface CashFlowNameIndexes {
  /** rex_{firma}_customers.id → name */
  customers: ReadonlyMap<string, string>;
  /** rex_{firma}_suppliers.id → name */
  suppliers: ReadonlyMap<string, string>;
  /** rex_{firma}_parties.id → name */
  parties: ReadonlyMap<string, string>;
  /** rex_{firma}_expense_cards.id → name (gider carisi) */
  expenseCards: ReadonlyMap<string, string>;
  /**
   * Satış fiş no → müşteri adı.
   * Önce satışın customer_id kartı, yoksa sales.customer_name.
   */
  salesCustomerByFiche: ReadonlyMap<string, string>;
  /** cash_lines.id → rezervasyon tahsilatındaki müşteri (cari_avans) */
  reservationCustomerByLineId: ReadonlyMap<string, string>;
  /** cash_lines.id → gider maliyeti merkezi adı (expenses → cost_centers) */
  expenseAccountByLineId: ReadonlyMap<string, string>;
}

export function emptyCashFlowNameIndexes(): CashFlowNameIndexes {
  return {
    customers: new Map(),
    suppliers: new Map(),
    parties: new Map(),
    expenseCards: new Map(),
    salesCustomerByFiche: new Map(),
    reservationCustomerByLineId: new Map(),
    expenseAccountByLineId: new Map(),
  };
}

function cleanName(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * `BEA-2026-00004` olduğu gibi kalır.
 * `BEA-2026-00004-1` ve `BEA-2026-00004-T1` satış başlığına da bakar.
 */
export function cashFlowSalesFicheKeys(ficheNo: string): string[] {
  const fiche = cleanName(ficheNo);
  if (!fiche) return [];
  const keys = [fiche];
  const parts = fiche.split('-');
  if (parts.length >= 4) {
    const last = parts[parts.length - 1] || '';
    if (/^(?:T)?\d+$/i.test(last)) {
      const base = parts.slice(0, -1).join('-');
      if (base && base !== fiche) keys.push(base);
    }
  }
  return keys;
}

export function resolveCashFlowLineAccountName(
  line: CashFlowLineRef,
  indexes: CashFlowNameIndexes,
): string {
  const existing = cleanName(line.accountName);
  if (existing) return existing;

  const customerId = cleanName(line.customerId);
  const partyId = cleanName(line.partyId);
  const cardId = cleanName(line.expenseCardId);

  const customerName = customerId ? indexes.customers.get(customerId) : '';
  const supplierName =
    (partyId ? indexes.suppliers.get(partyId) : '') ||
    (!partyId && customerId ? indexes.suppliers.get(customerId) : '') ||
    '';
  const partyName =
    (partyId ? indexes.parties.get(partyId) : '') ||
    (!partyId && customerId ? indexes.parties.get(customerId) : '') ||
    '';
  const expenseCardName = cardId ? indexes.expenseCards.get(cardId) : '';

  let salesCustomerName = '';
  for (const key of cashFlowSalesFicheKeys(line.ficheNo)) {
    const found = indexes.salesCustomerByFiche.get(key);
    if (cleanName(found)) {
      salesCustomerName = cleanName(found);
      break;
    }
  }

  const reservationCustomerName = line.id
    ? indexes.reservationCustomerByLineId.get(line.id)
    : '';
  const expenseAccountName = line.id ? indexes.expenseAccountByLineId.get(line.id) : '';

  const ordered = [
    customerName,
    supplierName,
    partyName,
    expenseCardName,
    salesCustomerName,
    reservationCustomerName,
    expenseAccountName,
  ];
  for (const raw of ordered) {
    const name = cleanName(raw);
    if (name) return name;
  }
  return '';
}

/** Tutar alanları aynı kalır; yalnızca accountName dolar. */
export function applyCashFlowAccountName<
  T extends { amount: number; sign: number; netAmount: number; accountName: string },
>(row: T, line: CashFlowLineRef, indexes: CashFlowNameIndexes): T {
  const accountName = resolveCashFlowLineAccountName(line, indexes);
  if (accountName === row.accountName) return row;
  return { ...row, accountName };
}

/**
 * Masaüstü nakit akış sorgusuna eklenecek cari ifadesi.
 * Her bağ LATERAL LIMIT 1 — satır çoğalmaz, giriş/çıkış toplamı değişmez.
 * Banka satırında party_id ve expense_card_id yoktur.
 */
export function cashFlowAccountSql(
  lineAlias: 'cl' | 'bl',
  avansTable: string,
): { selectExpr: string; joins: string } {
  const a = lineAlias;
  const cash = a === 'cl';
  const accountWhere = cash
    ? `id = ${a}.party_id OR (${a}.party_id IS NULL AND id = ${a}.customer_id)`
    : `id = ${a}.customer_id`;
  const cardJoin = cash
    ? `
        LEFT JOIN LATERAL (
          SELECT name FROM expense_cards WHERE id = ${a}.expense_card_id LIMIT 1
        ) cf_card ON TRUE`
    : '';
  const expenseJoin = cash
    ? `
        LEFT JOIN LATERAL (
          SELECT cc.name
            FROM expenses ex
            JOIN cost_centers cc ON cc.id = ex.cost_center_id
           WHERE ex.cash_line_id = ${a}.id
           LIMIT 1
        ) cf_cc ON TRUE`
    : '';
  const cardExpr = cash ? `NULLIF(BTRIM(cf_card.name), ''),` : '';
  const centerExpr = cash ? `NULLIF(BTRIM(cf_cc.name), ''),` : '';
  const selectExpr = `COALESCE(
          NULLIF(BTRIM(cf_cust.name), ''),
          NULLIF(BTRIM(cf_sup.name), ''),
          NULLIF(BTRIM(cf_pty.name), ''),
          ${cardExpr}
          NULLIF(BTRIM(cf_sale_cust.name), ''),
          NULLIF(BTRIM(cf_sale.customer_name), ''),
          NULLIF(BTRIM(cf_avans.name), ''),
          ${centerExpr}
          ''
        )`;
  const joins = `
        LEFT JOIN LATERAL (
          SELECT name FROM customers WHERE id = ${a}.customer_id LIMIT 1
        ) cf_cust ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM suppliers WHERE ${accountWhere} LIMIT 1
        ) cf_sup ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM parties WHERE ${accountWhere} LIMIT 1
        ) cf_pty ON TRUE${cardJoin}
        LEFT JOIN LATERAL (
          SELECT sl.customer_id, sl.customer_name
            FROM sales sl
           WHERE sl.fiche_no = ${a}.fiche_no
              OR (
                COALESCE(array_length(string_to_array(${a}.fiche_no, '-'), 1), 0) >= 4
                AND ${a}.fiche_no ~ '-(T)?[0-9]+$'
                AND sl.fiche_no = regexp_replace(${a}.fiche_no, '-(T)?[0-9]+$', '')
              )
           ORDER BY CASE WHEN sl.fiche_no = ${a}.fiche_no THEN 0 ELSE 1 END
           LIMIT 1
        ) cf_sale ON TRUE
        LEFT JOIN LATERAL (
          SELECT name FROM customers WHERE id = cf_sale.customer_id LIMIT 1
        ) cf_sale_cust ON TRUE
        LEFT JOIN LATERAL (
          SELECT cu.name
            FROM ${avansTable} av
            JOIN customers cu ON cu.id = av.customer_id
           WHERE av.cash_line_id = ${a}.id
           LIMIT 1
        ) cf_avans ON TRUE${expenseJoin}`;
  return { selectExpr, joins };
}
