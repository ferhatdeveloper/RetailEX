/**
 * Randevu iptali yalnız seçilen fişe yazılır.
 *
 * Kimlik: randevu id, satış grubu, fiş no veya fatura no.
 * Aynı faturanın hizmet satırları birlikte iptal olur.
 * Başka fatura, aynı cari olsa da durur.
 * Müşteri adı, cari kod ve cari id toplu iptal anahtarı değildir.
 */

export interface BeautyCancelSubject {
  id?: string | null;
  sale_group_id?: string | null;
  saleGroupId?: string | null;
  remainder_sale_id?: string | null;
  saleId?: string | null;
  remainder_sale_fiche_no?: string | null;
  invoice_number?: string | null;
  invoiceNumber?: string | null;
  fiche_no?: string | null;
  ficheNo?: string | null;
  deposit_sale_id?: string | null;
  depositSaleId?: string | null;
  customer_id?: string | null;
  client_id?: string | null;
  customerId?: string | null;
  customer_code?: string | null;
  customerCode?: string | null;
  customer_name?: string | null;
  customerName?: string | null;
  status?: string | null;
  payment_status?: string | null;
  paymentStatus?: string | null;
  deposit_amount?: number | null;
  depositAmount?: number | null;
  linked_appointment_id?: string | null;
  linkedAppointmentId?: string | null;
  notes?: string | null;
}

export interface BeautyCancelSqlArgs {
  appointmentIds: string[];
  saleGroupIds: string[];
  saleIds: string[];
  ficheNos: string[];
  notePatterns: string[];
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function norm(value: unknown): string {
  return text(value).toLocaleLowerCase('tr');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = norm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text(value));
  }
  return out;
}

/** Satış grubu, fatura / fiş no. Randevu id'si ve cari burada yoktur. */
export function beautyCancelSharedKeys(row: BeautyCancelSubject | null | undefined): string[] {
  if (!row) return [];
  const keys: string[] = [];
  const group = text(row.sale_group_id ?? row.saleGroupId);
  if (group) keys.push(`group:${norm(group)}`);
  const sale = text(row.remainder_sale_id ?? row.saleId);
  if (sale) keys.push(`sale:${norm(sale)}`);
  const fiches = [
    row.remainder_sale_fiche_no,
    row.invoice_number,
    row.invoiceNumber,
    row.fiche_no,
    row.ficheNo,
  ];
  for (const fiche of fiches) {
    const value = text(fiche);
    if (value) keys.push(`fiche:${norm(value)}`);
  }
  return keys;
}

export function beautyCancelSqlArgsFromRow(row: BeautyCancelSubject | null | undefined): BeautyCancelSqlArgs {
  const id = text(row?.id);
  const group = text(row?.sale_group_id ?? row?.saleGroupId);
  const saleIds = unique([
    text(row?.remainder_sale_id ?? row?.saleId),
    text(row?.deposit_sale_id ?? row?.depositSaleId),
  ]);
  const ficheNos = unique([
    text(row?.remainder_sale_fiche_no),
    text(row?.invoice_number ?? row?.invoiceNumber),
    text(row?.fiche_no ?? row?.ficheNo),
  ]);
  return {
    appointmentIds: id ? [id] : [],
    saleGroupIds: group ? [group] : [],
    saleIds,
    ficheNos,
    notePatterns: id ? [`%rex_appt:${id}%`] : [],
  };
}

/**
 * Seçilen randevu ile aynı fatura / satış grubu / fiş.
 * Cari aynı olsa da diğer randevu gelmez.
 * Kimlik boşsa yalnız seçilen randevu id'si kalır.
 */
export function beautyCancelTargets<T extends BeautyCancelSubject>(
  primary: T,
  pool: readonly T[] | null | undefined,
): T[] {
  const primaryId = text(primary?.id);
  const source = (pool || []).some((row) => text(row?.id) === primaryId && primaryId)
    ? [...(pool || [])]
    : [primary, ...(pool || [])];
  const shared = new Set(beautyCancelSharedKeys(primary));
  const matched = source.filter((row) => {
    const id = text(row?.id);
    if (!id) return false;
    if (primaryId && id === primaryId) return true;
    if (shared.size === 0) return false;
    return beautyCancelSharedKeys(row).some((key) => shared.has(key));
  });
  if (matched.length === 0) return primary ? [primary] : [];
  return matched;
}

function linkedAppointmentId(row: BeautyCancelSubject): string {
  const direct = text(row.linked_appointment_id ?? row.linkedAppointmentId);
  if (direct) return direct;
  const match = text(row.notes).match(/rex_appt:([0-9a-f-]{8,})/i);
  return match?.[1] ? text(match[1]) : '';
}

/** Satır, iptal kimliğine bağlı mı? Cari alanları eşleşme sayılmaz. */
export function beautyCancelRowSelected(
  row: BeautyCancelSubject,
  targets: readonly BeautyCancelSubject[],
): boolean {
  const targetIds = new Set(targets.map((item) => norm(item.id)).filter(Boolean));
  const shared = new Set(targets.flatMap((item) => beautyCancelSharedKeys(item)));
  const id = norm(row.id);
  if (id && targetIds.has(id)) return true;
  const linked = norm(linkedAppointmentId(row));
  if (linked && targetIds.has(linked)) return true;
  if (shared.size === 0) return false;
  return beautyCancelSharedKeys(row).some((key) => shared.has(key));
}

function cancelledFlag(row: BeautyCancelSubject): boolean {
  const values = [row.status, row.payment_status, row.paymentStatus].map(norm);
  return values.some((value) => value === 'cancelled' || value === 'canceled' || value === 'iptal');
}

/**
 * Seçilen fişin satırlarını iptal eder.
 * Aynı carinin diğer fişi tamamlandı kalır.
 */
export function applyBeautyCancel<T extends BeautyCancelSubject>(
  rows: readonly T[],
  primary: BeautyCancelSubject,
  pool?: readonly BeautyCancelSubject[] | null,
): T[] {
  const targets = beautyCancelTargets(primary, pool && pool.length > 0 ? pool : rows);
  return rows.map((row) => {
    if (!beautyCancelRowSelected(row, targets)) return { ...row };
    const next: T = { ...row, status: 'cancelled' };
    if (row.payment_status != null || row.paymentStatus != null) {
      next.payment_status = 'cancelled';
      next.paymentStatus = 'cancelled';
    }
    return next;
  });
}

/** İptal edilen satırların peşinatı. Başka fiş eklenmez. Kapanmış satır sayılmaz. */
export function cancelledDepositAmount(rows: readonly BeautyCancelSubject[]): number {
  let sum = 0;
  for (const row of rows) {
    if (!cancelledFlag(row)) continue;
    const closed = norm(row.status) === 'completed' || norm(row.status) === 'closed';
    if (closed) continue;
    const amount = Math.abs(Number(row.deposit_amount ?? row.depositAmount ?? 0) || 0);
    sum += amount;
  }
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}

/**
 * Cari id ile yazılan UPDATE bütün satırları iptal eder.
 * Bu sorgu kullanılmaz. Test, kimlik sorgusunun onu yapmadığını gösterir.
 */
export function rowsTouchedByCustomerIdUpdate(
  rows: readonly BeautyCancelSubject[],
  customerId: string,
): string[] {
  const id = norm(customerId);
  if (!id) return [];
  return rows
    .filter((row) => {
      const cid = norm(row.customer_id ?? row.client_id ?? row.customerId);
      return cid === id;
    })
    .map((row) => text(row.id))
    .filter(Boolean);
}

/**
 * Randevu iptal UPDATE süzgeci.
 * $1 randevu id, $2 satış grubu, $3 satış / fatura id, $4 fiş no.
 * Cari id, cari kod ve müşteri adı yoktur.
 */
export const BEAUTY_CANCEL_APPOINTMENT_WHERE_SQL = `
id::text = ANY($1::text[])
OR (
  cardinality($2::text[]) > 0
  AND NULLIF(BTRIM(COALESCE(sale_group_id, '')), '') = ANY($2::text[])
)
OR (
  cardinality($3::text[]) > 0
  AND remainder_sale_id::text = ANY($3::text[])
)
OR (
  cardinality($4::text[]) > 0
  AND NULLIF(BTRIM(COALESCE(remainder_sale_fiche_no, '')), '') = ANY($4::text[])
)
`.replace(/\s+/g, ' ').trim();

/**
 * Satış ve avans iptal UPDATE süzgeci.
 * $1 bağlı randevu, $2 rex_appt notu, $3 satış grubu, $4 fiş no, $5 satış id.
 * Cari id ile bütün satırlar seçilmez.
 */
export const BEAUTY_CANCEL_SALES_WHERE_SQL = `
linked_appointment_id::text = ANY($1::text[])
OR id::text = ANY($5::text[])
OR (
  cardinality($2::text[]) > 0
  AND COALESCE(notes, '') LIKE ANY($2::text[])
)
OR (
  cardinality($3::text[]) > 0
  AND NULLIF(BTRIM(COALESCE(sale_group_id, '')), '') = ANY($3::text[])
)
OR (
  cardinality($4::text[]) > 0
  AND NULLIF(BTRIM(COALESCE(invoice_number, '')), '') = ANY($4::text[])
)
`.replace(/\s+/g, ' ').trim();

export function beautyCancelSqlUsesCustomer(sql: string): boolean {
  return /customer_id|client_id|customer_code|customer_name/i.test(sql);
}

/** Rapor etiketi. Müşteri adı eşleşmesi başka fişi iptal yazmaz. */
export function reportFicheShowsCancel(row: {
  status?: string | null;
  isForfeitedDeposit?: boolean | null;
  id?: string | null;
  receiptNumber?: string | null;
  saleGroupId?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  customerCode?: string | null;
}): boolean {
  if (row.isForfeitedDeposit === true) return true;
  const status = norm(row.status);
  return status === 'cancelled' || status === 'canceled' || status === 'iptal';
}

export function customerKeyIsCancelTarget(
  cancelKey: string,
  row: {
    customerName?: string | null;
    customerId?: string | null;
    customerCode?: string | null;
  },
): boolean {
  const key = norm(cancelKey);
  if (!key) return false;
  const blocked = [row.customerName, row.customerId, row.customerCode].map(norm).filter(Boolean);
  return blocked.includes(key);
}
