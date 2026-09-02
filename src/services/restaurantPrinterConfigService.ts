/**
 * Restoran mutfak yazıcı profilleri ve kategori rotaları — app_settings (firma bazlı).
 */
import { postgres, ERP_SETTINGS } from './postgres';
import type { PrinterProfile, PrinterRouting } from '../components/restaurant/types';

const KEY_RESTAURANT_PRINTERS = 'restaurant_printer_config';

export type RestaurantPrinterConfig = {
  printerProfiles: PrinterProfile[];
  printerRoutes: PrinterRouting[];
  commonPrinterId?: string;
  printViaWindowsService?: boolean;
};

// PG'den okunan değer boş ise veya kısmi ise, varsayılan olarak
// printViaWindowsService=true kabul edilir (migration 126 + restoran modülü
// varsayılanı). Yalnızca explicit false durumunda kapatılır.
function normalizeConfig(v: Partial<RestaurantPrinterConfig> | null | undefined): RestaurantPrinterConfig {
  if (!v) {
    return { printerProfiles: [], printerRoutes: [], printViaWindowsService: true };
  }
  return {
    printerProfiles: Array.isArray(v.printerProfiles) ? v.printerProfiles : [],
    printerRoutes: Array.isArray(v.printerRoutes) ? v.printerRoutes : [],
    commonPrinterId: v.commonPrinterId,
    printViaWindowsService: v.printViaWindowsService !== false,
  };
}

export async function getRestaurantPrinterConfig(firmNr?: string): Promise<RestaurantPrinterConfig> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  const empty: RestaurantPrinterConfig = {
    printerProfiles: [],
    printerRoutes: [],
    printViaWindowsService: true,
  };
  try {
    const { rows } = await postgres.query<{ value: RestaurantPrinterConfig }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      [KEY_RESTAURANT_PRINTERS, fn]
    );
    if (rows.length > 0 && rows[0].value) {
      const v = rows[0].value as RestaurantPrinterConfig;
      return normalizeConfig(v);
    }
  } catch (e) {
    console.warn('[restaurantPrinterConfig] get failed', e);
  }
  return empty;
}

export async function saveRestaurantPrinterConfig(data: RestaurantPrinterConfig, firmNr?: string): Promise<void> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  await postgres.query(
    `INSERT INTO app_settings (key, value, firm_nr)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key, firm_nr) DO UPDATE SET value = $2::jsonb`,
    [KEY_RESTAURANT_PRINTERS, JSON.stringify(data), fn]
  );
}
