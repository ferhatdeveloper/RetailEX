import { firmNr } from './erpTables';
import { pgQuery } from './pgClient';
import { postgrestGet, postgrestUpsert } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';

const KEY_RESTAURANT_PRINTERS = 'restaurant_printer_config';

export type RestaurantPrinterRouting = {
  id: string;
  categoryId: string;
  printerId: string;
  printerName?: string;
  printerType?: 'thermal' | 'standard';
  connectionType?: 'network' | 'usb' | 'serial' | 'system';
  address?: string;
};

export type RestaurantPrinterProfile = {
  id: string;
  name: string;
  type: 'thermal' | 'standard';
  connection: 'usb' | 'network' | 'bluetooth' | 'system';
  status?: 'online' | 'offline';
  lastUsed?: string;
  systemName?: string;
  address?: string;
  port?: number;
};

export type RestaurantPrinterConfig = {
  printerProfiles: RestaurantPrinterProfile[];
  printerRoutes: RestaurantPrinterRouting[];
  commonPrinterId?: string;
  printViaWindowsService?: boolean;
};

function parseConfigValue(raw: unknown): RestaurantPrinterConfig {
  const empty: RestaurantPrinterConfig = { printerProfiles: [], printerRoutes: [] };
  const value =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;

  if (!value || typeof value !== 'object') return empty;
  const v = value as Partial<RestaurantPrinterConfig>;
  return {
    printerProfiles: Array.isArray(v.printerProfiles) ? v.printerProfiles : [],
    printerRoutes: Array.isArray(v.printerRoutes) ? v.printerRoutes : [],
    commonPrinterId: typeof v.commonPrinterId === 'string' ? v.commonPrinterId : undefined,
    printViaWindowsService: v.printViaWindowsService !== false,
  };
}

async function getRestaurantPrinterConfigViaRest(fn: string): Promise<RestaurantPrinterConfig> {
  const rows = await postgrestGet<Array<{ value?: unknown }>>(
    '/app_settings',
    {
      select: 'value',
      key: `eq.${KEY_RESTAURANT_PRINTERS}`,
      firm_nr: `eq.${fn}`,
      limit: 1,
    },
    { schema: 'public' },
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row?.value != null ? parseConfigValue(row.value) : { printerProfiles: [], printerRoutes: [] };
}

async function getRestaurantPrinterConfigViaBridge(fn: string): Promise<RestaurantPrinterConfig> {
  const res = await pgQuery<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2 LIMIT 1`,
    [KEY_RESTAURANT_PRINTERS, fn],
  );
  return res.rows[0]?.value
    ? parseConfigValue(res.rows[0].value)
    : { printerProfiles: [], printerRoutes: [] };
}

export async function getRestaurantPrinterConfig(
  firmNrOverride?: string,
): Promise<RestaurantPrinterConfig> {
  const fn = firmNrOverride || firmNr() || '001';
  const empty: RestaurantPrinterConfig = { printerProfiles: [], printerRoutes: [] };
  try {
    return await runDataTransport({
      label: 'getRestaurantPrinterConfig',
      viaRest: () => getRestaurantPrinterConfigViaRest(fn),
      viaBridge: () => getRestaurantPrinterConfigViaBridge(fn),
    });
  } catch (e) {
    rethrowTransportInfra(e, 'getRestaurantPrinterConfig');
    console.warn('[restaurantPrinterConfigApi] get failed', e);
    return empty;
  }
}

function normalizeRestaurantPrinterConfig(
  data: RestaurantPrinterConfig,
): RestaurantPrinterConfig {
  return {
    printerProfiles: Array.isArray(data.printerProfiles) ? data.printerProfiles : [],
    printerRoutes: Array.isArray(data.printerRoutes) ? data.printerRoutes : [],
    commonPrinterId:
      typeof data.commonPrinterId === 'string' ? data.commonPrinterId : undefined,
    printViaWindowsService: data.printViaWindowsService === true,
  };
}

async function saveRestaurantPrinterConfigViaRest(
  fn: string,
  data: RestaurantPrinterConfig,
): Promise<void> {
  const normalized = normalizeRestaurantPrinterConfig(data);
  await postgrestUpsert(
    '/app_settings',
    {
      key: KEY_RESTAURANT_PRINTERS,
      value: normalized,
      firm_nr: fn,
    },
    'key,firm_nr',
    { schema: 'public', prefer: 'return=minimal' },
  );
}

async function saveRestaurantPrinterConfigViaBridge(
  fn: string,
  data: RestaurantPrinterConfig,
): Promise<void> {
  const normalized = normalizeRestaurantPrinterConfig(data);
  await pgQuery(
    `INSERT INTO app_settings (key, value, firm_nr)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key, firm_nr) DO UPDATE SET value = $2::jsonb`,
    [KEY_RESTAURANT_PRINTERS, JSON.stringify(normalized), fn],
  );
}

export async function saveRestaurantPrinterConfig(
  config: RestaurantPrinterConfig,
  firmNrOverride?: string,
): Promise<void> {
  const fn = firmNrOverride || firmNr() || '001';
  const normalized = normalizeRestaurantPrinterConfig(config);
  await runDataTransport({
    label: 'saveRestaurantPrinterConfig',
    viaRest: () => saveRestaurantPrinterConfigViaRest(fn, normalized),
    viaBridge: () => saveRestaurantPrinterConfigViaBridge(fn, normalized),
  });
}
