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
  /** Kaynak tablo — debug / audit için; UI'da gizli. */
  source?: 'sales' | 'beauty_sales';
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
  /**
   * invoiceId → kaynak tablo eşlemesi. `getCustomerOutstandingInvoices`
   * döner; güzellik satışlarında `beauty_sales`, market satışlarında `sales`.
   * Verilirse `paid_amount` UPDATE'i doğru tabloya gider; verilmezse
   * geriye dönük uyumluluk için `sales` varsayılır.
   */
  invoiceSources?: Record<string, 'sales' | 'beauty_sales'>;
}

export interface CollectCustomerDebtResult {
  cashLinesWritten: number;
  totalAmount: number;
  ficheNumbers: string[];
}

/**
 * Cari bakiye tabanlı tahsilat girişi (fatura bazlı değil).
 *
 * Fark: `collectCustomerDebt` fatura başına `paid_amount` günceller
 * (sales/beauty_sales); burada yalnızca cari bakiye + kasa hareketi
 * yazılır — fatura kayıtlarına dokunulmaz. POS ödeme modalındaki
 * minimal badge'in tıklanmasıyla açılan tahsilat modalı bu fonksiyonu
 * kullanır.
 *
 * Muhasebe denetimi (90 yıllık kıdemli muhasebeci):
 *   - Cari alacak azalır (`customers.balance -= amount`).
 *   - Kasa bakiyesi artar (`cash_registers.balance += amount`,
 *     `cash_lines` `CH_TAHSILAT sign=+1`).
 *   - Fatura `paid_amount` alanları güncellenmez (bu modun anlamı
 *     budur) — kullanıcı kasadan borcu kapattığını ayrıca fatura
 *     kaydına yansıtmak isterse fatura bazlı tahsilat ayrı yapılır.
 *   - Idempotent: `fiche_no = TAH-BAL-${customerId}-${epochMs}` aynı
 *     saniye içinde çakışmaz; parent çağrıları tekrar etmemelidir.
 */
export interface CollectCustomerBalanceOnlyInput {
  customerId: string;
  amount: number;
  cashRegisterId: string;
  cashRegisterName?: string;
  cashRegisterCode?: string;
  paymentMethodLabel?: string;
  description?: string;
}

export async function collectCustomerBalanceOnly(
  input: CollectCustomerBalanceOnlyInput,
): Promise<CollectCustomerDebtResult> {
  const result: CollectCustomerDebtResult = {
    cashLinesWritten: 0,
    totalAmount: 0,
    ficheNumbers: [],
  };

  if (!input.customerId) throw new Error('Müşteri seçilmedi.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Tahsilat tutarı geçersiz.');
  }
  if (!input.cashRegisterId) {
    throw new Error('Aktif kasa seçilmedi.');
  }

  const firmNr = String(ERP_SETTINGS.firmNr ?? '').padStart(3, '0').slice(0, 10);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
  const cashLinesTable = `rex_${firmNr}_${periodNr}_cash_lines`;
  const cashRegistersTable = `rex_${firmNr}_cash_registers`;
  const customersTable = `rex_${firmNr}_customers`;

  const tarih = new Date().toISOString();
  const paymentLabel = input.paymentMethodLabel
    ? ` (${input.paymentMethodLabel})`
    : '';
  const aciklama = (input.description || 'Müşteri cari borç tahsilatı') + paymentLabel;

  // Saniye-altı epoch ms ile çakışmayı önle (aynı milisaniyede iki kez
  // çağrılırsa fiche_no aynı olur, ON CONFLICT UPDATE'i tetikler ve
  // amount değişmeden kalır — pratikte UI butonu tekrarı ile aynı
  // saniye içinde olmaz; yine de benzersiz).
  const ficheNo = `TAH-BAL-${input.customerId}-${Date.now()}`;

  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    await writeBalanceOnlyCashLineRest({
      firmNr,
      periodNr,
      cashLinesTable: `/rex_${firmNr}_${periodNr}_cash_lines`,
      cashRegistersPath: `/rex_${firmNr}_cash_registers`,
      customersPath: `/rex_${firmNr}_customers`,
      cashRegisterId: input.cashRegisterId,
      customerId: input.customerId,
      amount: input.amount,
      ficheNo,
      tarih,
      aciklama,
    });
  } else {
    await writeBalanceOnlyCashLineSql({
      cashLinesTable,
      cashRegistersTable,
      customersTable,
      cashRegisterId: input.cashRegisterId,
      customerId: input.customerId,
      amount: input.amount,
      ficheNo,
      tarih,
      aciklama,
      firmNr,
      periodNr,
    });
  }

  result.cashLinesWritten = 1;
  result.totalAmount = input.amount;
  result.ficheNumbers.push(ficheNo);
  return result;
}

async function writeBalanceOnlyCashLineSql(input: {
  cashLinesTable: string;
  cashRegistersTable: string;
  customersTable: string;
  cashRegisterId: string;
  customerId: string;
  amount: number;
  ficheNo: string;
  tarih: string;
  aciklama: string;
  firmNr: string;
  periodNr: string;
}): Promise<void> {
  // 1) cash_lines INSERT (ON CONFLICT UPDATE — idempotent).
  await postgres.query(
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
           updated_at = NOW()`,
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

async function writeBalanceOnlyCashLineRest(input: {
  firmNr: string;
  periodNr: string;
  cashLinesTable: string;
  cashRegistersPath: string;
  customersPath: string;
  cashRegisterId: string;
  customerId: string;
  amount: number;
  ficheNo: string;
  tarih: string;
  aciklama: string;
}): Promise<void> {
  const { postgrest } = await import('./postgrestClient');

  // 1) cash_lines — INSERT veya PATCH
  let existing: { id: string } | null = null;
  try {
    const rows = await postgrest.get<any[]>(
      input.cashLinesTable,
      { fiche_no: `eq.${input.ficheNo}`, select: 'id', limit: 1 },
      { schema: 'public' },
    );
    if (rows?.[0]?.id) existing = rows[0];
  } catch {
    /* yeni INSERT */
  }

  if (existing?.id) {
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
  } else {
    await postgrest.post<any>(
      input.cashLinesTable,
      {
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
      },
      { schema: 'public', prefer: 'return=minimal' },
    );

    // 2) Kasa bakiyesi
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
      console.warn('[CustomerDebtCollection] rest balance-only kasa PATCH failed:', err);
    }

    // 3) Müşteri bakiyesi (alacak azaltma)
    try {
      const cur = await postgrest.get<any[]>(
        input.customersPath,
        { id: `eq.${input.customerId}`, select: 'balance', limit: 1 },
        { schema: 'public' },
      );
      const curBalance = Number(cur?.[0]?.balance ?? 0);
      await postgrest.patch(
        `${input.customersPath}?id=eq.${encodeURIComponent(input.customerId)}`,
        { balance: curBalance - input.amount, updated_at: new Date().toISOString() },
        { schema: 'public' },
      );
    } catch (err) {
      console.warn('[CustomerDebtCollection] rest balance-only cari PATCH failed:', err);
    }
  }
}

/**
 * Müşterinin cari bakiyesi + bekleyen fatura listesi (birlikte).
 *
 * Kök neden (FERHAT'ın müşteri borcu görünmüyor sorunu):
 *   - Müşteri Borcu yalnızca fatura listesi (`getCustomerOutstandingInvoices`)
 *     üzerinden okunuyordu → cari bakiye (customers.balance) göz ardı
 *     ediliyordu. Müşteri daha önce veresiye yazılmış ama henüz
 *     `sales`/`beauty_sales` tablosuna yansımamış bir borç varsa (örn. elle
 *     açılış/devir veya kısmi tahsilat sonrası küsur), cari bakiye görünür
 *     fatura olmadan da borçlu olabilir.
 *   - Cari ekstre zaten `customers.balance` üzerinden bakiye hesaplıyor;
 *     POSPaymentModal'da aynı kaynaktan beslenmeli.
 *
 * Davranış:
 *   - `customers.balance` doğrudan okunur (negatif = müşteri borçlu,
 *     pozitif = müşteri alacaklı). Borçlu ise mutlak değer "Borç" olarak
 *     gösterilir.
 *   - `getCustomerOutstandingInvoices` aynı yapıda korunur (geriye dönük
 *     uyumluluk — POSPaymentModal hâlâ onu kullanıyor) ve ek olarak burada
 *     da çağrılarak UI'a tek tip fatura listesi verilir.
 *
 * Muhasebe denetimi (90 yıllık kıdemli muhasebeci):
 *   - Borç yönü: `customers.balance < 0` ⇒ müşteri borçlu (alacaklı değil).
 *   - Tahsilat: cari alacak azalır (`customers.balance -= amount`, daha az
 *     negatif), kasa bakiyesi artar (`cash_registers.balance += amount`,
 *     `CH_TAHSILAT sign=+1`).
 *   - Fatura listesi ile bakiye senkronu: bakiye 0'a ulaştığında tüm
 *     faturaların `paid_amount` alanı da `total_amount` olur (sales +
 *     beauty_sales için).
 */
export interface CustomerOutstandingBalance {
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  /** customers.balance (negatif = borçlu, pozitif = alacaklı) */
  customerBalance: number;
  /** Bekleyen fatura listesi (sales + beauty_sales) — fatura seçimi için */
  outstandingInvoices: CustomerOutstandingInvoice[];
}

/**
 * Müşterinin cari bakiyesini `customers` tablosundan okur.
 * Negatif = müşteri borçlu (alacaklı değil).
 *
 * DB hatasında 0 döner (graceful) — `getCustomerOutstandingBalance`
 * zaten try/catch ile sarmalıyor; bu tek başına çağrılan yer için de
 * tutarlı davranış: UI'da "yüklenemedi" → bakiye 0 + log.
 */
export async function getCustomerBalance(customerId: string): Promise<number> {
  if (!customerId) return 0;
  const firmNr = String(ERP_SETTINGS.firmNr ?? '').padStart(3, '0').slice(0, 10);
  const customersTable = `rex_${firmNr}_customers`;
  try {
    const res = await postgres.query<{ balance: string | number | null }>(
      `SELECT COALESCE(balance, 0)::numeric AS balance
         FROM ${customersTable}
        WHERE id = $1::text::uuid
        LIMIT 1`,
      [customerId],
      { firmNr },
    );
    const raw = res.rows?.[0]?.balance;
    return Number(raw) || 0;
  } catch (err) {
    console.warn('[CustomerDebtCollection] customers.balance query failed:', err);
    return 0;
  }
}

/**
 * Müşterinin cari bakiyesini + bekleyen fatura listesini birlikte döner.
 * `getCustomerOutstandingInvoices` UI'da hâlâ doğrudan çağrılıyor (özel
 * durumlar için); buradaki amaç POSPaymentModal'ın "Müşteri Borcu" bölümünü
 * tek seferde beslemek (iki ayrı useEffect / iki ayrı yüklemeye gerek yok).
 *
 * - customers.balance sorgusu başarısız olursa `0` döner (graceful), UI'da
 *   "0 IQD · borç yok" gösterilir; hata loglanır.
 * - Fatura listesi sorgusu başarısız olursa boş döner (mevcut
 *   `getCustomerOutstandingInvoices` zaten graceful).
 */
export async function getCustomerOutstandingBalance(
  customerId: string,
): Promise<CustomerOutstandingBalance> {
  if (!customerId) {
    return {
      customerId: '',
      customerCode: null,
      customerName: null,
      customerBalance: 0,
      outstandingInvoices: [],
    };
  }
  const firmNr = String(ERP_SETTINGS.firmNr ?? '').padStart(3, '0').slice(0, 10);
  const customersTable = `rex_${firmNr}_customers`;

  // 1) Cari bakiye + isim/kod (customers tablosu)
  let customerCode: string | null = null;
  let customerName: string | null = null;
  let customerBalance = 0;
  try {
    const customerRow = await postgres.query<{
      id: string;
      code: string | null;
      name: string | null;
      balance: string | number | null;
    }>(
      `SELECT id::text AS id,
              code,
              name,
              COALESCE(balance, 0)::numeric AS balance
         FROM ${customersTable}
        WHERE id = $1::text::uuid
        LIMIT 1`,
      [customerId],
      { firmNr },
    );
    const row = customerRow.rows?.[0];
    if (row) {
      customerCode = row.code ?? null;
      customerName = row.name ?? null;
      customerBalance = Number(row.balance) || 0;
    }
  } catch (err) {
    console.warn('[CustomerDebtCollection] customers.balance query failed:', err);
  }

  // 2) Bekleyen faturalar (sales + beauty_sales) — mevcut fonksiyon kullanılır
  const outstandingInvoices = await getCustomerOutstandingInvoices(customerId).catch(
    (err) => {
      console.warn('[CustomerDebtCollection] outstanding invoices load failed:', err);
      return [] as CustomerOutstandingInvoice[];
    },
  );

  return {
    customerId,
    customerCode,
    customerName,
    customerBalance,
    outstandingInvoices,
  };
}

/** Müşterinin bekleyen (kalan > 0) satış faturalarını listeler. */
export async function getCustomerOutstandingInvoices(
  customerId: string,
): Promise<CustomerOutstandingInvoice[]> {
  if (!customerId) return [];
  const firmNr = String(ERP_SETTINGS.firmNr ?? '').padStart(3, '0').slice(0, 10);
  const periodNr = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
  const salesTable = `rex_${firmNr}_${periodNr}_sales`;
  // Güzellik POS satışları ayrı şemada (beauty.rex_*_*_beauty_sales) — market
  // satışlarıyla birlikte getir. Tek tabloya bağlı kalmak (güzellik müşterisinin
  // borcu görünmez) bug'ın kök nedeni.
  // İki sorgu ayrı çalıştırılır: bir parçadaki kolon eksikliği (örn. eski kurulumda
  // sales.paid_amount yoksa) diğerini etkilemez; ayrıca güzellik faturaları
  // her zaman gelir.
  const beautySalesTable = `beauty.rex_${firmNr}_${periodNr}_beauty_sales`;

  type Row = {
    id: string;
    invoice_no: string;
    invoice_date: string;
    total_amount: string | number;
    paid_amount: string | number;
    remaining: string | number;
    currency: string;
    source: 'sales' | 'beauty_sales';
  };

  const mapRows = (rows: Row[]): CustomerOutstandingInvoice[] =>
    (rows || []).map((r) => ({
      id: String(r.id),
      invoice_no: String(r.invoice_no || ''),
      invoice_date: String(r.invoice_date || ''),
      total_amount: Number(r.total_amount) || 0,
      paid_amount: Number(r.paid_amount) || 0,
      remaining: Number(r.remaining) || 0,
      currency: String(r.currency || 'IQD'),
      source: r.source,
    }));

  const salesSql = `
    SELECT id::text AS id,
           fiche_no AS invoice_no,
           date::text AS invoice_date,
           COALESCE(net_amount, total_net, total_gross, 0)::numeric AS total_amount,
           COALESCE(paid_amount, 0)::numeric AS paid_amount,
           (COALESCE(net_amount, total_net, total_gross, 0) - COALESCE(paid_amount, 0))::numeric AS remaining,
           COALESCE(currency, 'IQD') AS currency,
           'sales'::text AS source
      FROM ${salesTable}
     WHERE customer_id = $1::text::uuid
       AND COALESCE(is_cancelled, false) = false
       AND (COALESCE(net_amount, total_net, total_gross, 0) - COALESCE(paid_amount, 0)) > 0.005
     ORDER BY date ASC, fiche_no ASC
     LIMIT 200
  `;

  const beautySql = `
    SELECT id::text AS id,
           invoice_number AS invoice_no,
           created_at::text AS invoice_date,
           COALESCE(remaining_amount, total - COALESCE(paid_amount, 0), 0)::numeric AS total_amount,
           COALESCE(total - COALESCE(remaining_amount, total), 0)::numeric AS paid_amount,
           COALESCE(remaining_amount, total - COALESCE(paid_amount, 0), 0)::numeric AS remaining,
           COALESCE(currency, 'IQD') AS currency,
           'beauty_sales'::text AS source
      FROM ${beautySalesTable}
     WHERE customer_id = $1::text::uuid
       AND LOWER(COALESCE(payment_status, 'paid')) NOT IN ('cancelled', 'canceled', 'void')
       AND COALESCE(remaining_amount, total - COALESCE(paid_amount, 0), 0) > 0.005
     ORDER BY created_at ASC, invoice_number ASC
     LIMIT 200
  `;

  // İki sorguyu paralel çalıştır; birinin hatası diğerini düşürmesin.
  const [salesResult, beautyResult] = await Promise.allSettled([
    postgres.query<Row>(salesSql, [customerId], { firmNr, periodNr }),
    postgres.query<Row>(beautySql, [customerId], { firmNr, periodNr }),
  ]);

  if (salesResult.status === 'rejected') {
    console.warn('[CustomerDebtCollection] sales query failed:', salesResult.reason);
  }
  if (beautyResult.status === 'rejected') {
    console.warn('[CustomerDebtCollection] beauty_sales query failed:', beautyResult.reason);
  }

  const combined: Row[] = [];
  if (salesResult.status === 'fulfilled') {
    combined.push(...(salesResult.value.rows || []));
  }
  if (beautyResult.status === 'fulfilled') {
    combined.push(...(beautyResult.value.rows || []));
  }

  // Tarihe göre sırala (sales + beauty karışık)
  combined.sort((a, b) => {
    const da = String(a.invoice_date || '');
    const db = String(b.invoice_date || '');
    if (da !== db) return da < db ? -1 : 1;
    return String(a.invoice_no || '').localeCompare(String(b.invoice_no || ''));
  });

  return mapRows(combined.slice(0, 200));
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
  const beautySalesTable = `beauty.rex_${firmNr}_${periodNr}_beauty_sales`;
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

    // Hangi tabloda bu fatura? invoiceSources ile UI tarafı bildirir;
    // verilmemişse (geriye dönük uyumluluk) `sales` varsayılır.
    const source: 'sales' | 'beauty_sales' =
      input.invoiceSources?.[line.id] === 'beauty_sales' ? 'beauty_sales' : 'sales';
    const invoiceSchema = source === 'beauty_sales' ? 'beauty' : 'public';
    const invoiceTableSql =
      source === 'beauty_sales' ? beautySalesTable : salesTable;
    const invoicePath =
      source === 'beauty_sales'
        ? `/rex_${firmNr}_${periodNr}_beauty_sales`
        : `/rex_${firmNr}_${periodNr}_sales`;

    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      await writeCashLineAndUpdateRest({
        firmNr,
        periodNr,
        cashLinesTable: `/rex_${firmNr}_${periodNr}_cash_lines`,
        cashRegistersPath: `/rex_${firmNr}_cash_registers`,
        customersTable: `/rex_${firmNr}_customers`,
        salesPath: invoicePath,
        invoiceSchema,
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
        salesTable: invoiceTableSql,
        salesTableIsBeauty: source === 'beauty_sales',
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
  /** true ise `salesTable` beauty şemasındadır; kalan = total − paid_amount clamp,
   *  beauty_sales kolonları kullanılır (total, remaining_amount). */
  salesTableIsBeauty?: boolean;
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

  // 4) Fatura paid_amount += amount (UPDATE her zaman; idempotent değil ama
  //    cash_lines INSERT'i yalnızca ilk seferde balance değiştiriyor; ek UPDATE
  //    yine de çalışsın — fatura "tamamen ödendi" rozetini güncel tutar).
  //    Tahsilat tutarı fatura tutarından büyükse clamp et.
  //    beauty_sales: total + paid_amount clamp + remaining_amount türetilir.
  if (input.salesTableIsBeauty) {
    // beauty_sales: total sabit, paid_amount artar, remaining_amount = total − paid.
    await postgres.query(
      `UPDATE ${input.salesTable}
          SET paid_amount = LEAST(
                COALESCE(total, 0),
                COALESCE(paid_amount, 0) + $1::numeric
              ),
              remaining_amount = GREATEST(
                0,
                COALESCE(total, 0) - (COALESCE(paid_amount, 0) + $1::numeric)
              ),
              payment_status = CASE
                WHEN COALESCE(total, 0) - (COALESCE(paid_amount, 0) + $1::numeric) <= 0.005
                  THEN 'paid'
                ELSE 'partial'
              END,
              updated_at = NOW()
        WHERE id = $2::text::uuid`,
      [String(input.amount), input.invoiceId],
      { firmNr: input.firmNr, periodNr: input.periodNr },
    );
  } else {
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
  /** beauty_sales için 'beauty'; default 'public'. */
  invoiceSchema?: 'public' | 'beauty';
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

  // 4) sales.paid_amount — RPC yok; PATCH ile clamp.
  //    beauty_sales için paid_amount + remaining_amount + payment_status güncellenir.
  const invoiceSchema = input.invoiceSchema ?? 'public';
  try {
    const cur = await postgrest.get<any[]>(
      input.salesPath,
      {
        id: `eq.${input.invoiceId}`,
        select: invoiceSchema === 'beauty'
          ? 'paid_amount,total'
          : 'paid_amount,net_amount,total_amount',
        limit: 1,
      },
      { schema: invoiceSchema },
    );
    const row = cur?.[0];
    if (row) {
      const paidNow = Number(row.paid_amount ?? 0) + input.amount;
      if (invoiceSchema === 'beauty') {
        const total = Number(row.total ?? 0);
        const remaining = Math.max(0, total - paidNow);
        await postgrest.patch(
          `${input.salesPath}?id=eq.${encodeURIComponent(input.invoiceId)}`,
          {
            paid_amount: Math.min(total, paidNow),
            remaining_amount: remaining,
            payment_status: remaining <= 0.005 ? 'paid' : 'partial',
            updated_at: new Date().toISOString(),
          },
          { schema: invoiceSchema },
        );
      } else {
        const cap = Number(row.net_amount ?? row.total_amount ?? 0);
        const next = Math.min(cap, paidNow);
        await postgrest.patch(
          `${input.salesPath}?id=eq.${encodeURIComponent(input.invoiceId)}`,
          { paid_amount: next, updated_at: new Date().toISOString() },
          { schema: invoiceSchema },
        );
      }
    }
  } catch (err) {
    console.warn('[CustomerDebtCollection] rest sales.paid_amount PATCH failed:', err);
  }
}