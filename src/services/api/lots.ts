/**
 * Lots API - Direct PostgreSQL Implementation
 */

import { postgres } from '../postgres';

export async function fetchLots(firmaId: string, productId?: string) {
  try {
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
  await postgres.query(`UPDATE lots SET is_active = false WHERE id = $1`, [id]);
  return { success: true };
}

export async function recordLotMovement(id: string, movement: any) {
  // Movement logic based on requirement
  await postgres.query(
    `UPDATE lots SET quantity = quantity + $1 WHERE id = $2`,
    [movement.quantity, id]
  );
  return { success: true };
}

export async function fetchExpiringSoonLots(firmaId: string, days: number = 30) {
  const { rows } = await postgres.query(
    `SELECT * FROM lots 
     WHERE is_active = true 
       AND expiration_date <= CURRENT_DATE + interval '$1 days'
       AND expiration_date >= CURRENT_DATE`,
    [days]
  );
  return rows;
}
