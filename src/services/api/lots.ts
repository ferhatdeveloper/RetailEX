/**
 * Lots API - Direct PostgreSQL Implementation
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function lotsPath(suffix = ''): string {
  return `/rex_${padFirmNr()}_lots${suffix}`;
}

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

export async function fetchLots(firmaId: string, productId?: string) {
  try {
    if (isRestApi()) {
      const { postgrest } = await import('./postgrestClient');
      const q: Record<string, string> = {
        select: '*',
        is_active: 'eq.true',
      };
      if (productId) q.product_id = `eq.${productId}`;
      const rows = await postgrest.get<any[]>(lotsPath(), q, { schema: 'public' });
      return Array.isArray(rows) ? rows : [];
    }
    let sql = `SELECT * FROM lots WHERE is_active = true`;
    const params: any[] = [];

    if (productId) {
      sql += ` AND product_id = $1`;
      params.push(productId);
    }

    const { rows } = await postgres.query(sql, params);
    return rows;
  } catch (error) {
    console.error('[LotsAPI] fetchLots failed:', error);
    return [];
  }
}

export async function createLot(lot: any) {
  if (isRestApi()) {
    const { postgrest } = await import('./postgrestClient');
    const rows = await postgrest.post<any[]>(
      lotsPath(),
      {
        product_id: lot.product_id,
        variant_id: lot.variant_id ?? null,
        lot_no: lot.lot_no,
        serial_no: lot.serial_no ?? null,
        expiration_date: lot.expiration_date ?? null,
        production_date: lot.production_date ?? null,
        quantity: lot.quantity || 0,
        is_active: true,
      },
      { schema: 'public', prefer: 'return=representation' }
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const { rows } = await postgres.query(
    `INSERT INTO lots (product_id, variant_id, lot_no, serial_no, expiration_date, production_date, quantity, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
    [
      lot.product_id,
      lot.variant_id,
      lot.lot_no,
      lot.serial_no,
      lot.expiration_date,
      lot.production_date,
      lot.quantity || 0
    ]
  );
  return rows[0];
}

export async function updateLot(id: string, updates: any) {
  if (isRestApi()) {
    const { postgrest } = await import('./postgrestClient');
    const body: Record<string, unknown> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) body[key] = value;
    });
    const rows = await postgrest.patch<any[]>(
      `${lotsPath()}?id=eq.${encodeURIComponent(id)}`,
      body,
      { schema: 'public', prefer: 'return=representation' }
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }
  const fields: string[] = [];
  const values: any[] = [];
  let i = 1;

  Object.entries(updates).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(value);
    }
  });

  values.push(id);
  const { rows } = await postgres.query(
    `UPDATE lots SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0];
}

export async function deleteLot(id: string) {
  if (isRestApi()) {
    const { postgrest } = await import('./postgrestClient');
    await postgrest.patch(
      `${lotsPath()}?id=eq.${encodeURIComponent(id)}`,
      { is_active: false },
      { schema: 'public', prefer: 'return=minimal' }
    );
    return { success: true };
  }
  await postgres.query(`UPDATE lots SET is_active = false WHERE id = $1`, [id]);
  return { success: true };
}

export async function recordLotMovement(id: string, movement: any) {
  if (isRestApi()) {
    const { postgrest } = await import('./postgrestClient');
    const cur = await postgrest.get<{ quantity?: number }[]>(
      lotsPath(),
      { select: 'quantity', id: `eq.${id}`, limit: 1 },
      { schema: 'public' }
    );
    const q0 = Array.isArray(cur) ? cur[0] : null;
    const base = Number(q0?.quantity ?? 0);
    const next = base + Number(movement.quantity ?? 0);
    await postgrest.patch(
      `${lotsPath()}?id=eq.${encodeURIComponent(id)}`,
      { quantity: next },
      { schema: 'public', prefer: 'return=minimal' }
    );
    return { success: true };
  }
  await postgres.query(
    `UPDATE lots SET quantity = quantity + $1 WHERE id = $2`,
    [movement.quantity, id]
  );
  return { success: true };
}

export async function fetchExpiringSoonLots(firmaId: string, days: number = 30) {
  const d = Math.max(1, Math.min(Number(days) || 30, 3650));
  if (isRestApi()) {
    const { postgrest } = await import('./postgrestClient');
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + d);
    const fmt = (x: Date) => x.toISOString().slice(0, 10);
    const rows = await postgrest.get<any[]>(
      lotsPath(),
      {
        select: '*',
        is_active: 'eq.true',
        and: `(expiration_date.gte.${fmt(today)},expiration_date.lte.${fmt(end)})`,
      },
      { schema: 'public' }
    );
    return Array.isArray(rows) ? rows : [];
  }
  const { rows } = await postgres.query(
    `SELECT * FROM lots 
     WHERE is_active = true 
       AND expiration_date <= CURRENT_DATE + ($1::int * interval '1 day')
       AND expiration_date >= CURRENT_DATE`,
    [d]
  );
  return rows;
}
