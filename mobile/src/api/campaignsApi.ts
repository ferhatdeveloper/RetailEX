import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { campaignsTable, firmNr, newUuid } from './erpTables';
import {
  shouldPreferPostgrest,
  shouldUseBridgeSql,
  useConfigStore,
} from '../store/configStore';

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

/** firm_nr padded + bare + null — PostgREST `or` filtresi */
function firmNrOrFilter(): string {
  const [fn, fnBare] = firmParams();
  const firmParts = Array.from(new Set([fn, fnBare].filter(Boolean)));
  return [...firmParts.map((f) => `firm_nr.eq.${f}`), 'firm_nr.is.null'].join(',');
}

const REST_SELECT =
  'id,name,description,type,discount_type,discount_value,start_date,end_date,is_active,min_purchase_amount,max_discount_amount,applicable_categories,applicable_products,priority,created_at,updated_at';

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

function mapRestCampaignRow(r: Record<string, unknown>): CampaignDetail | null {
  const id = r.id != null ? String(r.id) : '';
  if (!id) return null;
  return mapRow({
    id,
    name: String(r.name ?? ''),
    description: r.description != null ? String(r.description) : null,
    type: String(r.type ?? ''),
    discount_type: String(r.discount_type ?? ''),
    discount_value: Number(r.discount_value) || 0,
    start_date: r.start_date != null ? String(r.start_date) : null,
    end_date: r.end_date != null ? String(r.end_date) : null,
    is_active: !(
      r.is_active === false ||
      r.is_active === 0 ||
      String(r.is_active).toLowerCase() === 'false'
    ),
    min_purchase_amount: Number(r.min_purchase_amount) || 0,
    max_discount_amount:
      r.max_discount_amount != null ? Number(r.max_discount_amount) : null,
    applicable_categories:
      r.applicable_categories != null ? String(r.applicable_categories) : null,
    applicable_products: r.applicable_products as string[] | string | null,
    priority: Number(r.priority) || 0,
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  });
}

async function fetchCampaignsViaPostgrest(
  search: string,
  limit: number,
): Promise<CampaignDetail[]> {
  const table = campaignsTable();
  const firmOr = firmNrOrFilter();
  const query: Record<string, string | number> = {
    select: REST_SELECT,
    order: 'priority.asc,name.asc',
    limit,
    or: `(${firmOr})`,
  };
  const q = escapeIlike(search.trim());
  if (q.length >= 1) {
    query.and = `(or(${firmOr}),or(name.ilike.*${q}*,description.ilike.*${q}*,type.ilike.*${q}*))`;
    delete query.or;
  }
  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });
  return (Array.isArray(rows) ? rows : [])
    .map(mapRestCampaignRow)
    .filter((r): r is CampaignDetail => r != null);
}

async function fetchCampaignsViaBridge(
  search: string,
  limit: number,
): Promise<CampaignDetail[]> {
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

export async function fetchCampaigns(search = '', limit = 200): Promise<CampaignDetail[]> {
  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      return await fetchCampaignsViaPostgrest(search, limit);
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) throw e;
    }
  }
  if (!shouldUseBridgeSql(cfg)) {
    throw new Error(
      shouldPreferPostgrest(cfg)
        ? 'PostgREST kampanya okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }
  return fetchCampaignsViaBridge(search, limit);
}

async function fetchCampaignByIdViaPostgrest(id: string): Promise<CampaignDetail | null> {
  const table = campaignsTable();
  const firmOr = firmNrOrFilter();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: REST_SELECT,
      id: `eq.${id}`,
      or: `(${firmOr})`,
      limit: 1,
    },
    { schema: 'public' },
  );
  const r = Array.isArray(rows) ? rows[0] : null;
  return r ? mapRestCampaignRow(r) : null;
}

async function fetchCampaignByIdViaBridge(id: string): Promise<CampaignDetail | null> {
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

export async function fetchCampaignById(id: string): Promise<CampaignDetail | null> {
  if (!id) return null;
  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      return await fetchCampaignByIdViaPostgrest(id);
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) throw e;
    }
  }
  if (!shouldUseBridgeSql(cfg)) {
    throw new Error(
      shouldPreferPostgrest(cfg)
        ? 'PostgREST kampanya detay okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }
  return fetchCampaignByIdViaBridge(id);
}

async function fetchActiveCampaignsViaPostgrest(limit: number): Promise<CampaignDetail[]> {
  const table = campaignsTable();
  const firmOr = firmNrOrFilter();
  // ISO içinde `:` / `.` var — PostgREST değerini çift tırnakla sar
  const nowQuoted = `"${new Date().toISOString()}"`;
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: REST_SELECT,
      is_active: 'eq.true',
      and: `(or(${firmOr}),or(start_date.is.null,start_date.lte.${nowQuoted}),or(end_date.is.null,end_date.gte.${nowQuoted}))`,
      order: 'priority.asc,name.asc',
      limit,
    },
    { schema: 'public' },
  );
  return (Array.isArray(rows) ? rows : [])
    .map(mapRestCampaignRow)
    .filter((r): r is CampaignDetail => r != null);
}

async function fetchActiveCampaignsViaBridge(limit: number): Promise<CampaignDetail[]> {
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

/** Dönem içi aktif kampanyalar (POS motoru) */
export async function fetchActiveCampaigns(limit = 100): Promise<CampaignDetail[]> {
  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      return await fetchActiveCampaignsViaPostgrest(limit);
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) throw e;
    }
  }
  if (!shouldUseBridgeSql(cfg)) {
    throw new Error(
      shouldPreferPostgrest(cfg)
        ? 'PostgREST aktif kampanya okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }
  return fetchActiveCampaignsViaBridge(limit);
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

function validateCampaignInput(input: CampaignInput): {
  name: string;
  discountType: string;
  discountValue: number;
  type: string;
  productIds: string[];
} {
  const name = input.name.trim();
  if (!name) throw new Error('Kampanya adı zorunludur');
  const discountType = normalizeDiscountType(input.discountType);
  const discountValue = Number(input.discountValue) || 0;
  if (discountValue < 0) throw new Error('İndirim değeri negatif olamaz');
  if (discountType === 'percentage' && discountValue > 100) {
    throw new Error('Yüzde indirim en fazla 100 olabilir');
  }
  const type = (input.type || discountType).trim() || discountType;
  return { name, discountType, discountValue, type, productIds: input.productIds ?? [] };
}

async function createCampaignViaRest(input: CampaignInput): Promise<CampaignDetail> {
  const { name, discountType, discountValue, type, productIds } = validateCampaignInput(input);
  const table = campaignsTable();
  const fn = firmNr();
  const id = newUuid();

  await postgrestPost(
    `/${table}`,
    {
      id,
      firm_nr: fn,
      name,
      description: (input.description ?? '').trim() || null,
      type,
      discount_type: discountType,
      discount_value: discountValue,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      is_active: input.active !== false,
      min_purchase_amount: Number(input.minPurchaseAmount) || 0,
      max_discount_amount:
        input.maxDiscountAmount != null && Number(input.maxDiscountAmount) > 0
          ? Number(input.maxDiscountAmount)
          : null,
      applicable_categories: (input.categoryId ?? '').trim() || null,
      applicable_products: productIds,
      priority: Number(input.priority) || 0,
    },
    { schema: 'public', prefer: 'return=minimal' },
  );

  const created = await fetchCampaignById(id);
  if (!created) throw new Error('Kampanya eklenemedi');
  return created;
}

async function createCampaignViaBridge(input: CampaignInput): Promise<CampaignDetail> {
  const { name, discountType, discountValue, type, productIds } = validateCampaignInput(input);
  const table = campaignsTable();
  const fn = firmNr();
  const id = newUuid();

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

export async function createCampaign(input: CampaignInput): Promise<CampaignDetail> {
  return runDataTransport({
    label: 'createCampaign',
    viaRest: () => createCampaignViaRest(input),
    viaBridge: () => createCampaignViaBridge(input),
  });
}

function buildCampaignPatch(input: Partial<CampaignInput>): Record<string, unknown> | null {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error('Kampanya adı zorunludur');
    body.name = name;
  }
  if (input.description !== undefined) {
    body.description = (input.description ?? '').trim() || null;
  }
  if (input.discountType !== undefined) {
    const discountType = normalizeDiscountType(input.discountType);
    body.discount_type = discountType;
    if (input.type === undefined) body.type = discountType;
  }
  if (input.type !== undefined) {
    body.type = String(input.type).trim() || 'percentage';
  }
  if (input.discountValue !== undefined) {
    const discountValue = Number(input.discountValue) || 0;
    if (discountValue < 0) throw new Error('İndirim değeri negatif olamaz');
    body.discount_value = discountValue;
  }
  if (input.startDate !== undefined) body.start_date = input.startDate || null;
  if (input.endDate !== undefined) body.end_date = input.endDate || null;
  if (input.active !== undefined) body.is_active = input.active;
  if (input.minPurchaseAmount !== undefined) {
    body.min_purchase_amount = Number(input.minPurchaseAmount) || 0;
  }
  if (input.maxDiscountAmount !== undefined) {
    body.max_discount_amount =
      input.maxDiscountAmount != null && Number(input.maxDiscountAmount) > 0
        ? Number(input.maxDiscountAmount)
        : null;
  }
  if (input.categoryId !== undefined) {
    body.applicable_categories = (input.categoryId ?? '').trim() || null;
  }
  if (input.productIds !== undefined) {
    body.applicable_products = input.productIds;
  }
  if (input.priority !== undefined) {
    body.priority = Number(input.priority) || 0;
  }

  if (Object.keys(body).length <= 1) return null;
  return body;
}

async function updateCampaignViaRest(
  id: string,
  input: Partial<CampaignInput>,
): Promise<CampaignDetail> {
  const body = buildCampaignPatch(input);
  if (!body) {
    const existing = await fetchCampaignById(id);
    if (!existing) throw new Error('Kampanya bulunamadı');
    return existing;
  }
  const table = campaignsTable();
  await postgrestPatch(`/${table}?id=eq.${encodeURIComponent(id)}`, body, {
    schema: 'public',
    prefer: 'return=minimal',
  });
  const updated = await fetchCampaignById(id);
  if (!updated) throw new Error('Kampanya güncellenemedi');
  return updated;
}

async function updateCampaignViaBridge(
  id: string,
  input: Partial<CampaignInput>,
): Promise<CampaignDetail> {
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

export async function updateCampaign(
  id: string,
  input: Partial<CampaignInput>,
): Promise<CampaignDetail> {
  if (!id) throw new Error('Kampanya id gerekli');
  return runDataTransport({
    label: 'updateCampaign',
    viaRest: () => updateCampaignViaRest(id, input),
    viaBridge: () => updateCampaignViaBridge(id, input),
  });
}

async function setCampaignActiveViaRest(id: string, active: boolean): Promise<boolean> {
  const table = campaignsTable();
  await postgrestPatch(
    `/${table}?id=eq.${encodeURIComponent(id)}`,
    { is_active: active, updated_at: new Date().toISOString() },
    { schema: 'public', prefer: 'return=minimal' },
  );
  const row = await fetchCampaignById(id);
  return row != null;
}

async function setCampaignActiveViaBridge(id: string, active: boolean): Promise<boolean> {
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

export async function setCampaignActive(id: string, active: boolean): Promise<boolean> {
  return runDataTransport({
    label: 'setCampaignActive',
    viaRest: () => setCampaignActiveViaRest(id, active),
    viaBridge: () => setCampaignActiveViaBridge(id, active),
  });
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
