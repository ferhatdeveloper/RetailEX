import { firmNr } from './erpTables';
import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
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
    printViaWindowsService: v.printViaWindowsService === true,
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
