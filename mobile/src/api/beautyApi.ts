import { pgQuery } from './pgClient';
import {
  postgrestGet,
  postgrestPatch,
  postgrestPost,
} from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import {
  beautyAppointmentsTable,
  beautySaleItemsTable,
  beautySalesTable,
  beautyServicesTable,
  beautySpecialistsTable,
  customersTable,
  firmCurrency,
  firmNr,
  newUuid,
  periodNr,
  saleItemsTable,
  salesTable,
} from './erpTables';
import { recordKasaGirisForSale } from './cashApi';
import { useAuthStore } from '../store/authStore';

const BEAUTY_SCHEMA = { schema: 'beauty' as const };

function beautyBare(sqlName: string): string {
  return sqlName.replace(/^beauty\./, '');
}

function apptTablePath(): string {
  return `/${beautyBare(beautyAppointmentsTable())}`;
}

function beautyServicesPath(): string {
  return `/${beautyBare(beautyServicesTable())}`;
}

function beautySpecialistsPath(): string {
  return `/${beautyBare(beautySpecialistsTable())}`;
}

function beautySalesPath(): string {
  return `/${beautyBare(beautySalesTable())}`;
}

function beautySaleItemsPath(): string {
  return `/${beautyBare(beautySaleItemsTable())}`;
}

function pgUuidOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

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
       $14, 1, 'completed', $11, $12, $13
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
      firmCurrency(),
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
    } catch (e) {
      rethrowTransportInfra(e, 'beautyApi.tryQueries');
      /* next schema fallback */
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
  return runDataTransport({
    label: 'fetchBeautyAppointments',
    viaRest: () => fetchBeautyAppointmentsViaRest(limit),
    viaBridge: () => fetchBeautyAppointmentsViaBridge(limit),
  });
}

async function fetchBeautyAppointmentsViaRest(limit = 80): Promise<BeautyAppointment[]> {
  const rows = await postgrestGet<Record<string, unknown>[]>(
    apptTablePath(),
    {
      select:
        'id,service_id,specialist_id,appointment_date,appointment_time,status,total_price,notes',
      order: 'appointment_date.desc,appointment_time.desc',
      limit,
    },
    BEAUTY_SCHEMA,
  );
  const list = Array.isArray(rows) ? rows : [];
  const serviceIds = Array.from(new Set(list.map((r) => String(r.service_id || '')).filter(Boolean)));
  const specialistIds = Array.from(new Set(list.map((r) => String(r.specialist_id || '')).filter(Boolean)));

  const serviceMap = new Map<string, string>();
  if (serviceIds.length) {
    try {
      const svcs = await postgrestGet<Record<string, unknown>[]>(
        beautyServicesPath(),
        { id: `in.(${serviceIds.join(',')})`, select: 'id,name' },
        BEAUTY_SCHEMA,
      );
      for (const s of Array.isArray(svcs) ? svcs : []) {
        serviceMap.set(String(s.id), String(s.name ?? ''));
      }
    } catch (e) {
      rethrowTransportInfra(e, 'fetchBeautyAppointments.services');
    }
  }

  const specialistMap = new Map<string, string>();
  if (specialistIds.length) {
    try {
      const sps = await postgrestGet<Record<string, unknown>[]>(
        beautySpecialistsPath(),
        { id: `in.(${specialistIds.join(',')})`, select: 'id,name' },
        BEAUTY_SCHEMA,
      );
      for (const s of Array.isArray(sps) ? sps : []) {
        specialistMap.set(String(s.id), String(s.name ?? ''));
      }
    } catch (e) {
      rethrowTransportInfra(e, 'fetchBeautyAppointments.specialists');
    }
  }

  return list.map((a) => {
    const date = a.appointment_date != null ? String(a.appointment_date) : '';
    const timeRaw = a.appointment_time != null ? String(a.appointment_time) : '';
    const time = timeRaw.slice(0, 5);
    return {
      id: String(a.id ?? ''),
      customer_name: a.notes != null ? String(a.notes).split(' — ')[0] || 'Müşteri' : 'Müşteri',
      service_name: a.service_id ? serviceMap.get(String(a.service_id)) ?? null : null,
      specialist_name: a.specialist_id ? specialistMap.get(String(a.specialist_id)) ?? null : null,
      starts_at: `${date} ${timeRaw}`.trim() || null,
      status: a.status != null ? String(a.status) : null,
      total_price: Number(a.total_price) || 0,
      notes: a.notes != null ? String(a.notes) : null,
      service_id: a.service_id != null ? String(a.service_id) : null,
      specialist_id: a.specialist_id != null ? String(a.specialist_id) : null,
      appointment_date: date || null,
      appointment_time: time || null,
    };
  });
}

async function fetchBeautyAppointmentsViaBridge(limit = 80): Promise<BeautyAppointment[]> {
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
  return runDataTransport({
    label: 'fetchBeautyServices',
    viaRest: fetchBeautyServicesViaRest,
    viaBridge: fetchBeautyServicesViaBridge,
  });
}

async function fetchBeautyServicesViaRest(): Promise<BeautyService[]> {
  const rows = await postgrestGet<Record<string, unknown>[]>(
    beautyServicesPath(),
    {
      select: 'id,name,duration_min,price',
      is_active: 'eq.true',
      order: 'name.asc',
      limit: 100,
    },
    BEAUTY_SCHEMA,
  );
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    duration_min: r.duration_min == null ? null : Number(r.duration_min),
    price: Number(r.price) || 0,
  }));
}

async function fetchBeautyServicesViaBridge(): Promise<BeautyService[]> {
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
  return runDataTransport({
    label: 'fetchBeautySpecialists',
    viaRest: fetchBeautySpecialistsViaRest,
    viaBridge: fetchBeautySpecialistsViaBridge,
  });
}

async function fetchBeautySpecialistsViaRest(): Promise<BeautySpecialist[]> {
  try {
    const rows = await postgrestGet<Record<string, unknown>[]>(
      beautySpecialistsPath(),
      {
        select: 'id,name,specialty',
        is_active: 'eq.true',
        order: 'name.asc',
        limit: 100,
      },
      BEAUTY_SCHEMA,
    );
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? ''),
      title: r.specialty != null ? String(r.specialty) : null,
    }));
  } catch (e) {
    rethrowTransportInfra(e, 'fetchBeautySpecialists.specialty');
    const rows = await postgrestGet<Record<string, unknown>[]>(
      beautySpecialistsPath(),
      {
        select: 'id,name,title',
        is_active: 'eq.true',
        order: 'name.asc',
        limit: 100,
      },
      BEAUTY_SCHEMA,
    );
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? ''),
      title: r.title != null ? String(r.title) : null,
    }));
  }
}

async function fetchBeautySpecialistsViaBridge(): Promise<BeautySpecialist[]> {
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
  return runDataTransport({
    label: 'createBeautyAppointment',
    viaRest: () => createBeautyAppointmentViaRest(input),
    viaBridge: () => createBeautyAppointmentViaBridge(input),
  });
}

async function createBeautyAppointmentViaRest(input: CreateBeautyAppointmentInput): Promise<string> {
  const id = newUuid();
  const svcRows = await postgrestGet<Record<string, unknown>[]>(
    beautyServicesPath(),
    { id: `eq.${input.serviceId}`, select: 'price,duration_min', limit: 1 },
    BEAUTY_SCHEMA,
  );
  const svcRow = Array.isArray(svcRows) ? svcRows[0] : undefined;
  const price = Number(svcRow?.price) || 0;
  const duration = Math.max(1, Math.round(Number(svcRow?.duration_min) || 30));
  const timePg = normalizeTimeForPg(input.appointmentTime);
  const notes = [input.customerName.trim(), input.notes?.trim()].filter(Boolean).join(' — ');

  await postgrestPost(
    apptTablePath(),
    {
      id,
      service_id: input.serviceId,
      specialist_id: pgUuidOrNull(input.specialistId),
      appointment_date: input.appointmentDate,
      appointment_time: timePg,
      duration,
      status: 'scheduled',
      type: 'regular',
      notes: notes || null,
      total_price: price,
      booking_channel: 'mobile',
    },
    { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
  );
  return id;
}

async function createBeautyAppointmentViaBridge(input: CreateBeautyAppointmentInput): Promise<string> {
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
  await runDataTransport({
    label: 'updateBeautyAppointment',
    viaRest: () => updateBeautyAppointmentViaRest(id, input),
    viaBridge: () => updateBeautyAppointmentViaBridge(id, input),
  });
}

async function updateBeautyAppointmentViaRest(
  id: string,
  input: UpdateBeautyAppointmentInput,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.serviceId !== undefined && input.serviceId) {
    patch.service_id = input.serviceId;
    if (input.totalPrice === undefined) {
      try {
        const svcRows = await postgrestGet<Record<string, unknown>[]>(
          beautyServicesPath(),
          { id: `eq.${input.serviceId}`, select: 'price', limit: 1 },
          BEAUTY_SCHEMA,
        );
        const svc = Array.isArray(svcRows) ? svcRows[0] : undefined;
        if (svc) patch.total_price = Number(svc.price) || 0;
      } catch (e) {
        rethrowTransportInfra(e, 'updateBeautyAppointment.servicePrice');
      }
    }
  }
  if (input.clearSpecialist) {
    patch.specialist_id = null;
  } else if (input.specialistId !== undefined) {
    patch.specialist_id = input.specialistId ? input.specialistId : null;
  }
  if (input.appointmentDate !== undefined) patch.appointment_date = input.appointmentDate;
  if (input.appointmentTime !== undefined) {
    patch.appointment_time = normalizeTimeForPg(input.appointmentTime);
  }
  if (input.status !== undefined) patch.status = input.status;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.totalPrice !== undefined) patch.total_price = input.totalPrice;

  if (Object.keys(patch).length <= 1) return;

  await postgrestPatch(
    `${apptTablePath()}?id=eq.${encodeURIComponent(id)}`,
    patch,
    { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
  );
}

async function updateBeautyAppointmentViaBridge(
  id: string,
  input: UpdateBeautyAppointmentInput,
): Promise<void> {
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
    } catch (e) {
      rethrowTransportInfra(e, 'updateBeautyAppointmentViaBridge.servicePrice');
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
  return runDataTransport({
    label: 'fetchBeautySales',
    viaRest: () => fetchBeautySalesViaRest(limit),
    viaBridge: () => fetchBeautySalesViaBridge(limit),
  });
}

async function fetchBeautySalesViaRest(limit: number): Promise<BeautySale[]> {
  const salesRows = await postgrestGet<Record<string, unknown>[]>(
    beautySalesPath(),
    {
      select:
        'id,invoice_number,customer_id,subtotal,discount,tax,total,payment_method,payment_status,paid_amount,notes,created_at',
      order: 'created_at.desc',
      limit,
    },
    BEAUTY_SCHEMA,
  );
  const sales = Array.isArray(salesRows) ? salesRows : [];
  const customerIds = Array.from(
    new Set(sales.map((s) => String(s.customer_id ?? '')).filter(Boolean)),
  );
  const customerMap = new Map<string, string>();
  if (customerIds.length) {
    try {
      const custTable = customersTable();
      const crows = await postgrestGet<Record<string, unknown>[]>(
        `/${custTable}`,
        { id: `in.(${customerIds.join(',')})`, select: 'id,name', limit: 500 },
        { schema: 'public' },
      );
      for (const c of Array.isArray(crows) ? crows : []) {
        if (c.id) customerMap.set(String(c.id), String(c.name ?? ''));
      }
    } catch (e) {
      rethrowTransportInfra(e, 'fetchBeautySales.customers');
    }
  }

  const itemCounts = new Map<string, number>();
  if (sales.length) {
    try {
      const saleIds = sales.map((s) => String(s.id)).filter(Boolean);
      const irows = await postgrestGet<Array<{ sale_id?: string }>>(
        beautySaleItemsPath(),
        { sale_id: `in.(${saleIds.join(',')})`, select: 'sale_id', limit: 5000 },
        BEAUTY_SCHEMA,
      );
      for (const i of Array.isArray(irows) ? irows : []) {
        const sid = String(i.sale_id ?? '');
        if (sid) itemCounts.set(sid, (itemCounts.get(sid) || 0) + 1);
      }
    } catch (e) {
      rethrowTransportInfra(e, 'fetchBeautySales.items');
    }
  }

  return sales.map((s) => {
    const cid = s.customer_id != null ? String(s.customer_id) : null;
    return {
      id: String(s.id ?? ''),
      invoice_number: s.invoice_number != null ? String(s.invoice_number) : null,
      customer_id: cid,
      customer_name: cid ? customerMap.get(cid) ?? null : null,
      subtotal: Number(s.subtotal ?? 0) || 0,
      discount: Number(s.discount ?? 0) || 0,
      tax: Number(s.tax ?? 0) || 0,
      total: Number(s.total ?? 0) || 0,
      payment_method: s.payment_method != null ? String(s.payment_method) : null,
      payment_status: s.payment_status != null ? String(s.payment_status) : null,
      paid_amount: Number(s.paid_amount ?? 0) || 0,
      notes: s.notes != null ? String(s.notes) : null,
      created_at: s.created_at != null ? String(s.created_at) : null,
      item_count: itemCounts.get(String(s.id ?? '')) || 0,
    };
  });
}

async function fetchBeautySalesViaBridge(limit: number): Promise<BeautySale[]> {
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
  return runDataTransport({
    label: 'fetchBeautySaleItems',
    viaRest: () => fetchBeautySaleItemsViaRest(saleId),
    viaBridge: () => fetchBeautySaleItemsViaBridge(saleId),
  });
}

async function fetchBeautySaleItemsViaRest(saleId: string): Promise<BeautySaleItemRow[]> {
  const rows = await postgrestGet<Record<string, unknown>[]>(
    beautySaleItemsPath(),
    {
      sale_id: `eq.${saleId}`,
      select:
        'id,sale_id,item_type,item_id,name,quantity,unit_price,discount,total,staff_id,created_at',
      order: 'created_at.asc',
      limit: 500,
    },
    BEAUTY_SCHEMA,
  );
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: String(r.id ?? ''),
    sale_id: String(r.sale_id ?? ''),
    item_type: r.item_type != null ? String(r.item_type) : null,
    item_id: r.item_id != null ? String(r.item_id) : null,
    name: r.name != null ? String(r.name) : null,
    quantity: Number(r.quantity ?? 1) || 1,
    unit_price: Number(r.unit_price ?? 0) || 0,
    discount: Number(r.discount ?? 0) || 0,
    total: Number(r.total ?? 0) || 0,
    staff_id: r.staff_id != null ? String(r.staff_id) : null,
  }));
}

async function fetchBeautySaleItemsViaBridge(saleId: string): Promise<BeautySaleItemRow[]> {
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

  const id = newUuid();
  const invoiceNumber = nextBeautyInvoiceNumber();
  const tax = input.tax ?? 0;
  const paidAmount = input.paidAmount ?? input.total;
  const notes = [input.customerName?.trim(), input.notes?.trim()].filter(Boolean).join(' — ') || null;

  await runDataTransport({
    label: 'createBeautySale',
    viaRest: async () => {
      await postgrestPost(
        beautySalesPath(),
        {
          id,
          invoice_number: invoiceNumber,
          customer_id: pgUuidOrNull(input.customerId),
          subtotal: input.subtotal,
          discount: input.discount,
          tax,
          total: input.total,
          payment_method: input.paymentMethod,
          payment_status: input.paymentStatus ?? 'paid',
          paid_amount: paidAmount,
          remaining_amount: Math.max(0, input.total - paidAmount),
          notes,
        },
        { ...BEAUTY_SCHEMA, prefer: 'return=minimal' },
      );

      const lineGrosses = input.items.map((i) => i.unit_price * i.quantity);
      const lineSplits = splitProportionalLineDiscount(lineGrosses, input.discount);

      if (input.items.length > 0) {
        const payload = input.items.map((item, idx) => {
          const split = lineSplits[idx] ?? { discount: 0, total: item.unit_price * item.quantity };
          return {
            id: newUuid(),
            sale_id: id,
            item_type: item.item_type,
            item_id: pgUuidOrNull(item.item_id),
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: item.discount ?? split.discount,
            total: item.total ?? split.total,
            staff_id: pgUuidOrNull(item.staff_id),
            commission_amount: 0,
          };
        });
        await postgrestPost(beautySaleItemsPath(), payload, {
          ...BEAUTY_SCHEMA,
          prefer: 'return=minimal',
        });
      }
    },
    viaBridge: async () => {
      const fn = firmNr();
      const pn = periodNr();
      const sales = beautySalesTable(fn, pn);
      const itemsTbl = beautySaleItemsTable(fn, pn);

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
    },
  });

  let erpSynced = false;
  try {
    await syncBeautySaleToErp(input, { beautySaleId: id, invoiceNumber });
    erpSynced = true;
  } catch (erpErr) {
    console.warn('[createBeautySale] ERP senkronu başarısız — beauty fişi kayıtlı:', erpErr);
  }

  return { id, invoiceNumber, total: input.total, erpSynced };
}
