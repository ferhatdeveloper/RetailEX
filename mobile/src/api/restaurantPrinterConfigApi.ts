import { firmNr } from './erpTables';
import { pgQuery } from './pgClient';

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

export async function getRestaurantPrinterConfig(
  firmNrOverride?: string,
): Promise<RestaurantPrinterConfig> {
  const fn = firmNrOverride || firmNr() || '001';
  const empty: RestaurantPrinterConfig = { printerProfiles: [], printerRoutes: [] };
  try {
    const res = await pgQuery<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2 LIMIT 1`,
      [KEY_RESTAURANT_PRINTERS, fn],
    );
    return res.rows[0]?.value ? parseConfigValue(res.rows[0].value) : empty;
  } catch (e) {
    console.warn('[restaurantPrinterConfigApi] get failed', e);
    return empty;
  }
}
