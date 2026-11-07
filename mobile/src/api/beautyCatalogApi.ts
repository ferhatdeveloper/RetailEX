/**
 * Güzellik katalog işlemleri — web `beautyService` kart tabloları:
 * rex_{firma}_beauty_packages / _devices / _leads / _service_consumables.
 */

import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { beautyServicesTable, firmNr, newUuid, productsTable } from './erpTables';

const BEAUTY = { schema: 'beauty' as const };

function bare(sqlName: string): string {
  return sqlName.replace(/^beauty\./, '');
}

function card(name: string): string {
  return `beauty.rex_${firmNr()}_${name}`;
}

function cardPath(name: string): string {
  return `/rex_${firmNr()}_${name}`;
}

export type BeautyPackageRow = {
  id: string;
  name: string;
  price: number;
  total_sessions: number;
  description: string | null;
};

export type BeautyDeviceRow = {
  id: string;
  name: string;
  device_type: string | null;
  status: string | null;
  serial_number: string | null;
};

export type BeautyLeadRow = {
  id: string;
  name: string;
  phone: string | null;
  status: string | null;
  source: string | null;
};

export type BeautyConsumableRow = {
  id: string;
  service_id: string;
  product_id: string;
  product_name: string | null;
  qty_per_service: number;
};

export async function fetchBeautyPackages(): Promise<BeautyPackageRow[]> {
  return runDataTransport({
    label: 'fetchBeautyPackages',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        cardPath('beauty_packages'),
        { select: 'id,name,price,total_sessions,description,is_active', order: 'name.asc', limit: 500 },
        BEAUTY,
      );
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => r.is_active !== false)
        .map(mapPackage);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, name, price, total_sessions, description
           FROM ${card('beauty_packages')}
          WHERE COALESCE(is_active, true) = true
          ORDER BY name`,
      );
      return res.rows.map(mapPackage);
    },
  });
}

function mapPackage(r: Record<string, unknown>): BeautyPackageRow {
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    price: Number(r.price) || 0,
    total_sessions: Number(r.total_sessions) || 1,
    description: r.description != null ? String(r.description) : null,
  };
}

export async function saveBeautyPackage(input: {
  id?: string;
  name: string;
  price: number;
  totalSessions: number;
  description?: string;
}): Promise<void> {
  const body = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    total_sessions: input.totalSessions || 1,
    price: Number(input.price) || 0,
    is_active: true,
  };
  await runDataTransport({
    label: 'saveBeautyPackage',
    viaRest: async () => {
      if (input.id) {
        await postgrestPatch(
          `${cardPath('beauty_packages')}?id=eq.${encodeURIComponent(input.id)}`,
          { ...body, updated_at: new Date().toISOString() },
          { ...BEAUTY, prefer: 'return=minimal' },
        );
        return;
      }
      await postgrestPost(
        cardPath('beauty_packages'),
        { id: newUuid(), ...body },
        { ...BEAUTY, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = card('beauty_packages');
      if (input.id) {
        await pgQuery(
          `UPDATE ${t}
              SET name = $2, description = $3, total_sessions = $4, price = $5, updated_at = NOW()
            WHERE id = $1::uuid`,
          [input.id, body.name, body.description, body.total_sessions, body.price],
        );
        return;
      }
      await pgQuery(
        `INSERT INTO ${t} (id, name, description, total_sessions, price, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, $5, true, NOW(), NOW())`,
        [newUuid(), body.name, body.description, body.total_sessions, body.price],
      );
    },
  });
}

export async function fetchBeautyDevices(): Promise<BeautyDeviceRow[]> {
  return runDataTransport({
    label: 'fetchBeautyDevices',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        cardPath('beauty_devices'),
        { select: 'id,name,device_type,status,serial_number,is_active', is_active: 'eq.true', order: 'name.asc', limit: 500 },
        BEAUTY,
      );
      return (Array.isArray(rows) ? rows : []).map(mapDevice);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, name, device_type, status, serial_number
           FROM ${card('beauty_devices')}
          WHERE COALESCE(is_active, true) = true
          ORDER BY name`,
      );
      return res.rows.map(mapDevice);
    },
  });
}

function mapDevice(r: Record<string, unknown>): BeautyDeviceRow {
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    device_type: r.device_type != null ? String(r.device_type) : null,
    status: r.status != null ? String(r.status) : null,
    serial_number: r.serial_number != null ? String(r.serial_number) : null,
  };
}

export async function saveBeautyDevice(input: {
  id?: string;
  name: string;
  deviceType?: string;
  serialNumber?: string;
}): Promise<void> {
  const deviceType = input.deviceType?.trim() || 'laser';
  const serial = input.serialNumber?.trim() || null;
  await runDataTransport({
    label: 'saveBeautyDevice',
    viaRest: async () => {
      if (input.id) {
        await postgrestPatch(
          `${cardPath('beauty_devices')}?id=eq.${encodeURIComponent(input.id)}`,
          { name: input.name.trim(), device_type: deviceType, serial_number: serial, status: 'active', updated_at: new Date().toISOString() },
          { ...BEAUTY, prefer: 'return=minimal' },
        );
        return;
      }
      await postgrestPost(
        cardPath('beauty_devices'),
        {
          id: newUuid(),
          name: input.name.trim(),
          device_type: deviceType,
          serial_number: serial,
          status: 'active',
          is_active: true,
          total_shots: 0,
          max_shots: 500000,
        },
        { ...BEAUTY, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = card('beauty_devices');
      if (input.id) {
        await pgQuery(
          `UPDATE ${t} SET name = $2, device_type = $3, serial_number = $4, status = 'active', updated_at = NOW() WHERE id = $1::uuid`,
          [input.id, input.name.trim(), deviceType, serial],
        );
        return;
      }
      await pgQuery(
        `INSERT INTO ${t}
           (id, name, device_type, serial_number, total_shots, max_shots, status, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2, $3, $4, 0, 500000, 'active', true, NOW(), NOW())`,
        [newUuid(), input.name.trim(), deviceType, serial],
      );
    },
  });
}

export async function fetchBeautyLeads(): Promise<BeautyLeadRow[]> {
  return runDataTransport({
    label: 'fetchBeautyLeads',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        cardPath('beauty_leads'),
        { select: 'id,name,phone,status,source', order: 'created_at.desc', limit: 300 },
        BEAUTY,
      );
      return (Array.isArray(rows) ? rows : []).map(mapLead);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, name, phone, status, source FROM ${card('beauty_leads')} ORDER BY created_at DESC LIMIT 300`,
      );
      return res.rows.map(mapLead);
    },
  });
}

function mapLead(r: Record<string, unknown>): BeautyLeadRow {
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    phone: r.phone != null ? String(r.phone) : null,
    status: r.status != null ? String(r.status) : null,
    source: r.source != null ? String(r.source) : null,
  };
}

export async function saveBeautyLead(input: { name: string; phone?: string; source?: string }): Promise<void> {
  const id = newUuid();
  const today = new Date().toISOString().slice(0, 10);
  await runDataTransport({
    label: 'saveBeautyLead',
    viaRest: () =>
      postgrestPost(
        cardPath('beauty_leads'),
        {
          id,
          name: input.name.trim(),
          phone: input.phone?.trim() || null,
          source: input.source?.trim() || 'other',
          status: 'new',
          first_contact_date: today,
        },
        { ...BEAUTY, prefer: 'return=minimal' },
      ),
    viaBridge: () =>
      pgQuery(
        `INSERT INTO ${card('beauty_leads')} (id, name, phone, source, status, first_contact_date, created_at)
         VALUES ($1::uuid, $2, $3, $4, 'new', $5::date, NOW())`,
        [id, input.name.trim(), input.phone?.trim() || null, input.source?.trim() || 'other', today],
      ),
  });
}

export async function fetchServiceConsumables(serviceId?: string): Promise<BeautyConsumableRow[]> {
  const products = productsTable();
  return runDataTransport({
    label: 'fetchServiceConsumables',
    viaRest: async () => {
      const query: Record<string, string | number> = {
        select: 'id,service_id,product_id,qty_per_service',
        order: 'created_at.asc',
        limit: 500,
      };
      if (serviceId) query.service_id = `eq.${serviceId}`;
      const rows = await postgrestGet<Record<string, unknown>[]>(
        cardPath('beauty_service_consumables'),
        query,
        BEAUTY,
      );
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id ?? ''),
        service_id: String(r.service_id ?? ''),
        product_id: String(r.product_id ?? ''),
        product_name: null,
        qty_per_service: Number(r.qty_per_service) || 0,
      }));
    },
    viaBridge: async () => {
      const t = card('beauty_service_consumables');
      const sql = serviceId
        ? `SELECT c.id::text AS id, c.service_id::text AS service_id, c.product_id::text AS product_id,
                  pr.name AS product_name, c.qty_per_service
             FROM ${t} c
             LEFT JOIN ${products} pr ON pr.id = c.product_id
            WHERE c.service_id = $1::uuid
            ORDER BY c.created_at`
        : `SELECT c.id::text AS id, c.service_id::text AS service_id, c.product_id::text AS product_id,
                  pr.name AS product_name, c.qty_per_service
             FROM ${t} c
             LEFT JOIN ${products} pr ON pr.id = c.product_id
            ORDER BY c.created_at
            LIMIT 500`;
      const res = await pgQuery<BeautyConsumableRow>(sql, serviceId ? [serviceId] : []);
      return res.rows;
    },
  });
}

/** Web `setServiceConsumable` — aynı hizmet+ürün varsa miktarı günceller. */
export async function setServiceConsumable(input: {
  serviceId: string;
  productId: string;
  qty: number;
}): Promise<void> {
  const qty = Math.max(0.0001, Number(input.qty) || 1);
  await runDataTransport({
    label: 'setServiceConsumable',
    viaRest: async () => {
      const rows = await postgrestGet<{ id: string }[]>(
        cardPath('beauty_service_consumables'),
        { select: 'id', service_id: `eq.${input.serviceId}`, product_id: `eq.${input.productId}`, limit: 1 },
        BEAUTY,
      );
      if (rows[0]?.id) {
        await postgrestPatch(
          `${cardPath('beauty_service_consumables')}?id=eq.${encodeURIComponent(rows[0].id)}`,
          { qty_per_service: qty },
          { ...BEAUTY, prefer: 'return=minimal' },
        );
        return;
      }
      await postgrestPost(
        cardPath('beauty_service_consumables'),
        { id: newUuid(), service_id: input.serviceId, product_id: input.productId, qty_per_service: qty },
        { ...BEAUTY, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const t = card('beauty_service_consumables');
      const dup = await pgQuery<{ id: string }>(
        `SELECT id::text AS id FROM ${t} WHERE service_id = $1::uuid AND product_id = $2::uuid LIMIT 1`,
        [input.serviceId, input.productId],
      );
      if (dup.rows[0]?.id) {
        await pgQuery(`UPDATE ${t} SET qty_per_service = $2 WHERE id = $1::uuid`, [dup.rows[0].id, qty]);
        return;
      }
      await pgQuery(
        `INSERT INTO ${t} (id, service_id, product_id, qty_per_service) VALUES ($1::uuid, $2::uuid, $3::uuid, $4)`,
        [newUuid(), input.serviceId, input.productId, qty],
      );
    },
  });
}

export function beautyServicesBare(): string {
  return bare(beautyServicesTable());
}
