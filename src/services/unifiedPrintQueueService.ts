import { ERP_SETTINGS, DB_SETTINGS, postgres } from './postgres';
import { getRestaurantPrinterConfig } from './restaurantPrinterConfigService';

export type UnifiedPrintJobType =
  | 'kitchen_ticket'
  | 'escpos_raw'
  | 'html_document'
  | 'pos_receipt_80'
  | 'account_receipt'
  | 'invoice_a4'
  | 'product_label'
  | 'fastreport_template'
  | 'fastreport_frx'
  | 'test_page'
  | 'report_html'
  | 'price_change_voucher';

export type PrintJobConnection = 'network' | 'system' | 'auto' | string;

export type EnqueuePrintJobParams = {
  jobType: UnifiedPrintJobType;
  connection?: PrintJobConnection | null;
  address?: string | null;
  port?: number | null;
  printerName?: string | null;
  printerProfileId?: string | null;
  payload: Record<string, unknown>;
  locale?: string | null;
  copies?: number | null;
  refType?: string | null;
  refId?: string | null;
  sourceSystem?: string | null;
  priority?: number | null;
};

export type EnqueueFastReportTemplateJobParams = Omit<EnqueuePrintJobParams, 'jobType' | 'payload'> & {
  templateId: string;
  data: Record<string, unknown>;
  type?: 'invoice' | 'label' | 'kitchen' | 'receipt' | 'voucher';
};

export type EnqueueFastReportFrxJobParams = Omit<EnqueuePrintJobParams, 'jobType' | 'payload'> & {
  designId: string;
  designName?: string | null;
  data: Record<string, unknown>;
  scope?: string | null;
};

export type EnqueueHtmlDocumentJobParams = Omit<EnqueuePrintJobParams, 'jobType' | 'payload'> & {
  html: string;
  paperHint?: string | null;
};

export type EnqueueEscposRawJobParams = Omit<EnqueuePrintJobParams, 'jobType' | 'payload'> & {
  escposBase64: string;
  address: string;
  port?: number | null;
};

function currentSourceDb(): 'local' | 'remote' {
  return DB_SETTINGS.activeMode === 'online' ? 'remote' : 'local';
}

function normalizePositiveInt(value: number | null | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function normalizePriority(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.floor(n);
}

function asSettingsObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function isGlobalPrinterServiceEnabled(): Promise<boolean> {
  try {
    const firmNr = ERP_SETTINGS.firmNr || '001';
    const { rows } = await postgres.query<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      ['printer_service', firmNr],
    );
    const settings = asSettingsObject(rows[0]?.value);
    return settings?.enabled === true;
  } catch (error) {
    console.warn('[unifiedPrintQueue] global printer_service read failed', error);
    return false;
  }
}

export async function isWindowsPrinterServiceEnabled(): Promise<boolean> {
  const [restaurantConfig, globalEnabled] = await Promise.all([
    getRestaurantPrinterConfig().catch(() => null),
    isGlobalPrinterServiceEnabled(),
  ]);
  return restaurantConfig?.printViaWindowsService === true || globalEnabled;
}

const ensuredPrintQueueKeys = new Set<string>();

function currentFirmPeriod(): { firm: string; period: string; key: string } {
  const firm = String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
  const period = String(ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
  return { firm, period, key: `${firm}:${period}` };
}

function isMissingRelationOrFunction(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /42P01|42883|does not exist/i.test(msg);
}

/** 109/110 atlanmış yerel veya yeni dönem DB'lerinde kuyruk tablolarını oluşturur. */
export async function ensurePrintQueueTables(): Promise<void> {
  const { firm, period, key } = currentFirmPeriod();
  if (ensuredPrintQueueKeys.has(key)) return;

  try {
    await postgres.query('SELECT public.INIT_RESTAURANT_PRINT_JOBS_TABLE($1::varchar, $2::varchar)', [
      firm,
      period,
    ]);
    ensuredPrintQueueKeys.add(key);
    return;
  } catch (error) {
    if (!isMissingRelationOrFunction(error)) throw error;
  }

  await postgres.query('CREATE SCHEMA IF NOT EXISTS rest');
  const printJobs = postgres.getMovementTableName('print_jobs', 'rest');
  const kitchenJobs = postgres.getMovementTableName('kitchen_print_jobs', 'rest');
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS ${printJobs} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type VARCHAR(40) NOT NULL DEFAULT 'kitchen_ticket',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      priority INT NOT NULL DEFAULT 100,
      connection TEXT,
      address TEXT,
      port INT,
      printer_name TEXT,
      printer_profile_id TEXT,
      locale TEXT DEFAULT 'tr',
      copies INT NOT NULL DEFAULT 1,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ref_type TEXT,
      ref_id TEXT,
      attempts INT DEFAULT 0,
      last_error TEXT,
      claimed_by TEXT,
      claimed_at TIMESTAMPTZ,
      printed_at TIMESTAMPTZ,
      source_system TEXT,
      source_db TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await postgres.query(`
    CREATE TABLE IF NOT EXISTS ${kitchenJobs} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_type VARCHAR(40) NOT NULL DEFAULT 'kitchen_ticket',
      kitchen_order_id UUID,
      order_id UUID,
      printer_profile_id TEXT,
      printer_name TEXT,
      connection TEXT,
      address TEXT,
      port INT,
      locale TEXT DEFAULT 'tr',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      claimed_by TEXT,
      claimed_at TIMESTAMPTZ,
      printed_at TIMESTAMPTZ,
      source_system TEXT,
      source_db TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
  ensuredPrintQueueKeys.add(key);
}

export async function enqueuePrintJob(params: EnqueuePrintJobParams): Promise<{ id?: string }> {
  await ensurePrintQueueTables();
  const jobsTable = postgres.getMovementTableName('print_jobs', 'rest');
  const payload = params.payload && typeof params.payload === 'object' ? params.payload : {};
  const { rows } = await postgres.query<{ id: string }>(
    `INSERT INTO ${jobsTable}
      (job_type, status, priority, connection, address, port, printer_name, printer_profile_id,
       locale, copies, payload, ref_type, ref_id, source_system, source_db)
     VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
     RETURNING id`,
    [
      params.jobType,
      normalizePriority(params.priority),
      params.connection ?? null,
      params.address ?? null,
      params.port ?? null,
      params.printerName ?? null,
      params.printerProfileId ?? null,
      params.locale ?? 'tr',
      normalizePositiveInt(params.copies, 1),
      JSON.stringify(payload),
      params.refType ?? null,
      params.refId ?? null,
      params.sourceSystem ?? 'web',
      currentSourceDb(),
    ],
  );
  return { id: rows[0]?.id };
}

export async function enqueueFastReportTemplateJob(params: EnqueueFastReportTemplateJobParams): Promise<{ id?: string }> {
  return enqueuePrintJob({
    ...params,
    jobType: 'fastreport_template',
    payload: {
      kind: 'fastreport_template',
      templateId: params.templateId,
      templateType: params.type ?? 'invoice',
      data: params.data,
      engine: 'fastreport-like',
    },
  });
}

export async function enqueueFastReportFrxJob(params: EnqueueFastReportFrxJobParams): Promise<{ id?: string }> {
  return enqueuePrintJob({
    ...params,
    jobType: 'fastreport_frx',
    payload: {
      kind: 'fastreport_frx',
      designId: params.designId,
      designName: params.designName ?? null,
      scope: params.scope ?? null,
      data: params.data,
    },
  });
}

export async function enqueueHtmlDocumentJob(params: EnqueueHtmlDocumentJobParams): Promise<{ id?: string }> {
  return enqueuePrintJob({
    ...params,
    jobType: 'html_document',
    payload: {
      kind: 'html_document',
      html: params.html,
      paperHint: params.paperHint ?? null,
    },
  });
}

export async function enqueueEscposRawJob(params: EnqueueEscposRawJobParams): Promise<{ id?: string }> {
  return enqueuePrintJob({
    ...params,
    jobType: 'escpos_raw',
    connection: params.connection ?? 'network',
    port: params.port ?? 9100,
    payload: {
      kind: 'escpos_raw',
      escposBase64: params.escposBase64,
    },
  });
}
