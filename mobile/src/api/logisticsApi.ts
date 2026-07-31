/**
 * Teslimat / kurye — web `logisticsService` + `logistics.courier_locations` ile uyumlu.
 * pg_bridge üzerinden ham SQL.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { firmNr, periodNr } from './erpTables';
import { useAuthStore } from '../store/authStore';

const LOCAL_QUEUE_KEY = 'retailex_courier_loc_queue';

export type DeliveryStatus =
  | 'draft'
  | 'planned'
  | 'picking'
  | 'packing'
  | 'loading'
  | 'in_transit'
  | 'delivered'
  | 'partial'
  | 'absent'
  | 'cancelled'
  | 'returned';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft: 'Taslak',
  planned: 'Planlandı',
  picking: 'Toplama',
  packing: 'Paketleme',
  loading: 'Yükleme',
  in_transit: 'Yolda',
  delivered: 'Teslim Edildi',
  partial: 'Kısmi Teslim',
  absent: 'Adreste Yok',
  cancelled: 'İptal',
  returned: 'İade',
};

const STATUS_FLOW: Record<DeliveryStatus, DeliveryStatus[]> = {
  draft: ['planned', 'picking', 'cancelled'],
  planned: ['picking', 'cancelled'],
  picking: ['packing', 'cancelled'],
  packing: ['loading', 'cancelled'],
  loading: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'partial', 'absent', 'returned'],
  delivered: ['returned'],
  partial: ['delivered', 'returned', 'in_transit'],
  absent: ['in_transit', 'cancelled', 'returned'],
  cancelled: [],
  returned: [],
};

export type LogisticsDelivery = {
  id: string;
  delivery_no: string;
  delivery_date: string;
  customer_name: string | null;
  address_text: string | null;
  phone: string | null;
  status: string;
  courier_id: string | null;
  courier_name: string | null;
  vehicle_plate: string | null;
  sales_fiche_no: string | null;
  lat: number | null;
  lng: number | null;
  line_count: number;
};

export type LogisticsCourier = {
  id: string;
  full_name: string;
  phone: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  user_id: string | null;
};

export type CourierLocationPoint = {
  lat: number;
  lng: number;
  speedKmh?: number | null;
  recordedAt?: string;
  deliveryId?: string | null;
};

export type CourierLocationHistoryRow = {
  id: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  recorded_at: string;
  delivery_id: string | null;
};

/** Son N dakika içinde konum güncellendiyse “canlı” sayılır */
export function isCourierLocationFresh(
  lastLocationAt: string | null | undefined,
  withinMinutes = 5,
): boolean {
  if (!lastLocationAt) return false;
  const t = new Date(lastLocationAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= withinMinutes * 60_000;
}

function normalizeStatus(s: string | undefined | null): DeliveryStatus {
  const v = String(s || 'draft').trim().toLowerCase() as DeliveryStatus;
  return v in DELIVERY_STATUS_LABELS ? v : 'draft';
}

export function nextStatuses(from: string): DeliveryStatus[] {
  return STATUS_FLOW[normalizeStatus(from)] || [];
}

export function statusLabel(s: string): string {
  return DELIVERY_STATUS_LABELS[normalizeStatus(s)] || s;
}

export async function listDeliveries(opts?: {
  status?: string;
  limit?: number;
  search?: string;
}): Promise<LogisticsDelivery[]> {
  return runDataTransport({
    label: 'listDeliveries',
    viaRest: () => listDeliveriesViaRest(opts),
    viaBridge: () => listDeliveriesViaBridge(opts),
  });
}

async function listDeliveriesViaRest(opts?: {
  status?: string;
  limit?: number;
  search?: string;
}): Promise<LogisticsDelivery[]> {
  const f = firmNr();
  const p = periodNr();
  const limit = opts?.limit ?? 80;
  const query: Record<string, string | number> = {
    select:
      'id,delivery_no,delivery_date,customer_name,address_text,phone,status,courier_id,sales_fiche_no,lat,lng,vehicle_id,firm_nr,period_nr',
    firm_nr: `eq.${f}`,
    period_nr: `eq.${p}`,
    status: 'neq.cancelled',
    order: 'delivery_date.desc',
    limit,
  };
  if (opts?.status && opts.status !== 'all') {
    query.status = `eq.${opts.status}`;
  }

  const rows = await postgrestGet<Record<string, unknown>[]>(
    '/deliveries',
    query,
    { schema: 'logistics' },
  );

  const search = opts?.search?.trim().toLowerCase() || '';
  let list = (Array.isArray(rows) ? rows : []).map((d) => ({
    id: String(d.id ?? ''),
    delivery_no: String(d.delivery_no ?? ''),
    delivery_date: String(d.delivery_date || '').slice(0, 10),
    customer_name: d.customer_name != null ? String(d.customer_name) : null,
    address_text: d.address_text != null ? String(d.address_text) : null,
    phone: d.phone != null ? String(d.phone) : null,
    status: String(d.status || 'draft'),
    courier_id: d.courier_id ? String(d.courier_id) : null,
    courier_name: null as string | null,
    vehicle_plate: null as string | null,
    sales_fiche_no: d.sales_fiche_no != null ? String(d.sales_fiche_no) : null,
    lat: d.lat != null ? Number(d.lat) : null,
    lng: d.lng != null ? Number(d.lng) : null,
    line_count: 0,
  }));

  if (search) {
    list = list.filter(
      (d) =>
        d.delivery_no.toLowerCase().includes(search) ||
        (d.sales_fiche_no || '').toLowerCase().includes(search) ||
        (d.customer_name || '').toLowerCase().includes(search) ||
        (d.address_text || '').toLowerCase().includes(search),
    );
  }

  return list.slice(0, limit);
}

async function listDeliveriesViaBridge(opts?: {
  status?: string;
  limit?: number;
  search?: string;
}): Promise<LogisticsDelivery[]> {
  const f = firmNr();
  const p = periodNr();
  const limit = opts?.limit ?? 80;
  const params: unknown[] = [f, p];
  let where = `d.firm_nr = $1 AND d.period_nr = $2 AND d.status <> 'cancelled'`;

  if (opts?.status && opts.status !== 'all') {
    params.push(opts.status);
    where += ` AND d.status = $${params.length}`;
  }
  if (opts?.search?.trim()) {
    params.push(`%${opts.search.trim()}%`);
    where += ` AND (
      d.delivery_no ILIKE $${params.length}
      OR COALESCE(d.sales_fiche_no,'') ILIKE $${params.length}
      OR COALESCE(d.customer_name,'') ILIKE $${params.length}
      OR COALESCE(d.address_text,'') ILIKE $${params.length}
    )`;
  }
  params.push(limit);

  const { rows } = await pgQuery<{
    id: string;
    delivery_no: string;
    delivery_date: string;
    customer_name: string | null;
    address_text: string | null;
    phone: string | null;
    status: string;
    courier_id: string | null;
    courier_name: string | null;
    vehicle_plate: string | null;
    sales_fiche_no: string | null;
    lat: string | number | null;
    lng: string | number | null;
    line_count: number;
  }>(
    `SELECT d.id, d.delivery_no, d.delivery_date::text AS delivery_date,
            d.customer_name, d.address_text, d.phone, d.status, d.courier_id,
            d.sales_fiche_no, d.lat, d.lng,
            (SELECT COUNT(*)::int FROM logistics.delivery_lines dl WHERE dl.delivery_id = d.id) AS line_count,
            c.full_name AS courier_name,
            v.plate AS vehicle_plate
     FROM logistics.deliveries d
     LEFT JOIN logistics.couriers c ON c.id = d.courier_id
     LEFT JOIN logistics.vehicles v ON v.id = d.vehicle_id
     WHERE ${where}
     ORDER BY d.delivery_date DESC, d.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  return rows.map((r) => ({
    id: String(r.id),
    delivery_no: String(r.delivery_no),
    delivery_date: String(r.delivery_date || '').slice(0, 10),
    customer_name: r.customer_name,
    address_text: r.address_text,
    phone: r.phone,
    status: String(r.status || 'draft'),
    courier_id: r.courier_id ? String(r.courier_id) : null,
    courier_name: r.courier_name,
    vehicle_plate: r.vehicle_plate,
    sales_fiche_no: r.sales_fiche_no,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    line_count: Number(r.line_count || 0),
  }));
}

export async function listCouriers(): Promise<LogisticsCourier[]> {
  const f = firmNr();
  return runDataTransport({
    label: 'listCouriers',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/couriers',
        {
          select: 'id,full_name,phone,last_lat,last_lng,last_location_at,user_id',
          firm_nr: `eq.${f}`,
          is_active: 'eq.true',
          order: 'full_name.asc',
          limit: 500,
        },
        { schema: 'logistics' },
      );
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id ?? ''),
        full_name: String(r.full_name ?? ''),
        phone: r.phone != null ? String(r.phone) : null,
        last_lat: r.last_lat != null ? Number(r.last_lat) : null,
        last_lng: r.last_lng != null ? Number(r.last_lng) : null,
        last_location_at: r.last_location_at != null ? String(r.last_location_at) : null,
        user_id: r.user_id != null ? String(r.user_id) : null,
      }));
    },
    viaBridge: async () => {
      const { rows } = await pgQuery<{
        id: string;
        full_name: string;
        phone: string | null;
        last_lat: string | number | null;
        last_lng: string | number | null;
        last_location_at: string | null;
        user_id: string | null;
      }>(
        `SELECT id, full_name, phone, last_lat, last_lng, last_location_at, user_id::text AS user_id
         FROM logistics.couriers
         WHERE firm_nr = $1 AND is_active
         ORDER BY full_name`,
        [f],
      );
      return rows.map((r) => ({
        id: String(r.id),
        full_name: String(r.full_name),
        phone: r.phone,
        last_lat: r.last_lat != null ? Number(r.last_lat) : null,
        last_lng: r.last_lng != null ? Number(r.last_lng) : null,
        last_location_at: r.last_location_at,
        user_id: r.user_id,
      }));
    },
  });
}

/** Oturum kullanıcısına bağlı veya ilk aktif kuryeyi öner */
export function pickDefaultCourier(couriers: LogisticsCourier[]): LogisticsCourier | null {
  if (!couriers.length) return null;
  const uid = useAuthStore.getState().user?.id;
  if (uid) {
    const match = couriers.find((c) => c.user_id && String(c.user_id) === String(uid));
    if (match) return match;
  }
  return couriers[0];
}

export async function transitionDeliveryStatus(
  deliveryId: string,
  toStatus: DeliveryStatus | string,
  opts?: { note?: string; lat?: number | null; lng?: number | null },
): Promise<void> {
  return runDataTransport({
    label: 'transitionDeliveryStatus',
    viaRest: () => transitionDeliveryStatusViaRest(deliveryId, toStatus, opts),
    viaBridge: () => transitionDeliveryStatusViaBridge(deliveryId, toStatus, opts),
  });
}

async function transitionDeliveryStatusViaRest(
  deliveryId: string,
  toStatus: DeliveryStatus | string,
  opts?: { note?: string; lat?: number | null; lng?: number | null },
): Promise<void> {
  const rows = await postgrestGet<Array<{ status?: string }>>(
    '/deliveries',
    { select: 'status', id: `eq.${deliveryId}`, limit: 1 },
    { schema: 'logistics' },
  );
  const from = normalizeStatus(rows?.[0]?.status);
  const to = normalizeStatus(toStatus);
  if (!(STATUS_FLOW[from] || []).includes(to)) {
    throw new Error(`Durum geçişi geçersiz: ${statusLabel(from)} → ${statusLabel(to)}`);
  }
  const actor = useAuthStore.getState().user?.username ?? null;
  await postgrestPatch(
    `/deliveries?id=eq.${encodeURIComponent(deliveryId)}`,
    { status: to, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { schema: 'logistics', prefer: 'return=minimal' },
  );
  await postgrestPost(
    '/delivery_status_events',
    {
      delivery_id: deliveryId,
      from_status: from,
      to_status: to,
      actor_id: actor,
      note: opts?.note ?? null,
      lat: opts?.lat ?? null,
      lng: opts?.lng ?? null,
    },
    { schema: 'logistics', prefer: 'return=minimal' },
  );
}

async function transitionDeliveryStatusViaBridge(
  deliveryId: string,
  toStatus: DeliveryStatus | string,
  opts?: { note?: string; lat?: number | null; lng?: number | null },
): Promise<void> {
  const { rows } = await pgQuery<{ status: string }>(
    `SELECT status FROM logistics.deliveries WHERE id = $1::uuid LIMIT 1`,
    [deliveryId],
  );
  const from = normalizeStatus(rows[0]?.status);
  const to = normalizeStatus(toStatus);
  if (!(STATUS_FLOW[from] || []).includes(to)) {
    throw new Error(`Durum geçişi geçersiz: ${statusLabel(from)} → ${statusLabel(to)}`);
  }

  const actor = useAuthStore.getState().user?.username ?? null;

  await pgQuery(
    `UPDATE logistics.deliveries
     SET status = $2, status_changed_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [deliveryId, to],
  );
  await pgQuery(
    `INSERT INTO logistics.delivery_status_events
       (delivery_id, from_status, to_status, actor_id, note, lat, lng)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
    [
      deliveryId,
      from,
      to,
      actor,
      opts?.note ?? null,
      opts?.lat ?? null,
      opts?.lng ?? null,
    ],
  );
}

type QueuedLoc = CourierLocationPoint & { firmNr: string; courierId: string };

async function enqueueLocal(point: QueuedLoc): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_QUEUE_KEY);
    const list: QueuedLoc[] = raw ? (JSON.parse(raw) as QueuedLoc[]) : [];
    list.push(point);
    const trimmed = list.slice(-200);
    await AsyncStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

/** Yerel kuyruktaki noktaları PG’ye göndermeyi dener */
export async function flushLocalLocationQueue(): Promise<number> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(LOCAL_QUEUE_KEY);
  } catch {
    return 0;
  }
  if (!raw) return 0;
  let list: QueuedLoc[] = [];
  try {
    list = JSON.parse(raw) as QueuedLoc[];
  } catch {
    await AsyncStorage.removeItem(LOCAL_QUEUE_KEY);
    return 0;
  }
  if (!list.length) return 0;

  const remaining: QueuedLoc[] = [];
  let ok = 0;
  for (const p of list) {
    try {
      await writeCourierLocationPg(p.courierId, p, p.firmNr);
      ok += 1;
    } catch {
      remaining.push(p);
    }
  }
  await AsyncStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(remaining));
  return ok;
}

async function writeCourierLocationViaRest(
  courierId: string,
  point: CourierLocationPoint,
  f: string,
): Promise<void> {
  await postgrestPost(
    '/courier_locations',
    {
      firm_nr: f,
      courier_id: courierId,
      delivery_id: point.deliveryId ?? null,
      lat: point.lat,
      lng: point.lng,
      speed_kmh: point.speedKmh ?? null,
      recorded_at: point.recordedAt ?? new Date().toISOString(),
    },
    { schema: 'logistics', prefer: 'return=minimal' },
  );
  await postgrestPatch(
    `/couriers?id=eq.${encodeURIComponent(courierId)}`,
    {
      last_lat: point.lat,
      last_lng: point.lng,
      last_location_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { schema: 'logistics', prefer: 'return=minimal' },
  );
}

async function writeCourierLocationPg(
  courierId: string,
  point: CourierLocationPoint,
  f = firmNr(),
): Promise<void> {
  await pgQuery(
    `INSERT INTO logistics.courier_locations
       (firm_nr, courier_id, delivery_id, lat, lng, speed_kmh, recorded_at)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
    [
      f,
      courierId,
      point.deliveryId ?? null,
      point.lat,
      point.lng,
      point.speedKmh ?? null,
      point.recordedAt ?? null,
    ],
  );
  await pgQuery(
    `UPDATE logistics.couriers
     SET last_lat = $2, last_lng = $3, last_location_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [courierId, point.lat, point.lng],
  );
}

/**
 * Kurye konumunu PG'ye yazar; hata olursa AsyncStorage kuyruğuna alır.
 * Döner: `'pg' | 'local'`
 */
export async function recordCourierLocation(
  courierId: string,
  point: CourierLocationPoint,
): Promise<'pg' | 'local'> {
  if (!courierId) throw new Error('Kurye seçilmedi');
  const f = firmNr();
  try {
    await runDataTransport({
      label: 'recordCourierLocation',
      viaRest: () => writeCourierLocationViaRest(courierId, point, f),
      viaBridge: () => writeCourierLocationPg(courierId, point, f),
    });
    return 'pg';
  } catch {
    await enqueueLocal({
      ...point,
      firmNr: f,
      courierId,
      recordedAt: point.recordedAt ?? new Date().toISOString(),
    });
    return 'local';
  }
}

/** Geçmiş rota — logistics.courier_locations (yeniden eskiye) */
export async function listCourierLocationHistory(
  courierId: string,
  opts?: { limit?: number; sinceHours?: number },
): Promise<CourierLocationHistoryRow[]> {
  if (!courierId) return [];
  const limit = Math.min(2000, Math.max(10, opts?.limit ?? 200));
  const sinceHours = Math.min(168, Math.max(1, opts?.sinceHours ?? 24));
  return runDataTransport({
    label: 'listCourierLocationHistory',
    viaRest: async () => {
      const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/courier_locations',
        {
          select: 'id,lat,lng,speed_kmh,recorded_at,delivery_id',
          courier_id: `eq.${courierId}`,
          recorded_at: `gte.${since}`,
          order: 'recorded_at.asc',
          limit,
        },
        { schema: 'logistics' },
      );
      return (Array.isArray(rows) ? rows : []).map(mapLocationHistoryRow).filter((r) => r.id);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, lat::float8 AS lat, lng::float8 AS lng,
                speed_kmh::float8 AS speed_kmh,
                recorded_at::text AS recorded_at,
                delivery_id::text AS delivery_id
         FROM logistics.courier_locations
         WHERE courier_id = $1::uuid
           AND recorded_at >= now() - ($2::int || ' hours')::interval
         ORDER BY recorded_at ASC
         LIMIT $3`,
        [courierId, sinceHours, limit],
      );
      return (res.rows || []).map(mapLocationHistoryRow).filter((r) => r.id);
    },
  });
}

function mapLocationHistoryRow(r: Record<string, unknown>): CourierLocationHistoryRow {
  return {
    id: String(r.id ?? ''),
    lat: Number(r.lat),
    lng: Number(r.lng),
    speed_kmh: r.speed_kmh == null ? null : Number(r.speed_kmh),
    recorded_at: String(r.recorded_at ?? ''),
    delivery_id: r.delivery_id == null ? null : String(r.delivery_id),
  };
}
