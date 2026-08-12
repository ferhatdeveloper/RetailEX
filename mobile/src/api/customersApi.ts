import { pgQuery } from './pgClient';
import {
  postgrestEq,
  postgrestGet,
  postgrestPatch,
  postgrestPost,
  stripPostgrestOpPrefix,
} from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { customersTable, firmNr, newUuid } from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';
import {
  getCachedCustomers,
  saveCustomersSnapshot,
  upsertCustomerInCache,
} from '../offline/snapshotCache';
import { enqueueMutation, type CustomerInput } from '../offline/mutationQueue';
import { useConnectivityStore } from '../store/connectivityStore';
import {
  shouldPreferPostgrest,
  shouldUseBridgeSql,
  useConfigStore,
} from '../store/configStore';

export type CustomerRow = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  balance: number;
  is_active: boolean;
};

export type CustomerWriteOptions = {
  /** Senkron motoru: canlı zorunlu */
  forceLive?: boolean;
  /** Kuyruğa alma (flush sırasında) */
  skipQueue?: boolean;
  /** Offline create için sabit id */
  id?: string;
};

const REST_SELECT = 'id,code,name,phone,email,city,balance,is_active';

function mapCustomerRow(r: Record<string, unknown>): CustomerRow {
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    name: String(r.name ?? ''),
    phone: r.phone != null ? String(r.phone) : null,
    email: r.email != null ? String(r.email) : null,
    city: r.city != null ? String(r.city) : null,
    balance: Number(r.balance) || 0,
    is_active: !(r.is_active === false || r.is_active === 0 || String(r.is_active).toLowerCase() === 'false'),
  };
}

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

/** Web customers getAll/search — kart bakiyesi (ledger client-side opsiyonel) */
async function fetchCustomersViaPostgrest(search = '', limit = 200): Promise<CustomerRow[]> {
  const table = customersTable();
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const firmOr = [...Array.from(new Set([fn, fnBare].filter(Boolean))).map((f) => `firm_nr.eq.${f}`), 'firm_nr.is.null'].join(
    ',',
  );

  const query: Record<string, string | number> = {
    select: REST_SELECT,
    is_active: 'eq.true',
    order: 'name.asc',
    limit,
    or: `(${firmOr})`,
  };

  const q = escapeIlike(search.trim());
  if (q.length >= 1) {
    query.and = `(or(${firmOr}),or(name.ilike.*${q}*,code.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*))`;
    delete query.or;
  }

  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });
  return (Array.isArray(rows) ? rows : [])
    .map(mapCustomerRow)
    .filter((r) => r.is_active && r.id);
}

async function fetchCustomersLiveBridge(search = '', limit = 200): Promise<CustomerRow[]> {
  const table = customersTable();
  const fn = firmNr();
  const q = search.trim();

  const baseSelect = `
    SELECT id, code, name, phone, email, city,
           COALESCE(balance, 0)::float8 AS balance,
           COALESCE(is_active, true) AS is_active
    FROM ${table}
  `;

  if (q.length >= 1) {
    const like = `%${q}%`;
    const res = await pgQuery<CustomerRow>(
      `${baseSelect}
       WHERE COALESCE(is_active, true) = true
         AND (
           name ILIKE $1 OR code ILIKE $1 OR COALESCE(phone,'') ILIKE $1
           OR COALESCE(email,'') ILIKE $1
         )
         AND (
           LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2
           OR TRIM(COALESCE(firm_nr, '')) = $3
           OR firm_nr IS NULL
         )
       ORDER BY name ASC
       LIMIT $4`,
      [like, fn, fn.replace(/^0+/, '') || fn, limit],
    );
    return res.rows;
  }

  const res = await pgQuery<CustomerRow>(
    `${baseSelect}
     WHERE COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY name ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows;
}

async function fetchCustomersLive(search = '', limit = 200): Promise<CustomerRow[]> {
  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      const rows = await fetchCustomersViaPostgrest(search, limit);
      if (!search.trim()) await saveCustomersSnapshot(rows);
      return rows;
    } catch (e) {
      if (!canBridge) throw e;
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST cari okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  const rows = await fetchCustomersLiveBridge(search, limit);
  if (!search.trim()) await saveCustomersSnapshot(rows);
  return rows;
}

export async function fetchCustomers(search = '', limit = 200): Promise<CustomerRow[]> {
  if (!shouldUseLiveData()) {
    return getCachedCustomers(search, limit);
  }
  try {
    return await fetchCustomersLive(search, limit);
  } catch (e) {
    if (getNetworkPolicy() === 'online') throw e;
    const cached = await getCachedCustomers(search, limit);
    if (cached.length > 0) return cached;
    throw e;
  }
}

export type CustomerDetail = CustomerRow & {
  address?: string | null;
  tax_no?: string | null;
  tax_office?: string | null;
  district?: string | null;
  call_plan_enabled?: boolean;
  call_plan_weekdays?: number[];
  call_plan_note?: string | null;
  call_last_status?: string | null;
  call_last_note?: string | null;
  call_last_at?: string | null;
};

function mapCustomerDetailExtras(r: Record<string, unknown>): Partial<CustomerDetail> {
  const extras: Partial<CustomerDetail> = {
    address: r.address != null ? String(r.address) : null,
    tax_no:
      r.tax_no != null
        ? String(r.tax_no)
        : r.tax_nr != null
          ? String(r.tax_nr)
          : null,
    tax_office: r.tax_office != null ? String(r.tax_office) : null,
    district: r.district != null ? String(r.district) : null,
  };
  if ('call_plan_enabled' in r) {
    extras.call_plan_enabled =
      r.call_plan_enabled === true ||
      r.call_plan_enabled === 'true' ||
      r.call_plan_enabled === 1;
  }
  if ('call_plan_weekdays' in r) {
    const raw = r.call_plan_weekdays;
    extras.call_plan_weekdays = Array.isArray(raw)
      ? raw.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];
  }
  if ('call_plan_note' in r) {
    extras.call_plan_note = r.call_plan_note != null ? String(r.call_plan_note) : null;
  }
  if ('call_last_status' in r) {
    extras.call_last_status = r.call_last_status != null ? String(r.call_last_status) : null;
  }
  if ('call_last_note' in r) {
    extras.call_last_note = r.call_last_note != null ? String(r.call_last_note) : null;
  }
  if ('call_last_at' in r) {
    extras.call_last_at = r.call_last_at != null ? String(r.call_last_at) : null;
  }
  return extras;
}

const DETAIL_SELECT_WITH_CALL =
  'id,code,name,phone,email,city,balance,is_active,address,tax_nr,tax_office,district,call_plan_enabled,call_plan_weekdays,call_plan_note,call_last_status,call_last_note,call_last_at';
const DETAIL_SELECT_BASIC =
  'id,code,name,phone,email,city,balance,is_active,address,tax_nr,tax_office,district';

export async function fetchCustomerById(id: string): Promise<CustomerDetail | null> {
  if (!id) return null;

  if (!shouldUseLiveData()) {
    const rows = await getCachedCustomers('', 500);
    const hit = rows.find((r) => String(r.id) === String(id));
    return hit ? { ...hit } : null;
  }

  const table = customersTable();
  const cfg = useConfigStore.getState().config;

  if (shouldPreferPostgrest(cfg)) {
    try {
      let rows: Record<string, unknown>[] | null = null;
      try {
        rows = await postgrestGet<Record<string, unknown>[]>(
          `/${table}`,
          {
            select: DETAIL_SELECT_WITH_CALL,
            id: postgrestEq(id),
            limit: 1,
          },
          { schema: 'public' },
        );
      } catch {
        rows = await postgrestGet<Record<string, unknown>[]>(
          `/${table}`,
          {
            select: DETAIL_SELECT_BASIC,
            id: postgrestEq(id),
            limit: 1,
          },
          { schema: 'public' },
        );
      }
      const r = Array.isArray(rows) ? rows[0] : null;
      if (r) {
        return {
          ...mapCustomerRow(r),
          ...mapCustomerDetailExtras(r),
        };
      }
    } catch {
      if (!shouldUseBridgeSql(cfg)) {
        const cached = await getCachedCustomers('', 500);
        const hit = cached.find((r) => String(r.id) === String(id));
        return hit ? { ...hit } : null;
      }
    }
  }

  try {
    try {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id, code, name, phone, email, city,
                COALESCE(balance, 0)::float8 AS balance,
                COALESCE(is_active, true) AS is_active,
                address, tax_nr AS tax_no, tax_office, district,
                COALESCE(call_plan_enabled, false) AS call_plan_enabled,
                COALESCE(call_plan_weekdays, ARRAY[]::int[]) AS call_plan_weekdays,
                call_plan_note, call_last_status, call_last_note,
                call_last_at::text AS call_last_at
         FROM ${table}
         WHERE id::text = $1
         LIMIT 1`,
        [id],
      );
      const r = res.rows[0];
      if (!r) return null;
      return {
        ...mapCustomerRow(r),
        ...mapCustomerDetailExtras(r),
        balance: Number(r.balance) || 0,
        is_active: !(r.is_active === false || r.is_active === 0),
      };
    } catch {
      try {
        const res = await pgQuery<CustomerDetail>(
          `SELECT id, code, name, phone, email, city,
                  COALESCE(balance, 0)::float8 AS balance,
                  COALESCE(is_active, true) AS is_active,
                  address, tax_nr AS tax_no, tax_office, district
           FROM ${table}
           WHERE id::text = $1
           LIMIT 1`,
          [id],
        );
        return res.rows[0] ?? null;
      } catch {
        const res = await pgQuery<CustomerDetail>(
          `SELECT id, code, name, phone, email, city,
                  COALESCE(balance, 0)::float8 AS balance,
                  COALESCE(is_active, true) AS is_active
           FROM ${table}
           WHERE id::text = $1
           LIMIT 1`,
          [id],
        );
        return res.rows[0] ?? null;
      }
    }
  } catch {
    const rows = await getCachedCustomers('', 500);
    const hit = rows.find((r) => String(r.id) === String(id));
    return hit ? { ...hit } : null;
  }
}

export type { CustomerInput };

function nextMCode(last: string | null | undefined): string {
  if (!last) return 'M001';
  const num = parseInt(String(last).slice(1), 10);
  if (Number.isNaN(num)) return 'M001';
  return `M${String(num + 1).padStart(3, '0')}`;
}

/** Web customerAPI.generateCode ile aynı M001 deseni (PostgREST önce) */
export async function generateCustomerCode(): Promise<string> {
  if (!shouldUseLiveData()) {
    const cached = await getCachedCustomers('', 500);
    const codes = cached
      .map((c) => c.code)
      .filter((c): c is string => !!c && /^M\d+/i.test(c));
    if (!codes.length) return 'M001';
    const nums = codes.map((c) => parseInt(String(c).slice(1), 10)).filter((n) => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 0;
    return `M${String(max + 1).padStart(3, '0')}`;
  }

  const table = customersTable();
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const cfg = useConfigStore.getState().config;

  if (shouldPreferPostgrest(cfg)) {
    try {
      const firmOr = Array.from(new Set([fn, fnBare].filter(Boolean)))
        .map((f) => `firm_nr.eq.${f}`)
        .concat('firm_nr.is.null')
        .join(',');
      const rows = await postgrestGet<Array<{ code?: string | null }>>(
        `/${table}`,
        {
          select: 'code',
          and: `(or(${firmOr}),code.like.M*)`,
          order: 'code.desc',
          limit: 40,
        },
        { schema: 'public' },
      );
      const last = (Array.isArray(rows) ? rows : [])
        .map((r) => String(r.code || ''))
        .find((c) => /^M\d+/i.test(c));
      return nextMCode(last);
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) {
        return `M${Date.now().toString().slice(-3)}`;
      }
      if (__DEV__) {
        console.warn(
          '[generateCustomerCode] PostgREST → bridge',
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  if (!shouldUseBridgeSql(cfg)) {
    return `M${Date.now().toString().slice(-3)}`;
  }

  try {
    const res = await pgQuery<{ code: string | null }>(
      `SELECT code FROM ${table}
       WHERE (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
       AND code LIKE 'M%'
       ORDER BY code DESC
       LIMIT 1`,
      [fn, fnBare],
    );
    return nextMCode(res.rows[0]?.code);
  } catch {
    return `M${Date.now().toString().slice(-3)}`;
  }
}

async function createCustomerViaPostgrest(input: CustomerInput, id: string): Promise<string> {
  const table = customersTable();
  const fn = firmNr();
  const code = (input.code || '').trim() || (await generateCustomerCode());
  const body: Record<string, unknown> = {
    id,
    firm_nr: fn,
    code,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    district: input.district?.trim() || null,
    tax_nr: input.tax_nr?.trim() || null,
    tax_office: input.tax_office?.trim() || null,
    notes: input.notes?.trim() || null,
    is_active: true,
    balance: 0,
    points: 0,
    total_spent: 0,
  };
  const rows = await postgrestPost<Record<string, unknown>[]>(`/${table}`, body, {
    schema: 'public',
    prefer: 'return=representation',
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.id != null ? String(row.id) : id;
}

async function createCustomerViaBridge(input: CustomerInput, id: string): Promise<string> {
  const table = customersTable();
  const fn = firmNr();
  const code = (input.code || '').trim() || (await generateCustomerCode());

  await pgQuery(
    `INSERT INTO ${table} (
       id, firm_nr, code, name, phone, email, address, city, district,
       tax_nr, tax_office, notes, is_active, balance, points, total_spent
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, true, 0, 0, 0
     )`,
    [
      id,
      fn,
      code,
      input.name.trim(),
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.address?.trim() || null,
      input.city?.trim() || null,
      input.district?.trim() || null,
      input.tax_nr?.trim() || null,
      input.tax_office?.trim() || null,
      input.notes?.trim() || null,
    ],
  );
  return id;
}

async function createCustomerLive(input: CustomerInput, id: string): Promise<string> {
  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      return await createCustomerViaPostgrest(input, id);
    } catch (e) {
      if (!canBridge) throw e;
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST cari kaydı başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  return createCustomerViaBridge(input, id);
}

export async function createCustomer(
  input: CustomerInput,
  opts?: CustomerWriteOptions,
): Promise<string> {
  const id = opts?.id || newUuid();
  const live = opts?.forceLive === true || shouldUseLiveData();

  if (!live && !opts?.skipQueue) {
    await enqueueMutation({
      type: 'customer.create',
      payload: { localId: id, input: { ...input } },
    });
    await upsertCustomerInCache({
      id,
      code: input.code?.trim() || null,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
      balance: 0,
      is_active: true,
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return id;
  }

  const savedId = await createCustomerLive(input, id);
  await upsertCustomerInCache({
    id: savedId,
    code: input.code?.trim() || null,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    city: input.city?.trim() || null,
    balance: 0,
    is_active: true,
  });
  return savedId;
}

function buildCustomerPatchBody(input: Partial<CustomerInput>): Record<string, unknown> {
  const map: Record<keyof CustomerInput, string> = {
    code: 'code',
    name: 'name',
    phone: 'phone',
    email: 'email',
    city: 'city',
    district: 'district',
    address: 'address',
    tax_nr: 'tax_nr',
    tax_office: 'tax_office',
    notes: 'notes',
  };
  const body: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(map) as [keyof CustomerInput, string][]) {
    const v = input[key];
    if (v === undefined) continue;
    body[col] = typeof v === 'string' ? v.trim() || null : v;
  }
  return body;
}

async function updateCustomerLive(id: string, input: Partial<CustomerInput>): Promise<void> {
  const body = buildCustomerPatchBody(input);
  if (!Object.keys(body).length) return;

  const rawId = stripPostgrestOpPrefix(String(id));
  const table = customersTable();
  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      await postgrestPatch(`/${table}?id=eq.${encodeURIComponent(rawId)}`, body, {
        schema: 'public',
        prefer: 'return=minimal',
      });
      return;
    } catch (e) {
      if (!canBridge) throw e;
      if (__DEV__) {
        console.warn(
          '[updateCustomer] PostgREST → bridge',
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST cari güncelleme başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [col, v] of Object.entries(body)) {
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  }
  vals.push(rawId);
  await pgQuery(`UPDATE ${table} SET ${sets.join(', ')} WHERE id::text = $${i}`, vals);
}

export async function updateCustomer(
  id: string,
  input: Partial<CustomerInput>,
  opts?: CustomerWriteOptions,
): Promise<void> {
  if (!id) throw new Error('Cari id gerekli');
  const live = opts?.forceLive === true || shouldUseLiveData();

  if (!live && !opts?.skipQueue) {
    await enqueueMutation({
      type: 'customer.update',
      payload: { customerId: id, input: { ...input } },
    });
    const existing = (await getCachedCustomers('', 500)).find((r) => String(r.id) === String(id));
    await upsertCustomerInCache({
      id,
      code: input.code !== undefined ? input.code.trim() || null : existing?.code ?? null,
      name: input.name !== undefined ? input.name.trim() : existing?.name ?? '',
      phone: input.phone !== undefined ? input.phone.trim() || null : existing?.phone ?? null,
      email: input.email !== undefined ? input.email.trim() || null : existing?.email ?? null,
      city: input.city !== undefined ? input.city.trim() || null : existing?.city ?? null,
      balance: existing?.balance ?? 0,
      is_active: existing?.is_active ?? true,
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return;
  }

  await updateCustomerLive(id, input);
  const existing = (await getCachedCustomers('', 500)).find((r) => String(r.id) === String(id));
  await upsertCustomerInCache({
    id,
    code: input.code !== undefined ? input.code.trim() || null : existing?.code ?? null,
    name: input.name !== undefined ? input.name.trim() : existing?.name ?? '',
    phone: input.phone !== undefined ? input.phone.trim() || null : existing?.phone ?? null,
    email: input.email !== undefined ? input.email.trim() || null : existing?.email ?? null,
    city: input.city !== undefined ? input.city.trim() || null : existing?.city ?? null,
    balance: existing?.balance ?? 0,
    is_active: existing?.is_active ?? true,
  });
}

export async function fetchCustomerRecentSales(
  customerId: string,
  limit = 20,
): Promise<{ id: string; fiche_no: string | null; date: string | null; net_amount: number }[]> {
  if (!shouldUseLiveData()) return [];
  if (!customerId) return [];

  return runDataTransport({
    label: 'fetchCustomerRecentSales',
    viaRest: () => fetchCustomerRecentSalesViaRest(customerId, limit),
    viaBridge: () => fetchCustomerRecentSalesViaBridge(customerId, limit),
  });
}

async function fetchCustomerRecentSalesViaRest(
  customerId: string,
  limit: number,
): Promise<{ id: string; fiche_no: string | null; date: string | null; net_amount: number }[]> {
  const { salesTable } = await import('./erpTables');
  const table = salesTable();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      customer_id: postgrestEq(customerId),
      is_cancelled: 'eq.false',
      select: 'id,fiche_no,date,net_amount,total_net',
      order: 'date.desc',
      limit,
    },
    { schema: 'public' },
  );
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: String(r.id ?? ''),
    fiche_no: r.fiche_no != null ? String(r.fiche_no) : null,
    date: r.date != null ? String(r.date).slice(0, 10) : null,
    net_amount: Number(r.net_amount ?? r.total_net ?? 0) || 0,
  }));
}

async function fetchCustomerRecentSalesViaBridge(
  customerId: string,
  limit: number,
): Promise<{ id: string; fiche_no: string | null; date: string | null; net_amount: number }[]> {
  const { salesTable } = await import('./erpTables');
  const table = salesTable();
  try {
    const res = await pgQuery<{
      id: string;
      fiche_no: string | null;
      date: string | null;
      net_amount: number;
    }>(
      `SELECT id, fiche_no, date::text AS date,
              COALESCE(net_amount, total_net, 0)::float8 AS net_amount
       FROM ${table}
       WHERE customer_id::text = $1
         AND COALESCE(is_cancelled, false) = false
       ORDER BY date DESC NULLS LAST
       LIMIT $2`,
      [customerId, limit],
    );
    return res.rows;
  } catch {
    return [];
  }
}
