/**
 * Müşteri / tedarikçi bazlı satış raporu sorgusu.
 *
 * Kimlik kolonları kiracıdan kiracıya uuid veya metin olabilir. İki tarafı
 * farklı tipe zorlamak (uuid = metin, veya tarih metnini uuid dizisine
 * çevirmek) sorguyu `Database query failed` ile düşürür. Eşleme iki tarafta
 * da metindir; geçersiz uuid metni sorguyu patlatmaz.
 *
 * Net tutar SQL'de brüt + iade diye toplanmaz. İade kovası işaretli kalır;
 * ekran `settlePartySalesPeriodNet` ile brüt − |iade| hesaplar.
 */
import { SQL_COUNTABLE_SALE_STATUS } from './saleInvoiceStatus';

const sqlUtcDate = (col: string) => `(${col}::timestamptz AT TIME ZONE 'UTC')::date`;

/** Karşılaştırma anahtarı. uuid, metin veya sayı — hepsi metne iner. */
function sqlTextKey(expr: string): string {
  return `NULLIF(lower(trim((${expr})::text)), '')`;
}

export function normalizePartySalesPartyIds(partyIds: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of partyIds ?? []) {
    const id = String(raw ?? '').trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function buildPartySalesByPeriodSql(opts: {
  cardType: 'customer' | 'supplier';
  partyIds?: string[];
}): string {
  const cardType = opts.cardType === 'supplier' ? 'supplier' : 'customer';
  const partyCol = cardType === 'supplier' ? 'suppliers' : 'customers';
  const partyAlias = cardType === 'supplier' ? 'sup' : 'c';
  const partyIdCol = 'customer_id';
  const partyIds = normalizePartySalesPartyIds(opts.partyIds);
  const hasParty = partyIds.length > 0;
  const partyParam = '$3::text[]';
  const salePartyMatch = hasParty
    ? `AND ${sqlTextKey(`s.${partyIdCol}`)} = ANY(${partyParam})`
    : '';
  const cardPartyMatch = hasParty
    ? `AND ${sqlTextKey(`${partyAlias}.id`)} = ANY(${partyParam})`
    : '';
  const ficheFilter =
    cardType === 'customer'
      ? `lower(trim(COALESCE(s.fiche_type, ''))) IN ('sales_invoice', 'service', 'hizmet', 'return_invoice')`
      : `(lower(trim(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'return_invoice') OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42))`;
  const partyKey = sqlTextKey(`s.${partyIdCol}`);
  const cardKey = sqlTextKey(`${partyAlias}.id`);
  const invoiceKey = sqlTextKey('si.invoice_id');
  const saleKey = sqlTextKey('s.id');

  return `
      WITH sale_lines AS (
        SELECT
          s.id,
          ${partyKey} AS party_id,
          lower(trim(COALESCE(s.fiche_type, ''))) AS fiche_type,
          -- Brüt belge tutarı total_net. Eski kayıtta total_net boşsa net_amount.
          -- İade fişi artı da eksi de olabilir; işaret burada korunur.
          COALESCE(NULLIF(s.total_net, 0), s.net_amount, 0) AS doc_amount,
          COALESCE(s.paid_amount, 0) AS paid_amount,
          COALESCE(s.credit_amount, 0) AS credit_amount,
          COALESCE(s.date, s.created_at) AS doc_date,
          COALESCE((
            SELECT SUM(COALESCE(si.quantity, 0))
            FROM sale_items si
            WHERE ${invoiceKey} = ${saleKey}
          ), 0) AS total_quantity
        FROM sales s
        WHERE COALESCE(s.is_cancelled, false) = false
          AND ${SQL_COUNTABLE_SALE_STATUS}
          AND ${ficheFilter}
          AND ${sqlUtcDate('COALESCE(s.date, s.created_at)')} BETWEEN $1 AND $2
          ${salePartyMatch}
      ),
      party_totals AS (
        SELECT
          party_id,
          SUM(CASE WHEN fiche_type <> 'return_invoice' THEN doc_amount ELSE 0 END) AS gross_amount,
          SUM(CASE WHEN fiche_type = 'return_invoice' THEN doc_amount ELSE 0 END) AS return_amount,
          SUM(CASE WHEN fiche_type <> 'return_invoice' THEN total_quantity ELSE 0 END) AS gross_quantity,
          SUM(CASE WHEN fiche_type = 'return_invoice' THEN total_quantity ELSE 0 END) AS return_quantity,
          COUNT(*) FILTER (WHERE fiche_type <> 'return_invoice') AS gross_count,
          COUNT(*) FILTER (WHERE fiche_type = 'return_invoice') AS return_count,
          SUM(CASE WHEN fiche_type <> 'return_invoice' THEN paid_amount ELSE 0 END) AS paid_amount,
          SUM(CASE WHEN fiche_type <> 'return_invoice' THEN credit_amount ELSE 0 END)
            - SUM(CASE WHEN fiche_type <> 'return_invoice' THEN paid_amount ELSE 0 END) AS remaining_debt,
          MAX(${sqlUtcDate('doc_date')}) AS last_sale_date
        FROM sale_lines
        WHERE party_id IS NOT NULL
        GROUP BY party_id
      )
      SELECT
        ${partyAlias}.id::text AS party_id,
        COALESCE(${partyAlias}.code, '') AS party_code,
        COALESCE(${partyAlias}.name, '') AS party_name,
        COALESCE(${partyAlias}.phone, '') AS phone,
        COALESCE(${partyAlias}.balance, 0) AS current_balance,
        COALESCE(pt.gross_amount, 0) AS gross_amount,
        COALESCE(pt.return_amount, 0) AS return_amount,
        COALESCE(pt.gross_quantity, 0) AS gross_quantity,
        COALESCE(pt.return_quantity, 0) AS return_quantity,
        COALESCE(pt.gross_count, 0) AS gross_count,
        COALESCE(pt.return_count, 0) AS return_count,
        COALESCE(pt.paid_amount, 0) AS paid_amount,
        COALESCE(pt.remaining_debt, 0) AS remaining_debt,
        COALESCE(pt.last_sale_date::text, '') AS last_sale_date
      FROM ${partyCol} ${partyAlias}
      LEFT JOIN party_totals pt ON pt.party_id = ${cardKey}
      WHERE COALESCE(${partyAlias}.is_active, true) = true
        ${cardPartyMatch}
      ORDER BY COALESCE(pt.gross_amount, 0) DESC, ${partyAlias}.name ASC
    `;
}
