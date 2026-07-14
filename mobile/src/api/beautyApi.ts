import { pgQuery } from './pgClient';
import {
  beautyAppointmentsTable,
  beautySaleItemsTable,
  beautySalesTable,
  beautyServicesTable,
  beautySpecialistsTable,
  customersTable,
  firmNr,
  newUuid,
  periodNr,
  saleItemsTable,
  salesTable,
} from './erpTables';
import { recordKasaGirisForSale } from './cashApi';
import { useAuthStore } from '../store/authStore';

export type BeautyAppointment = {
  id: string;
  customer_name: string | null;
  service_name: string | null;
  specialist_name: string | null;
  starts_at: string | null;
  status: string | null;
  total_price: number;
  notes: string | null;
  service_id?: string | null;
  specialist_id?: string | null;
  appointment_date?: string | null;
  appointment_time?: string | null;
};

export type BeautyService = {
  id: string;
  name: string;
  duration_min: number | null;
  price: number;
};

export type BeautySpecialist = {
  id: string;
  name: string;
  title: string | null;
};

export type CreateBeautyAppointmentInput = {
  customerName: string;
  serviceId: string;
  specialistId?: string | null;
  appointmentDate: string;
  appointmentTime: string;
  notes?: string;
};

export type UpdateBeautyAppointmentInput = {
  serviceId?: string | null;
  specialistId?: string | null;
  appointmentDate?: string;
  appointmentTime?: string;
  status?: string;
  notes?: string | null;
  totalPrice?: number;
  clearSpecialist?: boolean;
};

export type BeautyPaymentMethod = 'cash' | 'card' | 'transfer';

export type BeautySale = {
  id: string;
  invoice_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: string | null;
  payment_status: string | null;
  paid_amount: number;
  notes: string | null;
  created_at: string | null;
  item_count: number;
};

export type BeautySaleItemRow = {
  id: string;
  sale_id: string;
  item_type: string | null;
  item_id: string | null;
  name: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  staff_id: string | null;
};

export type CreateBeautySaleItemInput = {
  item_type: 'service' | 'product' | 'package';
  item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  total?: number;
  staff_id?: string | null;
};

export type CreateBeautySaleInput = {
  customerId?: string | null;
  customerName?: string;
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  paymentMethod: BeautyPaymentMethod | string;
  paymentStatus?: string;
  paidAmount?: number;
  notes?: string;
  items: CreateBeautySaleItemInput[];
};

export type CreateBeautySaleResult = {
  id: string;
  invoiceNumber: string;
  total: number;
  /** ERP satış + (nakit) kasa yazıldı mı — web runBeautySaleErpAndLoyalty */
  erpSynced?: boolean;
};

/** Web beautyService: BEA-{year}-{base36} */
function nextBeautyInvoiceNumber(): string {
  return `BEA-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
}

function isUuid(raw: string | null | undefined): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(raw || '').trim(),
  );
}

/** Web mapBeautyPaymentToErpMethod */
function mapBeautyPaymentToErp(raw: string | undefined): string {
  const s = String(raw ?? '').trim();
  const m = s.toLowerCase();
  if (m === 'cash' || /^nak[ıi]t$/i.test(s) || m === 'nakit') return 'cash';
  if (m === 'transfer' || m === 'havale' || /havale|eft|transfer/i.test(s)) return 'transfer';
  if (m === 'card' || m === 'kart' || /kredi|kart/i.test(s)) return 'card';
  if (m === 'veresiye') return 'veresiye';
  return 'cash';
}

/**
 * Web runBeautySaleErpAndLoyalty — perakende satış + kasa (yalnızca nakit) + müşteri puanı.
 * Stok düşmez (hizmet kalemleri). Hata beauty fişini geri almaz.
 */
async function syncBeautySaleToErp(
  input: CreateBeautySaleInput,
  ctx: { beautySaleId: string; invoiceNumber: string },
): Promise<void> {
  const fn = firmNr();
  const pn = periodNr();
  const erpSales = salesTable(fn, pn);
  const erpItems = saleItemsTable(fn, pn);
  const erpId = newUuid();
  const pm = mapBeautyPaymentToErp(String(input.paymentMethod));
  const customerName =
    (input.customerName || '').trim() || (input.customerId ? 'Cari' : 'Peşin Müşteri');
  const noteTail = (input.notes || '').trim() || 'Güzellik satışı';
  const erpNotes = `GüzellikPOS|beauty_sale_id:${ctx.beautySaleId}|${noteTail}`;
  const user = useAuthStore.getState().user;
  const cashier = user?.fullName || user?.username || 'Güzellik';
  const tax = input.tax ?? 0;
  const net = Math.max(0, Number(input.total) || 0);

  await pgQuery(
    `INSERT INTO ${erpSales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $4, NOW(),
       'sales_invoice', 7, $5::uuid, $6,
       $7, $8, $9, $10, $7,
       'TRY', 1, 'completed', $11, $12, $13
     )`,
    [
      erpId,
      fn,
      pn,
      ctx.invoiceNumber,
      input.customerId || null,
      customerName,
      net,
      tax,
      Math.max(0, Number(input.subtotal) || 0),
      Math.max(0, Number(input.discount) || 0),
      pm,
      cashier,
      erpNotes,
    ],
  );

  const lineGrosses = input.items.map((i) => i.unit_price * i.quantity);
  const lineSplits = splitProportionalLineDiscount(lineGrosses, input.discount);

  for (let idx = 0; idx < input.items.length; idx++) {
    const item = input.items[idx]!;
    const split = lineSplits[idx] ?? { discount: 0, total: item.unit_price * item.quantity };
    const lineNet = item.total ?? split.total;
    const productId = isUuid(item.item_id) ? item.item_id : null;
    const itemCode =
      productId ||
      `beauty-${String(item.item_type || 'line')}-${String(item.name || 'x').slice(0, 24)}`;
    await pgQuery(
      `INSERT INTO ${erpItems} (
         id, invoice_id, firm_nr, period_nr,
         product_id, item_code, item_name,
         quantity, unit_price, net_amount, total_amount, unit
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5::uuid, $6, $7,
         $8, $9, $10, $10, 'Adet'
       )`,
      [
        newUuid(),
        erpId,
        fn,
        pn,
        productId,
        itemCode,
        item.name || 'Kalem',
        item.quantity,
        item.unit_price,
        lineNet,
      ],
    );
  }

  // Web salesAPI: güzellikte yalnızca nakit → KASA_GIRIS
  if (pm === 'cash' && net > 0) {
    try {
      await recordKasaGirisForSale({
        amount: net,
        ficheNo: ctx.invoiceNumber,
        description: `Güzellik Satışı - ${ctx.invoiceNumber}`,
        customerId: input.customerId || null,
      });
    } catch {
      /* kasa yoksa sessiz */
    }
  }

  const cid = input.customerId && isUuid(input.customerId) ? input.customerId : null;
  if (cid && net > 0) {
    const pts = Math.floor(net / 100);
    try {
      await pgQuery(
        `UPDATE ${customersTable(fn)}
         SET total_spent = COALESCE(total_spent, 0) + $1::numeric,
             points = COALESCE(points, 0) + $2::int,
             updated_at = NOW()
         WHERE id = $3::uuid`,
        [net, pts, cid],
      );
    } catch {
      /* kolon / şema farkı */
    }
  }
}

/** Web `beautySaleLineDiscount` — genel indirimi satırlara oransal böl */
function splitProportionalLineDiscount(
  lineGrosses: number[],
  headerDiscount: number,
): { discount: number; total: number }[] {
  const n = lineGrosses.length;
  const subtotal = lineGrosses.reduce((a, b) => a + b, 0);
  if (n === 0 || subtotal <= 0 || headerDiscount <= 0) {
    return lineGrosses.map((g) => ({ discount: 0, total: g }));
  }
  let allocated = 0;
  return lineGrosses.map((lineGross, idx) => {
    let lineDisc: number;
    if (idx === n - 1) {
      lineDisc = Math.max(0, headerDiscount - allocated);
    } else {
      lineDisc = Math.round(((headerDiscount * lineGross) / subtotal) * 100) / 100;
      allocated += lineDisc;
    }
    return {
      discount: lineDisc,
      total: Math.max(0, lineGross - lineDisc),
    };
  });
}

export const BEAUTY_STATUSES = [
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
] as const;

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

function normalizeTimeForPg(t: string): string {
  const s = t.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '10:00:00';
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

export async function fetchBeautyAppointments(limit = 80): Promise<BeautyAppointment[]> {
  const fn = firmNr();
  const pn = periodNr();
  const appt = beautyAppointmentsTable(fn, pn);
  const svc = beautyServicesTable(fn);
  const sp = beautySpecialistsTable(fn);
  const cust = customersTable(fn);

  return tryQueries<BeautyAppointment>([
    {
      sql: `SELECT a.id,
              COALESCE(c.name, NULLIF(TRIM(a.notes), ''), 'Müşteri') AS customer_name,
              s.name AS service_name,
              sp.name AS specialist_name,
              (a.appointment_date::text || ' ' || COALESCE(a.appointment_time::text, '')) AS starts_at,
              a.status,
              COALESCE(a.total_price, 0)::float8 AS total_price,
              a.notes,
              a.service_id::text AS service_id,
              a.specialist_id::text AS specialist_id,
              a.appointment_date::text AS appointment_date,
              COALESCE(to_char(a.appointment_time, 'HH24:MI'), '') AS appointment_time
       FROM ${appt} a
       LEFT JOIN ${cust} c ON c.id = a.client_id
       LEFT JOIN ${svc} s ON s.id = a.service_id
       LEFT JOIN ${sp} sp ON sp.id = a.specialist_id
       ORDER BY a.appointment_date DESC, a.appointment_time DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchBeautyServices(): Promise<BeautyService[]> {
  const svc = beautyServicesTable();
  return tryQueries<BeautyService>([
    {
      sql: `SELECT id, name,
              duration_min,
              COALESCE(price, 0)::float8 AS price
       FROM ${svc}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
  ]);
}

export async function fetchBeautySpecialists(): Promise<BeautySpecialist[]> {
  const sp = beautySpecialistsTable();
  return tryQueries<BeautySpecialist>([
    {
      sql: `SELECT id, name, specialty AS title
       FROM ${sp}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
    {
      sql: `SELECT id, name, title
       FROM ${sp}
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC
       LIMIT 100`,
    },
    {
      sql: `SELECT id, name, NULL::text AS title
       FROM ${sp}
       ORDER BY name ASC
       LIMIT 100`,
    },
  ]);
}

export async function createBeautyAppointment(
  input: CreateBeautyAppointmentInput,
): Promise<string> {
  const fn = firmNr();
  const pn = periodNr();
  const appt = beautyAppointmentsTable(fn, pn);
  const svc = beautyServicesTable(fn);
  const id = newUuid();

  const svcRes = await pgQuery<{ price: number; duration_min: number | null }>(
    `SELECT COALESCE(price, 0)::float8 AS price, duration_min FROM ${svc} WHERE id = $1::uuid LIMIT 1`,
    [input.serviceId],
  );
  const svcRow = svcRes.rows[0];
  const price = Number(svcRow?.price) || 0;
  const duration = Math.max(1, Math.round(Number(svcRow?.duration_min) || 30));
  const timePg = normalizeTimeForPg(input.appointmentTime);
  const notes = [input.customerName.trim(), input.notes?.trim()].filter(Boolean).join(' — ');

  await pgQuery(
    `INSERT INTO ${appt} (
       id, service_id, specialist_id,
       appointment_date, appointment_time, duration,
       status, type, notes, total_price, booking_channel
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       $4::date, $5::time, $6,
       'scheduled', 'regular', $7, $8, 'mobile'
     )`,
    [
      id,
      input.serviceId,
      input.specialistId || null,
      input.appointmentDate,
      timePg,
      duration,
      notes || null,
      price,
    ],
  );

  return id;
}

/** Web beautyService.updateAppointment — kısmi güncelleme */
export async function updateBeautyAppointment(
  id: string,
  input: UpdateBeautyAppointmentInput,
): Promise<void> {
  if (!id) throw new Error('Randevu id gerekli');
  const appt = beautyAppointmentsTable();
  const sets: string[] = ['updated_at = NOW()'];
  const vals: unknown[] = [];
  let i = 1;

  if (input.serviceId !== undefined && input.serviceId) {
    sets.push(`service_id = $${i++}::uuid`);
    vals.push(input.serviceId);
    try {
      const svc = beautyServicesTable();
      const svcRes = await pgQuery<{ price: number }>(
        `SELECT COALESCE(price, 0)::float8 AS price FROM ${svc} WHERE id = $1::uuid LIMIT 1`,
        [input.serviceId],
      );
      if (input.totalPrice === undefined && svcRes.rows[0]) {
        sets.push(`total_price = $${i++}`);
        vals.push(Number(svcRes.rows[0].price) || 0);
      }
    } catch {
      /* fiyat güncellenemese devam */
    }
  }
  if (input.clearSpecialist) {
    sets.push('specialist_id = NULL');
  } else if (input.specialistId !== undefined) {
    if (input.specialistId) {
      sets.push(`specialist_id = $${i++}::uuid`);
      vals.push(input.specialistId);
    } else {
      sets.push('specialist_id = NULL');
    }
  }
  if (input.appointmentDate !== undefined) {
    sets.push(`appointment_date = $${i++}::date`);
    vals.push(input.appointmentDate);
  }
  if (input.appointmentTime !== undefined) {
    sets.push(`appointment_time = $${i++}::time`);
    vals.push(normalizeTimeForPg(input.appointmentTime));
  }
  if (input.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(input.status);
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${i++}`);
    vals.push(input.notes?.trim() || null);
  }
  if (input.totalPrice !== undefined) {
    sets.push(`total_price = $${i++}`);
    vals.push(input.totalPrice);
  }

  if (sets.length <= 1) return;
  vals.push(id);
  await pgQuery(`UPDATE ${appt} SET ${sets.join(', ')} WHERE id = $${i}::uuid`, vals);
}

export async function updateBeautyAppointmentStatus(id: string, status: string): Promise<void> {
  await updateBeautyAppointment(id, { status });
}

/** Web beautyService.getSales — son güzellik POS fişleri */
export async function fetchBeautySales(limit = 80): Promise<BeautySale[]> {
  const fn = firmNr();
  const pn = periodNr();
  const sales = beautySalesTable(fn, pn);
  const cust = customersTable(fn);
  const items = beautySaleItemsTable(fn, pn);

  return tryQueries<BeautySale>([
    {
      sql: `SELECT s.id,
              s.invoice_number,
              s.customer_id::text AS customer_id,
              c.name AS customer_name,
              COALESCE(s.subtotal, 0)::float8 AS subtotal,
              COALESCE(s.discount, 0)::float8 AS discount,
              COALESCE(s.tax, 0)::float8 AS tax,
              COALESCE(s.total, 0)::float8 AS total,
              s.payment_method,
              s.payment_status,
              COALESCE(s.paid_amount, 0)::float8 AS paid_amount,
              s.notes,
              s.created_at::text AS created_at,
              COALESCE((SELECT COUNT(*)::int FROM ${items} i WHERE i.sale_id = s.id), 0) AS item_count
       FROM ${sales} s
       LEFT JOIN ${cust} c ON c.id = s.customer_id
       ORDER BY s.created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT s.id,
              s.invoice_number,
              NULL::text AS customer_id,
              NULL::text AS customer_name,
              COALESCE(s.subtotal, 0)::float8 AS subtotal,
              COALESCE(s.discount, 0)::float8 AS discount,
              COALESCE(s.tax, 0)::float8 AS tax,
              COALESCE(s.total, 0)::float8 AS total,
              s.payment_method,
              s.payment_status,
              COALESCE(s.paid_amount, 0)::float8 AS paid_amount,
              s.notes,
              s.created_at::text AS created_at,
              0 AS item_count
       FROM ${sales} s
       ORDER BY s.created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchBeautySaleItems(saleId: string): Promise<BeautySaleItemRow[]> {
  if (!saleId) return [];
  const items = beautySaleItemsTable();
  return tryQueries<BeautySaleItemRow>([
    {
      sql: `SELECT id, sale_id::text AS sale_id, item_type, item_id::text AS item_id,
              name, COALESCE(quantity, 1)::int AS quantity,
              COALESCE(unit_price, 0)::float8 AS unit_price,
              COALESCE(discount, 0)::float8 AS discount,
              COALESCE(total, 0)::float8 AS total,
              staff_id::text AS staff_id
       FROM ${items}
       WHERE sale_id = $1::uuid
       ORDER BY created_at ASC NULLS LAST`,
      params: [saleId],
    },
  ]);
}

/**
 * Web beautyService.createSale — beauty_sales + kalemler, sonra ERP (sales/sale_items + nakit kasa).
 */
export async function createBeautySale(input: CreateBeautySaleInput): Promise<CreateBeautySaleResult> {
  if (!input.items.length) throw new Error('Sepet boş');

  const fn = firmNr();
  const pn = periodNr();
  const sales = beautySalesTable(fn, pn);
  const itemsTbl = beautySaleItemsTable(fn, pn);
  const id = newUuid();
  const invoiceNumber = nextBeautyInvoiceNumber();
  const tax = input.tax ?? 0;
  const paidAmount = input.paidAmount ?? input.total;
  const notes = [input.customerName?.trim(), input.notes?.trim()].filter(Boolean).join(' — ') || null;

  await pgQuery(
    `INSERT INTO ${sales} (
       id, invoice_number, customer_id, subtotal, discount, tax, total,
       payment_method, payment_status, paid_amount, remaining_amount, notes
     ) VALUES (
       $1::uuid, $2, $3::uuid, $4, $5, $6, $7,
       $8, $9, $10, $11, $12
     )`,
    [
      id,
      invoiceNumber,
      input.customerId || null,
      input.subtotal,
      input.discount,
      tax,
      input.total,
      input.paymentMethod,
      input.paymentStatus ?? 'paid',
      paidAmount,
      Math.max(0, input.total - paidAmount),
      notes,
    ],
  );

  const lineGrosses = input.items.map((i) => i.unit_price * i.quantity);
  const lineSplits = splitProportionalLineDiscount(lineGrosses, input.discount);

  for (let idx = 0; idx < input.items.length; idx++) {
    const item = input.items[idx]!;
    const split = lineSplits[idx] ?? { discount: 0, total: item.unit_price * item.quantity };
    const itemId = newUuid();
    const itemUuid = isUuid(item.item_id) ? item.item_id : null;
    await pgQuery(
      `INSERT INTO ${itemsTbl} (
         id, sale_id, item_type, item_id, name, quantity, unit_price,
         discount, total, staff_id, commission_amount
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7,
         $8, $9, $10::uuid, 0
       )`,
      [
        itemId,
        id,
        item.item_type,
        itemUuid,
        item.name,
        item.quantity,
        item.unit_price,
        item.discount ?? split.discount,
        item.total ?? split.total,
        item.staff_id && isUuid(item.staff_id) ? item.staff_id : null,
      ],
    );
  }

  let erpSynced = false;
  try {
    await syncBeautySaleToErp(input, { beautySaleId: id, invoiceNumber });
    erpSynced = true;
  } catch (erpErr) {
    console.warn('[createBeautySale] ERP senkronu başarısız — beauty fişi kayıtlı:', erpErr);
  }

  return { id, invoiceNumber, total: input.total, erpSynced };
}
