/**
 * Cari devir / açılış bakiyesi — eski programdan geçişte borç-alacak devri.
 * Deftere `sales` tablosuna fiche_type=opening_balance satırı yazar (kasa hareketi değil).
 */
import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import type { Supplier } from './suppliers';

export const CARI_OPENING_FICHE_TYPE = 'opening_balance';
export const CARI_OPENING_TRCODE = 99;

export type CariDevirDirection = 'borc' | 'alacak';

export type CariDevirLineInput = {
  accountId: string;
  cardType: 'customer' | 'supplier';
  accountCode?: string;
  accountName?: string;
  /** Mutlak devir tutarı (0'dan büyük) — kullanıcının girdiği para biriminde */
  amount: number;
  direction: CariDevirDirection;
  lineNotes?: string;
  /** Var olan devir fişi — güncelleme modu */
  existingDevirId?: string;
  /**
   * Devir tutarının para birimi. Boşsa `ana_para_birimi` (ledger currency) kullanılır.
   * Geçmişe kayıt: Bu alan INSERT sonrası değiştirilmez, ekstre/mizan sorgularında
   * `currency_rate` ile birlikte kalıcı olarak okunur.
   */
  currency?: string;
  /**
   * Kullanıcının girdiği `currency` → `ledgerCurrency` çevrim kuru.
   * Ledger = ledgerCurrency ise 1; aksi halde kullanıcının girdiği tarihsel kur.
   * Geçmişe kayıt: İlk INSERT anındaki değer korunur; güncelleme yapılırsa
   * manuel `updateCariDevirRecord` ile kullanıcı onayıyla değişir.
   */
  currencyRate?: number;
};

export type CariDevirBatchInput = {
  date: string;
  batchNotes?: string;
  replaceExisting?: boolean;
  lines: CariDevirLineInput[];
  /**
   * Ledger (sistem) para birimi. Satır başında boş `currency` olanlar için
   * bu değer kullanılır; kur dönüşümü `currencyRate` üzerinden yapılır.
   */
  ledgerCurrency?: string;
};

export type CariDevirBatchResult = {
  created: number;
  updated: number;
  replaced: number;
  skipped: number;
  errors: { accountId: string; message: string }[];
};

export type CariDevirRecord = {
  id: string;
  fiche_no: string;
  date: string;
  customer_id: string;
  customer_name: string;
  net_amount: number;
  notes?: string;
  /** INSERT anındaki para birimi (geçmişe kayıt için kalıcı) */
  currency?: string;
  /** INSERT anındaki kur — ledger (sistem) para birimine çevrim oranı (geçmişe kayıt) */
  currency_rate?: number;
};

export function devirDirectionFromNet(net: number): CariDevirDirection {
  return net < 0 ? 'alacak' : 'borc';
}

export function devirAmountFromNet(net: number): number {
  return Math.abs(Number(net) || 0);
}

/** Para birimi kodunu normalize et — boş/null/çok uzun değerleri ele. */
function normalizeCurrencyCode(raw: unknown, fallback = 'IQD'): string {
  const s = String(raw ?? '').trim().toUpperCase().slice(0, 10);
  return s || fallback;
}

/**
 * Devir fişinin **ledger (sistem) para birimi karşılığını** hesapla.
 *
 * - Tutar kullanıcının girdiği `currency` para biriminde.
 * - Ledger = ledgerCurrency ise: `effectiveLedger` = amount (kur anlamsız, 1).
 * - Aksi halde: `effectiveLedger` = amount × currency_rate.
 *
 * Geçmişe kayıt: Bu fonksiyon yalnızca INSERT öncesi hesaplama için kullanılır;
 * ekstre/mizan sorguları `currency_rate` kolonundaki kalıcı değeri kullanır.
 */
export function cariDevirLedgerEquivalent(
  amount: number,
  currency: string,
  currencyRate: number,
  ledgerCurrency: string,
): number {
  const abs = Math.abs(Number(amount) || 0);
  const cur = normalizeCurrencyCode(currency, ledgerCurrency);
  const ledger = normalizeCurrencyCode(ledgerCurrency, 'IQD');
  const rate = Number(currencyRate);
  if (!abs) return 0;
  if (cur === ledger) return abs;
  if (!Number.isFinite(rate) || rate <= 0) return abs;
  return abs * rate;
}

function salesTablePath(firmNr: string, periodNr: string): string {
  const fn = normalizeFirmTableNr(firmNr);
  const pn = String(periodNr ?? '01').padStart(2, '0');
  return `/rex_${fn}_${pn}_sales`;
}

function signedNetAmount(amount: number, direction: CariDevirDirection, cardType: 'customer' | 'supplier'): number {
  const abs = Math.abs(Number(amount) || 0);
  if (!abs) return 0;
  /**
   * Müşteri borç (bize borçlu): +net_amount
   * Müşteri alacak: -net_amount
   * Tedarikçi borç (biz borçluyuz): +net_amount (purchase yönü)
   * Tedarikçi alacak: -net_amount
   */
  if (direction === 'borc') return abs;
  return -abs;
}

async function generateDevirFicheNo(
  firmNr: string,
  periodNr: string,
  accountCode?: string,
): Promise<string> {
  const prefix = `DEV-${String(accountCode || 'CARI').replace(/\s+/g, '').slice(0, 12)}`;
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const path = salesTablePath(firmNr, periodNr);
    const like = `${prefix}-${datePart}-*`;
    const rows = await postgrest.get<any[]>(
      path,
      {
        select: 'fiche_no',
        fiche_no: `like.${like}`,
        order: 'fiche_no.desc',
        limit: 1,
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    const last = Array.isArray(rows) && rows[0]?.fiche_no ? String(rows[0].fiche_no) : '';
    const tail = last.match(/-(\d+)$/)?.[1];
    const next = (tail ? parseInt(tail, 10) : 0) + 1;
    return `${prefix}-${datePart}-${String(next).padStart(3, '0')}`;
  }

  const { rows } = await postgres.query(
    `SELECT fiche_no FROM sales
     WHERE fiche_type = $1 AND fiche_no LIKE $2
     ORDER BY fiche_no DESC LIMIT 1`,
    [CARI_OPENING_FICHE_TYPE, `${prefix}-${datePart}-%`],
    { firmNr, periodNr },
  );
  const last = rows[0]?.fiche_no ? String(rows[0].fiche_no) : '';
  const tail = last.match(/-(\d+)$/)?.[1];
  const next = (tail ? parseInt(tail, 10) : 0) + 1;
  return `${prefix}-${datePart}-${String(next).padStart(3, '0')}`;
}

async function cancelExistingOpeningRows(
  firmNr: string,
  periodNr: string,
  accountId: string,
): Promise<number> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const path = salesTablePath(firmNr, periodNr);
    const filter = `${path}?customer_id=eq.${encodeURIComponent(accountId)}&fiche_type=eq.${CARI_OPENING_FICHE_TYPE}&is_cancelled=eq.false`;
    const existing = await postgrest.get<any[]>(
      path,
      {
        select: 'id',
        customer_id: `eq.${accountId}`,
        fiche_type: `eq.${CARI_OPENING_FICHE_TYPE}`,
        is_cancelled: 'eq.false',
      },
      { schema: 'public' },
    ).catch(() => [] as any[]);
    if (!Array.isArray(existing) || existing.length === 0) return 0;
    await postgrest.patch(filter, { is_cancelled: true }, { schema: 'public', prefer: 'return=minimal' });
    return existing.length;
  }

  const { rowCount } = await postgres.query(
    `UPDATE sales SET is_cancelled = true, updated_at = NOW()
     WHERE customer_id::text = $1::text
       AND fiche_type = $2
       AND COALESCE(is_cancelled, false) = false`,
    [accountId, CARI_OPENING_FICHE_TYPE],
    { firmNr, periodNr },
  );
  return rowCount ?? 0;
}

async function insertOpeningRow(
  firmNr: string,
  periodNr: string,
  line: CariDevirLineInput,
  ficheNo: string,
  dateIso: string,
  batchNotes?: string,
  ledgerCurrency?: string,
): Promise<string> {
  const net = signedNetAmount(line.amount, line.direction, line.cardType);
  const notes = [batchNotes, line.lineNotes, 'Cari devir fişi — eski program açılış bakiyesi']
    .filter(Boolean)
    .join(' | ');

  const ledger = normalizeCurrencyCode(ledgerCurrency, 'IQD');
  const cur = normalizeCurrencyCode(line.currency, ledger);
  const rateNum = Number(line.currencyRate);
  /**
   * Muhasebe denetimi: net_amount (ledger/sistem para biriminde) tutulur.
   * Kullanıcı yabancı döviz girdiyse ledger karşılığı = amount × rate.
   * Aksi halde net_amount = amount (kur anlamsız).
   */
  const ledgerEquivalent =
    cur === ledger ? Math.abs(line.amount) : Number.isFinite(rateNum) && rateNum > 0
      ? Math.abs(line.amount) * rateNum
      : Math.abs(line.amount);
  const finalRate = cur === ledger ? 1 : Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 1;

  const payload = {
    firm_nr: String(firmNr),
    period_nr: String(periodNr),
    fiche_no: ficheNo,
    document_no: ficheNo,
    date: dateIso,
    fiche_type: CARI_OPENING_FICHE_TYPE,
    trcode: CARI_OPENING_TRCODE,
    customer_id: line.accountId,
    customer_name: line.accountName || '',
    total_net: ledgerEquivalent,
    total_vat: 0,
    total_gross: ledgerEquivalent,
    total_discount: 0,
    net_amount: net < 0 ? -ledgerEquivalent : ledgerEquivalent,
    total_cost: 0,
    gross_profit: 0,
    profit_margin: 0,
    currency: cur,
    currency_rate: finalRate,
    status: 'completed',
    payment_method: 'devir',
    is_cancelled: false,
    credit_amount: 0,
    notes,
  };

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.post<any[]>(salesTablePath(firmNr, periodNr), payload, {
      schema: 'public',
      prefer: 'return=representation',
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return String(row?.id || '');
  }

  const { rows } = await postgres.query(
    `INSERT INTO sales (
      firm_nr, period_nr, fiche_no, document_no, date, fiche_type, trcode,
      customer_id, customer_name, total_net, total_vat, total_gross, total_discount,
      net_amount, total_cost, gross_profit, profit_margin, currency, currency_rate,
      status, payment_method, is_cancelled, credit_amount, notes
    ) VALUES (
      $1, $2, $3, $4, $5::timestamptz, $6, $7,
      $8::uuid, $9, $10, 0, $10, 0,
      $11, 0, 0, 0, $12, $13,
      'completed', 'devir', false, 0, $14
    ) RETURNING id`,
    [
      String(firmNr),
      String(periodNr),
      ficheNo,
      ficheNo,
      dateIso,
      CARI_OPENING_FICHE_TYPE,
      CARI_OPENING_TRCODE,
      line.accountId,
      line.accountName || '',
      ledgerEquivalent,
      net < 0 ? -ledgerEquivalent : ledgerEquivalent,
      cur,
      finalRate,
      notes,
    ],
    { firmNr, periodNr },
  );
  return String(rows[0]?.id || '');
}

/** Aktif cari devir fişlerini listele */
export async function listCariDevirRecords(): Promise<CariDevirRecord[]> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.get<any[]>(
      salesTablePath(firmNr, periodNr),
      {
        select: 'id,fiche_no,date,customer_id,customer_name,net_amount,notes,currency,currency_rate',
        fiche_type: `eq.${CARI_OPENING_FICHE_TYPE}`,
        is_cancelled: 'eq.false',
        order: 'date.desc',
        limit: 5000,
      },
      { schema: 'public' },
    );
    return (Array.isArray(rows) ? rows : []).map(mapDevirRow);
  }

  const { rows } = await postgres.query(
    `SELECT id, fiche_no, date, customer_id, customer_name, net_amount, notes,
            currency, currency_rate
     FROM sales
     WHERE fiche_type = $1 AND COALESCE(is_cancelled, false) = false
     ORDER BY date DESC`,
    [CARI_OPENING_FICHE_TYPE],
    { firmNr, periodNr },
  );
  return rows.map(mapDevirRow);
}

function mapDevirRow(r: any): CariDevirRecord {
  const cr = parseFloat(String(r.currency_rate ?? 1));
  return {
    id: String(r.id),
    fiche_no: String(r.fiche_no || ''),
    date: String(r.date || ''),
    customer_id: String(r.customer_id || ''),
    customer_name: String(r.customer_name || ''),
    net_amount: parseFloat(String(r.net_amount ?? 0)) || 0,
    notes: r.notes ? String(r.notes) : undefined,
    currency: r.currency ? String(r.currency) : undefined,
    currency_rate: Number.isFinite(cr) ? cr : undefined,
  };
}

/** Cari başına en güncel devir kaydı */
export async function getCariDevirMapByAccount(): Promise<Map<string, CariDevirRecord>> {
  const list = await listCariDevirRecords();
  const map = new Map<string, CariDevirRecord>();
  for (const row of list) {
    if (!row.customer_id) continue;
    if (!map.has(row.customer_id)) {
      map.set(row.customer_id, row);
    }
  }
  return map;
}

/** Tek devir fişi güncelle */
export async function updateCariDevirRecord(
  id: string,
  input: {
    amount: number;
    direction: CariDevirDirection;
    date?: string;
    notes?: string;
    currency?: string;
    currencyRate?: number;
    /** Ledger (sistem) para birimi — kur dönüşümü için zorunlu */
    ledgerCurrency?: string;
  },
): Promise<void> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const ledger = normalizeCurrencyCode(input.ledgerCurrency, 'IQD');
  const cur = input.currency ? normalizeCurrencyCode(input.currency, ledger) : ledger;
  const rateNum = Number(input.currencyRate);
  const finalRate = cur === ledger ? 1 : Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 1;
  /**
   * Muhasebe denetimi: güncelleme sırasında da ledger karşılığı üzerinden
   * `net_amount` yeniden hesaplanır. Yön (borç/alacak) korunur.
   */
  const ledgerEquivalent = Math.abs(input.amount);
  const net = signedNetAmount(input.amount, input.direction, 'customer');
  const dateIso = input.date
    ? (input.date.includes('T') ? input.date : `${input.date}T12:00:00.000Z`)
    : undefined;
  const patch: Record<string, unknown> = {
    net_amount: net < 0 ? -ledgerEquivalent : ledgerEquivalent,
    total_net: ledgerEquivalent,
    total_gross: ledgerEquivalent,
    currency: cur,
    currency_rate: finalRate,
    updated_at: new Date().toISOString(),
  };
  if (dateIso) patch.date = dateIso;
  if (input.notes !== undefined) patch.notes = input.notes;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    await postgrest.patch(
      `${salesTablePath(firmNr, periodNr)}?id=eq.${encodeURIComponent(id)}`,
      patch,
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }

  await postgres.query(
    `UPDATE sales SET
      net_amount = $1::numeric,
      total_net = $2::numeric,
      total_gross = $2::numeric,
      currency = $6,
      currency_rate = $7,
      date = COALESCE($3::timestamptz, date),
      notes = COALESCE($4, notes),
      updated_at = NOW()
     WHERE id = $5::uuid`,
    [
      net < 0 ? -ledgerEquivalent : ledgerEquivalent,
      ledgerEquivalent,
      dateIso || null,
      input.notes ?? null,
      id,
      cur,
      finalRate,
    ],
    { firmNr, periodNr },
  );
}

/** Devir fişini iptal et */
export async function cancelCariDevirRecord(id: string): Promise<void> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    const { postgrest } = await import('./postgrestClient');
    await postgrest.patch(
      `${salesTablePath(firmNr, periodNr)}?id=eq.${encodeURIComponent(id)}`,
      { is_cancelled: true, updated_at: new Date().toISOString() },
      { schema: 'public', prefer: 'return=minimal' },
    );
    return;
  }

  await postgres.query(
    `UPDATE sales SET is_cancelled = true, updated_at = NOW() WHERE id = $1::uuid`,
    [id],
    { firmNr, periodNr },
  );
}

/** Toplu cari devir fişi oluştur */
export async function createCariDevirBatch(input: CariDevirBatchInput): Promise<CariDevirBatchResult> {
  const firmNr = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const dateIso = input.date.includes('T') ? input.date : `${input.date}T12:00:00.000Z`;
  const replaceExisting = input.replaceExisting !== false;
  const ledgerCurrency = normalizeCurrencyCode(input.ledgerCurrency, 'IQD');

  const result: CariDevirBatchResult = {
    created: 0,
    updated: 0,
    replaced: 0,
    skipped: 0,
    errors: [],
  };

  for (const line of input.lines) {
    const amount = Math.abs(Number(line.amount) || 0);
    if (!amount || !line.accountId) {
      result.skipped += 1;
      continue;
    }
    try {
      if (line.existingDevirId && !replaceExisting) {
        await updateCariDevirRecord(line.existingDevirId, {
          amount,
          direction: line.direction,
          date: input.date,
          notes: [input.batchNotes, line.lineNotes].filter(Boolean).join(' | ') || undefined,
          currency: line.currency,
          currencyRate: line.currencyRate,
          ledgerCurrency,
        });
        result.updated += 1;
        continue;
      }
      if (replaceExisting) {
        result.replaced += await cancelExistingOpeningRows(firmNr, periodNr, line.accountId);
      }
      const ficheNo = await generateDevirFicheNo(firmNr, periodNr, line.accountCode);
      await insertOpeningRow(
        firmNr,
        periodNr,
        { ...line, amount },
        ficheNo,
        dateIso,
        input.batchNotes,
        ledgerCurrency,
      );
      result.created += 1;
    } catch (err: any) {
      result.errors.push({
        accountId: line.accountId,
        message: err?.message || String(err),
      });
    }
  }

  return result;
}

/** Cari kartından tek satır devir */
export async function createSingleCariDevir(
  account: Pick<Supplier, 'id' | 'code' | 'name' | 'cardType'>,
  amount: number,
  direction: CariDevirDirection,
  options?: {
    date?: string;
    notes?: string;
    currency?: string;
    currencyRate?: number;
    ledgerCurrency?: string;
  },
): Promise<void> {
  const cardType = account.cardType === 'supplier' ? 'supplier' : 'customer';
  const batch = await createCariDevirBatch({
    date: options?.date || new Date().toISOString().slice(0, 10),
    batchNotes: options?.notes,
    replaceExisting: true,
    ledgerCurrency: options?.ledgerCurrency,
    lines: [
      {
        accountId: account.id,
        cardType,
        accountCode: account.code,
        accountName: account.name,
        amount,
        direction,
        currency: options?.currency,
        currencyRate: options?.currencyRate,
      },
    ],
  });
  if (batch.errors.length > 0) {
    throw new Error(batch.errors[0].message);
  }
  if (batch.created === 0) {
    throw new Error('Devir fişi oluşturulamadı');
  }
}
