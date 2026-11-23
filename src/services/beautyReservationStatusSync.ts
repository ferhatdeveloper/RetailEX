import { shouldUseTenantPostgrestApi } from '../config/postgrest.config';
import { ERP_SETTINGS, postgres } from './postgres';
import {
  GREEN_RESERVATION_STATUS,
  linkedReservationIdsForGreenStatus,
  serviceSaleFullyPaysVisit,
  type ReservationGreenRow,
  type ServiceSalePaymentRow,
} from '../utils/beautyReservationGreenStatus';

const OPEN_STATUS_SQL = `('scheduled','confirmed','pre_paid','in_progress','pending')`;

function firmNr(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

function periodNr(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

function asText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function rowFromDb(row: Record<string, unknown>): ReservationGreenRow {
  return {
    id: asText(row.id),
    status: asText(row.status),
    saleGroupId: asText(row.sale_group_id),
    customerId: asText(row.customer_id),
    appointmentDate: asText(row.appointment_date),
    appointmentTime: asText(row.appointment_time),
    serviceId: asText(row.service_id),
    depositAmount: Number(row.deposit_amount) || 0,
    totalPrice: row.total_price == null || row.total_price === '' ? undefined : Number(row.total_price),
  };
}

function saleFromDb(row: Record<string, unknown>): ServiceSalePaymentRow {
  return {
    isDeposit: row.is_deposit === true,
    paidAmount: Number(row.paid_amount) || 0,
    total: Number(row.total) || 0,
    remainingAmount: row.remaining_amount == null ? null : Number(row.remaining_amount) || 0,
    paymentStatus: asText(row.payment_status),
    notes: asText(row.notes),
  };
}

async function applyGreenStatusPostgres(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const table = postgres.getMovementTableName('beauty_appointments', 'beauty');
  const { rows } = await postgres.query(
    `UPDATE ${table}
        SET status = $2, updated_at = NOW()
      WHERE id = ANY($1::uuid[])
        AND lower(trim(coalesce(status::text, ''))) IN ${OPEN_STATUS_SQL}
      RETURNING id::text AS id`,
    [ids, GREEN_RESERVATION_STATUS],
  );
  return (Array.isArray(rows) ? rows : []).map((row: { id?: string }) => asText(row.id)).filter(Boolean);
}

async function loadPostgresContext(anchorId: string): Promise<{
  anchor: ReservationGreenRow;
  reservations: ReservationGreenRow[];
  sales: ServiceSalePaymentRow[];
  paidServiceIds: string[];
} | null> {
  const aptTable = postgres.getMovementTableName('beauty_appointments', 'beauty');
  const salesTable = postgres.getMovementTableName('beauty_sales', 'beauty');
  const itemsTable = postgres.getMovementTableName('beauty_sale_items', 'beauty');
  const { rows: anchorRows } = await postgres.query(
    `SELECT id::text AS id,
            status,
            client_id::text AS customer_id,
            appointment_date::text AS appointment_date,
            appointment_time::text AS appointment_time,
            service_id::text AS service_id,
            coalesce(sale_group_id, '') AS sale_group_id,
            coalesce(deposit_amount, 0) AS deposit_amount,
            total_price
       FROM ${aptTable}
      WHERE id = $1::uuid`,
    [anchorId],
  );
  const anchorRaw = (Array.isArray(anchorRows) ? anchorRows : [])[0] as Record<string, unknown> | undefined;
  if (!anchorRaw) return null;
  const anchor = rowFromDb(anchorRaw);
  const group = asText(anchor.saleGroupId);
  const { rows: saleRows } = await postgres.query(
    `SELECT coalesce(s.is_deposit, false) AS is_deposit,
            coalesce(s.paid_amount, 0) AS paid_amount,
            coalesce(s.total, 0) AS total,
            coalesce(s.remaining_amount, 0) AS remaining_amount,
            coalesce(s.payment_status, '') AS payment_status,
            coalesce(s.notes, '') AS notes,
            s.id::text AS id
       FROM ${salesTable} s
      WHERE s.linked_appointment_id = $1::uuid
         OR coalesce(s.notes, '') ILIKE '%rex_appt:' || $1::text || '%'
         OR (
           $2 <> ''
           AND EXISTS (
             SELECT 1
               FROM ${aptTable} member
              WHERE member.sale_group_id = $2
                AND (
                  s.linked_appointment_id = member.id
                  OR coalesce(s.notes, '') ILIKE '%rex_appt:' || member.id::text || '%'
                )
           )
         )`,
    [anchorId, group],
  );
  const sales = (Array.isArray(saleRows) ? saleRows : []) as Array<Record<string, unknown>>;
  const fullSales = sales.filter((row) => serviceSaleFullyPaysVisit(saleFromDb(row)));
  const saleIds = fullSales.map((row) => asText(row.id)).filter(Boolean);
  let paidServiceIds: string[] = [];
  if (saleIds.length > 0) {
    const { rows: itemRows } = await postgres.query(
      `SELECT DISTINCT item_id::text AS item_id
         FROM ${itemsTable}
        WHERE sale_id = ANY($1::uuid[])
          AND item_id IS NOT NULL`,
      [saleIds],
    );
    paidServiceIds = (Array.isArray(itemRows) ? itemRows : [])
      .map((row: { item_id?: string }) => asText(row.item_id))
      .filter(Boolean);
  }
  const params: unknown[] = [anchorId];
  let where = `id = $1::uuid`;
  if (group) {
    params.push(group);
    where += ` OR sale_group_id = $${params.length}`;
  }
  const customerId = asText(anchor.customerId);
  const serviceId = asText(anchor.serviceId);
  const appointmentDate = asText(anchor.appointmentDate).slice(0, 10);
  const appointmentTime = asText(anchor.appointmentTime);
  if (customerId && serviceId && appointmentDate && appointmentTime) {
    params.push(customerId, appointmentDate, appointmentTime, serviceId);
    const base = params.length;
    where += ` OR (
      client_id = $${base - 3}::uuid
      AND appointment_date = $${base - 2}::date
      AND appointment_time = $${base - 1}::time
      AND service_id = $${base}::uuid
    )`;
  }
  if (customerId && appointmentDate && paidServiceIds.length > 0) {
    params.push(customerId, appointmentDate, paidServiceIds);
    const base = params.length;
    where += ` OR (
      client_id = $${base - 2}::uuid
      AND appointment_date = $${base - 1}::date
      AND service_id = ANY($${base}::uuid[])
    )`;
  }
  const { rows: reservationRows } = await postgres.query(
    `SELECT id::text AS id,
            status,
            client_id::text AS customer_id,
            appointment_date::text AS appointment_date,
            appointment_time::text AS appointment_time,
            service_id::text AS service_id,
            coalesce(sale_group_id, '') AS sale_group_id,
            coalesce(deposit_amount, 0) AS deposit_amount,
            total_price
       FROM ${aptTable}
      WHERE ${where}`,
    params,
  );
  return {
    anchor,
    reservations: (Array.isArray(reservationRows) ? reservationRows : []).map((row) => rowFromDb(row as Record<string, unknown>)),
    sales: fullSales.map((row) => saleFromDb(row)),
    paidServiceIds,
  };
}

async function loadPostgrestContext(anchorId: string): Promise<{
  anchor: ReservationGreenRow;
  reservations: ReservationGreenRow[];
  sales: ServiceSalePaymentRow[];
  paidServiceIds: string[];
} | null> {
  const { postgrest } = await import('./api/postgrestClient');
  const fn = firmNr();
  const pn = periodNr();
  const aptPath = `/rex_${fn}_${pn}_beauty_appointments`;
  const salesPath = `/rex_${fn}_${pn}_beauty_sales`;
  const itemsPath = `/rex_${fn}_${pn}_beauty_sale_items`;
  const schema = { schema: 'beauty' as const };
  const anchors = await postgrest.get<Array<Record<string, unknown>>>(aptPath, {
    select: 'id,status,client_id,appointment_date,appointment_time,service_id,sale_group_id,deposit_amount,total_price',
    id: `eq.${anchorId}`,
    limit: 1,
  }, schema);
  const anchorRaw = (Array.isArray(anchors) ? anchors : [])[0];
  if (!anchorRaw) return null;
  const anchor = rowFromDb({
    ...anchorRaw,
    customer_id: anchorRaw.client_id,
  });
  const group = asText(anchor.saleGroupId);
  let memberIds = [anchorId];
  if (group) {
    const members = await postgrest.get<Array<Record<string, unknown>>>(aptPath, {
      select: 'id',
      sale_group_id: `eq.${group}`,
      limit: 50,
    }, schema);
    const ids = (Array.isArray(members) ? members : []).map((row) => asText(row.id)).filter(Boolean);
    if (ids.length > 0) memberIds = ids;
  }
  const saleOr = memberIds
    .flatMap((id) => [`linked_appointment_id.eq.${id}`, `notes.ilike.*rex_appt:${id}*`])
    .join(',');
  const sales = await postgrest.get<Array<Record<string, unknown>>>(salesPath, {
    select: 'id,is_deposit,paid_amount,total,remaining_amount,payment_status,notes,linked_appointment_id',
    or: `(${saleOr})`,
    limit: 200,
  }, schema);
  const fullSales = (Array.isArray(sales) ? sales : []).filter((row) => serviceSaleFullyPaysVisit(saleFromDb(row)));
  const saleIds = fullSales.map((row) => asText(row.id)).filter(Boolean);
  let paidServiceIds: string[] = [];
  if (saleIds.length > 0) {
    const items = await postgrest.get<Array<Record<string, unknown>>>(itemsPath, {
      select: 'item_id,sale_id',
      sale_id: `in.(${saleIds.join(',')})`,
      limit: 500,
    }, schema);
    paidServiceIds = [...new Set((Array.isArray(items) ? items : []).map((row) => asText(row.item_id)).filter(Boolean))];
  }
  const filters = [`id.eq.${anchorId}`];
  if (group) filters.push(`sale_group_id.eq.${group}`);
  const customerId = asText(anchor.customerId);
  const serviceId = asText(anchor.serviceId);
  const appointmentDate = asText(anchor.appointmentDate).slice(0, 10);
  const appointmentTime = asText(anchor.appointmentTime).slice(0, 8);
  if (customerId && serviceId && appointmentDate && appointmentTime) {
    filters.push(`and(client_id.eq.${customerId},appointment_date.eq.${appointmentDate},service_id.eq.${serviceId},appointment_time.eq.${appointmentTime})`);
  }
  if (customerId && appointmentDate && paidServiceIds.length > 0) {
    filters.push(`and(client_id.eq.${customerId},appointment_date.eq.${appointmentDate},service_id.in.(${paidServiceIds.join(',')}))`);
  }
  const reservations = await postgrest.get<Array<Record<string, unknown>>>(aptPath, {
    select: 'id,status,client_id,appointment_date,appointment_time,service_id,sale_group_id,deposit_amount,total_price',
    or: `(${filters.join(',')})`,
    limit: 200,
  }, schema);
  return {
    anchor,
    reservations: (Array.isArray(reservations) ? reservations : []).map((row) => rowFromDb({
      ...row,
      customer_id: row.client_id,
    })),
    sales: fullSales.map((row) => saleFromDb(row)),
    paidServiceIds,
  };
}

async function applyGreenStatusPostgrest(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { postgrest } = await import('./api/postgrestClient');
  const fn = firmNr();
  const pn = periodNr();
  const updated = await postgrest.patch<Array<{ id?: string }>>(
    `/rex_${fn}_${pn}_beauty_appointments?id=in.(${ids.join(',')})&status=in.(scheduled,confirmed,pre_paid,in_progress,pending)`,
    { status: GREEN_RESERVATION_STATUS, updated_at: new Date().toISOString() },
    { schema: 'beauty', prefer: 'return=representation' },
  );
  if (!Array.isArray(updated)) return ids;
  return updated.map((row) => asText(row.id)).filter(Boolean);
}

/**
 * Tam ödenmiş ve kapanmış ziyaretin bağlı rezervasyonlarını yeşil duruma yazar.
 * Yalnızca `status` değişir. Kasa, peşinat, ciro ve stok satırı yazılmaz.
 */
export async function completeLinkedReservationsForGreen(anchorId: string): Promise<string[]> {
  const anchor = asText(anchorId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(anchor)) return [];
  const loaded = shouldUseTenantPostgrestApi()
    ? await loadPostgrestContext(anchor)
    : await loadPostgresContext(anchor);
  if (!loaded) return [];
  const fullyPaid = loaded.sales.some((sale) => serviceSaleFullyPaysVisit(sale));
  const anchorStatus = asText(loaded.anchor.status).toLowerCase();
  const visitCompleted = anchorStatus === 'completed' || anchorStatus === 'closed' || fullyPaid;
  const ids = linkedReservationIdsForGreenStatus({
    fullyPaid,
    visitCompleted,
    anchor: loaded.anchor,
    reservations: loaded.reservations,
    paidServiceIds: loaded.paidServiceIds,
  });
  if (ids.length === 0) return [];
  return shouldUseTenantPostgrestApi()
    ? applyGreenStatusPostgrest(ids)
    : applyGreenStatusPostgres(ids);
}
