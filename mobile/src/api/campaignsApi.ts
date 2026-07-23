import { pgQuery } from './pgClient';
import { campaignsTable, firmNr, newUuid } from './erpTables';

export type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  discount_type: string;
  discount_value: number;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  min_purchase_amount: number;
  max_discount_amount: number | null;
  applicable_categories: string | null;
  applicable_products: string[] | string | null;
  priority: number;
  created_at: string | null;
  updated_at: string | null;
};

export type CampaignDetail = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  discountType: string;
  discountValue: number;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  minPurchaseAmount: number;
  maxDiscountAmount: number | null;
  categoryId: string | null;
  productIds: string[];
  priority: number;
  createdAt: string | null;
  updatedAt: string | null;
};

const LIST_COLS = `
  id, name, description, type, discount_type,
  COALESCE(discount_value, 0)::float8 AS discount_value,
  start_date, end_date,
  COALESCE(is_active, true) AS is_active,
  COALESCE(min_purchase_amount, 0)::float8 AS min_purchase_amount,
  max_discount_amount,
  applicable_categories,
  applicable_products,
  COALESCE(priority, 0) AS priority,
  created_at, updated_at`;

function parseProductIds(raw: string[] | string | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row: CampaignRow): CampaignDetail {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    type: row.type,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value) || 0,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.is_active,
    minPurchaseAmount: Number(row.min_purchase_amount) || 0,
    maxDiscountAmount:
      row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
    categoryId: row.applicable_categories,
    productIds: parseProductIds(row.applicable_products),
    priority: Number(row.priority) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function firmFilterSql(alias = '', startParam = 1): string {
  const p = alias ? `${alias}.` : '';
  const a = startParam;
  const b = startParam + 1;
  return `(
    LPAD(TRIM(COALESCE(${p}firm_nr, '')), 3, '0') = $${a}
    OR TRIM(COALESCE(${p}firm_nr, '')) = $${b}
    OR ${p}firm_nr IS NULL
  )`;
}

function firmParams(): [string, string] {
  const fn = firmNr();
  return [fn, fn.replace(/^0+/, '') || fn];
}

export async function fetchCampaigns(search = '', limit = 200): Promise<CampaignDetail[]> {
  const table = campaignsTable();
  const [fn, fnShort] = firmParams();
  const q = search.trim();

  if (q.length >= 1) {
    const like = `%${q}%`;
    const res = await pgQuery<CampaignRow>(
      `SELECT ${LIST_COLS}
       FROM ${table}
       WHERE ${firmFilterSql()}
         AND (
           name ILIKE $3
           OR COALESCE(description, '') ILIKE $3
           OR type ILIKE $3
         )
       ORDER BY priority ASC, name ASC
       LIMIT $4`,
      [fn, fnShort, like, limit],
    );
    return res.rows.map(mapRow);
  }

  const res = await pgQuery<CampaignRow>(
    `SELECT ${LIST_COLS}
     FROM ${table}
     WHERE ${firmFilterSql()}
     ORDER BY priority ASC, name ASC
     LIMIT $3`,
    [fn, fnShort, limit],
  );
  return res.rows.map(mapRow);
}

export async function fetchCampaignById(id: string): Promise<CampaignDetail | null> {
  const table = campaignsTable();
  const [fn, fnShort] = firmParams();
  const res = await pgQuery<CampaignRow>(
    `SELECT ${LIST_COLS}
     FROM ${table}
     WHERE id = $1
       AND ${firmFilterSql('', 2)}
     LIMIT 1`,
    [id, fn, fnShort],
  );
  const row = res.rows[0];
  return row ? mapRow(row) : null;
}

/** Dönem içi aktif kampanyalar (POS motoru) */
export async function fetchActiveCampaigns(limit = 100): Promise<CampaignDetail[]> {
  const table = campaignsTable();
  const [fn, fnShort] = firmParams();
  const res = await pgQuery<CampaignRow>(
    `SELECT ${LIST_COLS}
     FROM ${table}
     WHERE ${firmFilterSql()}
       AND COALESCE(is_active, true) = true
       AND (start_date IS NULL OR start_date <= NOW())
       AND (end_date IS NULL OR end_date >= NOW())
     ORDER BY priority ASC, name ASC
     LIMIT $3`,
    [fn, fnShort, limit],
  );
  return res.rows.map(mapRow);
}

export type CampaignInput = {
  name: string;
  description?: string | null;
  /** Kayıt türü — genelde discountType ile aynı */
  type?: string;
  discountType: string;
  discountValue: number;
  startDate?: string | null;
  endDate?: string | null;
  active?: boolean;
  minPurchaseAmount?: number;
  maxDiscountAmount?: number | null;
  categoryId?: string | null;
  productIds?: string[];
  priority?: number;
};

function normalizeDiscountType(t: string): string {
  const v = String(t || 'percentage').trim();
  if (v === 'buy-x-get-y') return 'buyXgetY';
  return v || 'percentage';
}

export async function createCampaign(input: CampaignInput): Promise<CampaignDetail> {
  const name = input.name.trim();
  if (!name) throw new Error('Kampanya adı zorunludur');

  const discountType = normalizeDiscountType(input.discountType);
  const discountValue = Number(input.discountValue) || 0;
  if (discountValue < 0) throw new Error('İndirim değeri negatif olamaz');
  if (discountType === 'percentage' && discountValue > 100) {
    throw new Error('Yüzde indirim en fazla 100 olabilir');
  }

  const table = campaignsTable();
  const fn = firmNr();
  const id = newUuid();
  const type = (input.type || discountType).trim() || discountType;
  const productIds = input.productIds ?? [];

  const res = await pgQuery<CampaignRow>(
    `INSERT INTO ${table} (
       id, firm_nr, name, description, type, discount_type, discount_value,
       start_date, end_date, is_active, min_purchase_amount, max_discount_amount,
       applicable_categories, applicable_products, priority
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7,
       $8::timestamptz, $9::timestamptz, $10, $11, $12,
       $13, $14::jsonb, $15
     )
     RETURNING ${LIST_COLS}`,
    [
      id,
      fn,
      name,
      (input.description ?? '').trim() || null,
      type,
      discountType,
      discountValue,
      input.startDate || null,
      input.endDate || null,
      input.active !== false,
      Number(input.minPurchaseAmount) || 0,
      input.maxDiscountAmount != null && Number(input.maxDiscountAmount) > 0
        ? Number(input.maxDiscountAmount)
        : null,
      (input.categoryId ?? '').trim() || null,
      JSON.stringify(productIds),
      Number(input.priority) || 0,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error('Kampanya eklenemedi');
  return mapRow(row);
}

export async function updateCampaign(
  id: string,
  input: Partial<CampaignInput>,
): Promise<CampaignDetail> {
  if (!id) throw new Error('Kampanya id gerekli');

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const push = (col: string, val: unknown) => {
    fields.push(`${col} = $${i++}`);
    values.push(val);
  };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Kampanya adı zorunludur');
    push('name', name);
  }
  if (input.description !== undefined) {
    push('description', (input.description ?? '').trim() || null);
  }
  if (input.discountType !== undefined) {
    const discountType = normalizeDiscountType(input.discountType);
    push('discount_type', discountType);
    if (input.type === undefined) push('type', discountType);
  }
  if (input.type !== undefined) {
    push('type', String(input.type).trim() || 'percentage');
  }
  if (input.discountValue !== undefined) {
    const discountValue = Number(input.discountValue) || 0;
    if (discountValue < 0) throw new Error('İndirim değeri negatif olamaz');
    push('discount_value', discountValue);
  }
  if (input.startDate !== undefined) push('start_date', input.startDate || null);
  if (input.endDate !== undefined) push('end_date', input.endDate || null);
  if (input.active !== undefined) push('is_active', input.active);
  if (input.minPurchaseAmount !== undefined) {
    push('min_purchase_amount', Number(input.minPurchaseAmount) || 0);
  }
  if (input.maxDiscountAmount !== undefined) {
    push(
      'max_discount_amount',
      input.maxDiscountAmount != null && Number(input.maxDiscountAmount) > 0
        ? Number(input.maxDiscountAmount)
        : null,
    );
  }
  if (input.categoryId !== undefined) {
    push('applicable_categories', (input.categoryId ?? '').trim() || null);
  }
  if (input.productIds !== undefined) {
    push('applicable_products', JSON.stringify(input.productIds));
  }
  if (input.priority !== undefined) {
    push('priority', Number(input.priority) || 0);
  }

  if (fields.length === 0) {
    const existing = await fetchCampaignById(id);
    if (!existing) throw new Error('Kampanya bulunamadı');
    return existing;
  }

  fields.push('updated_at = NOW()');
  const table = campaignsTable();
  const [fn, fnShort] = firmParams();
  const idParam = i;
  const firmStart = i + 1;
  values.push(id, fn, fnShort);

  const res = await pgQuery<CampaignRow>(
    `UPDATE ${table}
     SET ${fields.join(', ')}
     WHERE id = $${idParam}::uuid
       AND ${firmFilterSql('', firmStart)}
     RETURNING ${LIST_COLS}`,
    values,
  );
  const row = res.rows[0];
  if (!row) throw new Error('Kampanya güncellenemedi');
  return mapRow(row);
}

export async function setCampaignActive(id: string, active: boolean): Promise<boolean> {
  const table = campaignsTable();
  const [fn, fnShort] = firmParams();
  const res = await pgQuery<{ id: string }>(
    `UPDATE ${table}
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2::uuid
       AND ${firmFilterSql('', 3)}
     RETURNING id`,
    [active, id, fn, fnShort],
  );
  return res.rows.length > 0;
}

/** Kampanya döneminde mi (tarih aralığı) */
export function isCampaignInPeriod(c: Pick<CampaignDetail, 'startDate' | 'endDate'>): boolean {
  const now = Date.now();
  if (c.startDate && new Date(c.startDate).getTime() > now) return false;
  if (c.endDate && new Date(c.endDate).getTime() < now) return false;
  return true;
}

export function formatCampaignDiscount(c: CampaignDetail): string {
  if (c.discountType === 'percentage' || c.type === 'percentage') {
    return `%${c.discountValue}`;
  }
  return `${c.discountValue.toLocaleString('tr-TR')} ₺`;
}

export function formatCampaignPeriod(
  start: string | null,
  end: string | null,
): string {
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('tr-TR') : '—';
  return `${fmt(start)} – ${fmt(end)}`;
}
