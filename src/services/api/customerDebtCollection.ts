/**
 * Müşteri cari borç tahsilatı — POS ödeme modalı akışı.
 *
 * Kural:
 * - Müşterinin bekleyen (ödenmemiş) satış faturaları listelenir.
 * - Kullanıcı bir veya birden fazla faturayı seçer → tahsilat oluştur.
 * - Tahsilat: cash_lines CH_TAHSILAT + customers.balance -= amount
 *   (cari alacak azalır, kasa bakiyesi artar).
 *
 * Mevcut kanıtlanmış altyapıya dayanır:
 *   - invoices.ts → writeCashRegisterLineSql / writeCashRegisterLineRest
 *   - customers.ts → customerAPI.addBalance
 *
 * Bu modül POS'un cari borç tahsilatı için public yüzeydir.
 * "Kalanı cariye yaz" ile **ters** yönde çalışır: orada cari borç artarken
 * burada cari alacak azalır (müşterinin kasadan borcu ödenir).
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

export interface CustomerOutstandingInvoice {
  id: string;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  remaining: number;
  currency?: string;
}

export interface CollectCustomerDebtInput {
  customerId: string;
  invoiceIds: string[];
  /** Tahsil edilen toplam tutar (IQD tabanlı). Ödeme modalındaki kasa ile yazılır. */
  amount: number;
  /** Aktif kasa UUID'si; POS'tan seçilen kasa. */
  cashRegisterId: string;
  cashRegisterName?: string;
  cashRegisterCode?: string;
  /** Ödeme yöntemi etiketi (nakit/kart) — tahsilat fişine yazılır. */
  paymentMethodLabel?: string;
  /** İsteğe bağlı açıklama (varsayılan: "Müşteri cari borç tahsilatı"). */
  description?: string;
}

export interface CollectCustomerDebtResult {
  cashLinesWritten: number;
  totalAmount: number;
  ficheNumbers: string[];
}

/** Müşterinin bekleyen (kalan > 0) satış faturalarını listeler. */
export async function getCustomerOutstandingInvoices(
  customerId: string,
): Promise<CustomerOutstandingInvoice[]> {
  if (!customerId) return [];
  const firmNr = String(ERP_SETTINGS.firmNr ?? '').padStart(3, '0').slice(0, 10);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
  const salesTable = `rex_${firmNr}_${periodNr}_sales`;

  // remaining: net_amount (KDV hariç tutar) — bakiye borç hesabı net üzerinden
  // gidiyor; tahsil edilen kısım da net ile yazılır. Çift sayımı önler.
  // paid_amount kolonu yoksa 0 kabul edilir.
  const sql = `
    SELECT id::text AS id,
           fiche_no AS invoice_no,
           date::text AS invoice_date,
           COALESCE(net_amount, total_amount, 0)::numeric AS total_amount,
           COALESCE(paid_amount, 0)::numeric AS paid_amount,
           (COALESCE(net_amount, total_amount, 0) - COALESCE(paid_amount, 0))::numeric AS remaining,
           COALESCE(currency, 'IQD') AS currency
      FROM ${salesTable}
     WHERE customer_id = $1::text::uuid
       AND COALESCE(is_cancelled, false) = false
       AND (COALESCE(net_amount, total_amount, 0) - COALESCE(paid_amount, 0)) > 0.005
     ORDER BY date ASC, fiche_no ASC
     LIMIT 200
  `;

  try {
    const { rows } = await postgres.query<{
      id: string;
      invoice_no: string;
      invoice_date: string;
      total_amount: string | number;
      paid_amount: string | number;
      remaining: string | number;
      currency: string;
    }>(sql, [customerId], { firmNr, periodNr });

    return (rows || []).map((r) => ({
      id: String(r.id),
      invoice_no: String(r.invoice_no || ''),
      invoice_date: String(r.invoice_date || ''),
      total_amount: Number(r.total_amount) || 0,
      paid_amount: Number(r.paid_amount) || 0,
      remaining: Number(r.remaining) || 0,
      currency: String(r.currency || 'IQD'),
    }));
  } catch (err) {
    console.warn('[CustomerDebtCollection] getCustomerOutstandingInvoices failed:', err);
    return [];
  }
}

/**
 * Seçili faturaları tahsilat olarak kapatır.
 * Her fatura için:
 *   - cash_lines (fiche_no = `TAH-{invoiceId}`) CH_TAHSILAT, sign=+1
 *   - sales.paid_amount += amount
 *   - customers.balance -= amount (cari alacak azalır)
 *
 * Idempotent: aynı fatura için ikinci kez çağrılırsa cash_lines
 * fiche_no UNIQUE constraint'i ile update'e düşer; net etki sıfır olur
 * (paid_amount zaten total_amount olmuştur).
 *
 * **Muhasebe denetimi:**
 * - Tahsilat: cari alacak − (müşteri), kasa/banka + (CH_TAHSILAT sign=+1).
 * - "Kalanı cariye yaz" (veresiye) ile **ters yön**: orada cari borç artıyor,
 *   burada cari alacak azalıyor. İkisi birlikte: borç kapatma (tahsilat) vs.
 *   borç oluşturma (veresiye). Sembollerin yönü farklı.
 */
export async function collectCustomerDebt(
  input: CollectCustomerDebtInput,
): Promise<CollectCustomerDebtResult> {
  const result: CollectCustomerDebtResult = {
    cashLinesWritten: 0,
    totalAmount: 0,
    ficheNumbers: [],
  };

  if (!input.customerId) throw new Error('Müşteri seçilmedi.');
  if (!Array.isArray(input.invoiceIds) || input.invoiceIds.length === 0) {
    throw new Error('Tahsil edilecek fatura seçilmedi.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Tahsilat tutarı geçersiz.');
  }
  if (!input.cashRegisterId) {
    throw new Error('Aktif kasa seçilmedi.');
  }

  // Fatura başına eşit dağıtım (kuruş yuvarlama payı son satıra düşer).
  const perInvoice = input.invoiceIds.map((id) => ({
    id,
    amount: input.amount / input.invoiceIds.length,
  }));
  // Yuvarlama farkını son satıra ekle (IQD 0 ondalık; 2 ondalık para birimi
  // için POS tarafı kendi yuvarlamasını uygulamış olabilir; burada sade tutuyoruz).
  const epsilon = 0.000001;
  const sumRounded = perInvoice.reduce((s, x) => s + x.amount, 0);
  const diff = input.amount - sumRounded;
  if (Math.abs(diff) > epsilon && perInvoice.length > 0) {
    perInvoice[perInvoice.length - 1].amount += diff;
  }

  const firmNr = String(ERP_SETTINGS.firmNr ?? '').padStart(3, '0').slice(0, 10);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
  const cashLinesTable = `rex_${firmNr}_${periodNr}_cash_lines`;
  const salesTable = `rex_${firmNr}_${periodNr}_sales`;
  const cashRegistersTable = `rex_${firmNr}_cash_registers`;
  const customersTable = `rex_${firmNr}_customers`;

  // Tek tarih — gün içi birden fazla tahsilat aynı tarihle yazılır.
  const tarih = new Date().toISOString();
  const paymentLabel = input.paymentMethodLabel
    ? ` (${input.paymentMethodLabel})`
    : '';
  const aciklama = (input.description || 'Müşteri cari borç tahsilatı') + paymentLabel;

  for (const line of perInvoice) {
    const amt = Math.max(0, line.amount);
    if (amt <= 0) continue;
    const ficheNo = `TAH-${line.id}`;

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      await writeCashLineAndUpdateRest({
        firmNr,
        periodNr,
        cashLinesTable: `/rex_${firmNr}_${periodNr}_cash_lines`,
        cashRegistersPath: `/rex_${firmNr}_cash_registers`,
        customersTable: `/rex_${firmNr}_customers`,
        salesPath: `/rex_${firmNr}_${periodNr}_sales`,
        cashRegisterId: input.cashRegisterId,
        customerId: input.customerId,
        invoiceId: line.id,
        amount: amt,
        ficheNo,
        tarih,
        aciklama,
      });
    } else {
      await writeCashLineAndUpdateSql({
        cashLinesTable,
        cashRegistersTable,
        customersTable,
        salesTable,
        cashRegisterId: input.cashRegisterId,
        customerId: input.customerId,
        invoiceId: line.id,
        amount: amt,
        ficheNo,
        tarih,
        aciklama,
        firmNr,
        periodNr,
      });
    }

    result.cashLinesWritten += 1;
    result.totalAmount += amt;
    result.ficheNumbers.push(ficheNo);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  SQL implementation                                                */
/* ------------------------------------------------------------------ */

async function writeCashLineAndUpdateSql(input: {
  cashLinesTable: string;
  cashRegistersTable: string;
  customersTable: string;
  salesTable: string;
  cashRegisterId: string;
  customerId: string;
  invoiceId: string;
  amount: number;
  ficheNo: string;
  tarih: string;
  aciklama: string;
  firmNr: string;
  periodNr: string;
}): Promise<void> {
  // 1) cash_lines INSERT (ON CONFLICT UPDATE — idempotent).
  //    sign=+1, transaction_type='CH_TAHSILAT' → kasa bakiyesi artar.
  const upsert = await postgres.query<{ id: string; inserted: boolean }>(
    `INSERT INTO ${input.cashLinesTable} (
       firm_nr, period_nr, register_id, fiche_no, date, amount, sign,
       definition, transaction_type, customer_id, currency_code, exchange_rate
     ) VALUES (
       $1::text, $2::text, $3::text::uuid, $4::text, $5::text,
       $6::numeric, 1::integer, $7::text, 'CH_TAHSILAT'::text,
       $8::text::uuid, 'YEREL'::text, 1::numeric
     )
     ON CONFLICT (fiche_no) DO UPDATE
       SET amount = EXCLUDED.amount,
           date = EXCLUDED.date,
           definition = EXCLUDED.definition,
           register_id = EXCLUDED.register_id,
           updated_at = NOW()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      input.firmNr,
      input.periodNr,
      input.cashRegisterId,
      input.ficheNo,
      input.tarih,
      input.amount,
      input.aciklama,
      input.customerId,
    ],
    { firmNr: input.firmNr, periodNr: input.periodNr },
  );
  const inserted = upsert.rows?.[0]?.inserted === true;

  if (inserted) {
    // 2) Kasa bakiyesi +amount
    await postgres.query(
      `UPDATE ${input.cashRegistersTable}
          SET balance = COALESCE(balance, 0) + $1::numeric,
              updated_at = NOW()
        WHERE id = $2::text::uuid`,
      [String(input.amount), input.cashRegisterId],
      { firmNr: input.firmNr },
    );

    // 3) Müşteri cari alacağı −amount (CH_TAHSILAT müşteri tarafında alacak azaltır)
    await postgres.query(
      `UPDATE ${input.customersTable}
          SET balance = COALESCE(balance, 0) - $1::numeric,
              updated_at = NOW()
        WHERE id = $2::text::uuid`,
      [String(input.amount), input.customerId],
      { firmNr: input.firmNr },
    );
  }

  // 4) sales.paid_amount += amount (UPDATE her zaman; idempotent değil ama
  //    cash_lines INSERT'i yalnızca ilk seferde balance değiştiriyor; ek UPDATE
  //    yine de çalışsın — fatura "tamamen ödendi" rozetini güncel tutar).
  //    Ancak tahsilat tutarı fatura tutarından büyükse clamp et.
  await postgres.query(
    `UPDATE ${input.salesTable}
        SET paid_amount = LEAST(
              COALESCE(net_amount, total_amount, 0),
              COALESCE(paid_amount, 0) + $1::numeric
            ),
            updated_at = NOW()
      WHERE id = $2::text::uuid`,
    [String(input.amount), input.invoiceId],
    { firmNr: input.firmNr, periodNr: input.periodNr },
  );
}

/* ------------------------------------------------------------------ */
/*  PostgREST implementation                                          */
/* ------------------------------------------------------------------ */

async function writeCashLineAndUpdateRest(input: {
  firmNr: string;
  periodNr: string;
  cashLinesTable: string;
  cashRegistersPath: string;
  customersTable: string;
  salesPath: string;
  cashRegisterId: string;
  customerId: string;
  invoiceId: string;
  amount: number;
  ficheNo: string;
  tarih: string;
  aciklama: string;
}): Promise<void> {
  const { postgrest } = await import('./postgrestClient');

  // 1) cash_lines — var mı? (idempotent)
  let existing: { id: string } | null = null;
  try {
    const rows = await postgrest.get<any[]>(
      input.cashLinesTable,
      { fiche_no: `eq.${input.ficheNo}`, select: 'id', limit: 1 },
      { schema: 'public' },
    );
    if (rows?.[0]?.id) existing = rows[0];
  } catch {
    /* yeni INSERT kabul */
  }

  const body: Record<string, unknown> = {
    firm_nr: input.firmNr,
    period_nr: input.periodNr,
    register_id: input.cashRegisterId,
    fiche_no: input.ficheNo,
    date: input.tarih,
    amount: input.amount,
    sign: 1,
    definition: input.aciklama,
    transaction_type: 'CH_TAHSILAT',
    customer_id: input.customerId,
    currency_code: 'YEREL',
    exchange_rate: 1,
  };

  let insertedOk = false;
  if (existing?.id) {
    try {
      await postgrest.patch(
        `${input.cashLinesTable}?id=eq.${existing.id}`,
        {
          amount: input.amount,
          date: input.tarih,
          definition: input.aciklama,
          register_id: input.cashRegisterId,
          customer_id: input.customerId,
        },
        { schema: 'public' },
      );
    } catch (err) {
      console.warn('[CustomerDebtCollection] rest cash_lines PATCH failed:', err);
    }
  } else {
    try {
      await postgrest.post<any>(input.cashLinesTable, body, {
        schema: 'public',
        prefer: 'return=minimal',
      });
      insertedOk = true;
    } catch (err) {
      // Çakışma → PATCH'e düş
      try {
        await postgrest.patch(
          `${input.cashLinesTable}?fiche_no=eq.${input.ficheNo}`,
          {
            amount: input.amount,
            date: input.tarih,
            definition: input.aciklama,
            register_id: input.cashRegisterId,
            customer_id: input.customerId,
          },
          { schema: 'public' },
        );
      } catch (patchErr) {
        console.error('[CustomerDebtCollection] rest cash_lines INSERT/PATCH failed:', patchErr);
        throw patchErr;
      }
    }
  }

  if (insertedOk) {
    // 2) Kasa bakiyesi: GET + PATCH
    try {
      const cur = await postgrest.get<any[]>(
        input.cashRegistersPath,
        { id: `eq.${input.cashRegisterId}`, select: 'balance', limit: 1 },
        { schema: 'public' },
      );
      const curBalance = Number(cur?.[0]?.balance ?? 0);
      await postgrest.patch(
        `${input.cashRegistersPath}?id=eq.${encodeURIComponent(input.cashRegisterId)}`,
        { balance: curBalance + input.amount, updated_at: new Date().toISOString() },
        { schema: 'public' },
      );
    } catch (err) {
      console.warn('[CustomerDebtCollection] rest kasa bakiye PATCH failed:', err);
    }

    // 3) Müşteri bakiyesi: GET + PATCH (alacak azaltma)
    try {
      const cur = await postgrest.get<any[]>(
        input.customersTable,
        { id: `eq.${input.customerId}`, select: 'balance', limit: 1 },
        { schema: 'public' },
      );
      const curBalance = Number(cur?.[0]?.balance ?? 0);
      await postgrest.patch(
        `${input.customersTable}?id=eq.${encodeURIComponent(input.customerId)}`,
        { balance: curBalance - input.amount, updated_at: new Date().toISOString() },
        { schema: 'public' },
      );
    } catch (err) {
      console.warn('[CustomerDebtCollection] rest customer balance PATCH failed:', err);
    }
  }

  // 4) sales.paid_amount — RPC yok; PATCH ile clamp
  try {
    const cur = await postgrest.get<any[]>(
      input.salesPath,
      {
        id: `eq.${input.invoiceId}`,
        select: 'paid_amount,net_amount,total_amount',
        limit: 1,
      },
      { schema: 'public' },
    );
    const row = cur?.[0];
    if (row) {
      const cap = Number(row.net_amount ?? row.total_amount ?? 0);
      const next = Math.min(cap, Number(row.paid_amount ?? 0) + input.amount);
      await postgrest.patch(
        `${input.salesPath}?id=eq.${encodeURIComponent(input.invoiceId)}`,
        { paid_amount: next, updated_at: new Date().toISOString() },
        { schema: 'public' },
      );
    }
  } catch (err) {
    console.warn('[CustomerDebtCollection] rest sales.paid_amount PATCH failed:', err);
  }
}